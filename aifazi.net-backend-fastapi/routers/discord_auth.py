"""
routers/discord_auth.py — Discord OAuth2 login for public players
─────────────────────────────────────────────────────────────────
Flow:
  1. GET  /api/discord/login          → redirect to Discord OAuth
  2. GET  /api/discord/callback       → exchange code → upsert discord_users → JWT → redirect to /profile
  3. GET  /api/discord/me             → return current player profile (JWT required)
  4. POST /api/discord/logout         → clear session
  5. GET  /api/discord/whitelist-status → return player's whitelist application status

Vercel env vars required:
  DISCORD_CLIENT_ID       — from discord.com/developers
  DISCORD_CLIENT_SECRET   — from discord.com/developers
  FRONTEND_URL            — https://aifazi.net
  PASETO_SECRET           — already set
"""

import os
import urllib.parse as _urlparse
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials

from database import supabase
from dependencies import CookieHTTPBearer
from jwt_compat import JWTError, jwt
from utils.email import render_template
from utils.email_queue import queue_email
from utils.oauth_state import _safe_relative_path, make_oauth_state, verify_oauth_state_full

from utils.oauth_providers import provider_cfg as _provider_cfg

router = APIRouter()

# ── Config (portal overrides env via utils.oauth_providers) ────────────────────
def _discord():
    return _provider_cfg("discord")


def _client_id() -> str:
    return _discord().get("client_id") or ""


def _client_secret() -> str:
    return _discord().get("client_secret") or ""


FRONTEND_URL          = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
API_URL               = os.getenv("API_URL", "https://api.aifazi.net").rstrip("/")
REDIRECT_URI          = f"{API_URL}/api/discord/callback"
COOKIE_DOMAIN         = os.getenv("COOKIE_DOMAIN", "")
_ENV_NAME             = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "production").lower()
_IS_PROD              = _ENV_NAME == "production"

# Signing key for short-lived Discord mobile deep-link JWTs. Historically named
# JWT_SECRET locally but always read from PASETO_SECRET — keep that mapping.
PASETO_SIGNING_KEY = os.getenv("PASETO_SECRET", "")
JWT_ALGO    = "HS256"
JWT_EXPIRE  = 60 * 24 * 7   # 7 days in minutes

# Mobile deep-link base shared with the site routers (auth_discord,
# github_auth, steam_auth, authentik_oidc) and the app OAUTH_REDIRECT_BASE.
# Player mobile redirects MUST live under it or parseOAuthRedirect drops them.
MOBILE_AUTH_URL = os.getenv("MOBILE_AUTH_URL", "aifazi:///oauth/callback").rstrip("/")

DISCORD_API = "https://discord.com/api/v10"

bearer = CookieHTTPBearer(auto_error=False)

# R7-4 — the player JWT shares the HttpOnly `auth_token` cookie name with the
# forum PASETO session (CookieHTTPBearer reads that cookie everywhere), so the
# token must be unmistakable: a purpose marker plus audience, enforced on every
# decode. Cookie name is intentionally unchanged — ForumContext cookie-restore,
# DiscordAuthCallback, and the whitelist-status flows all depend on it.
# TTL stays 7d: apps/mobile has zero consumers of the player endpoints and the
# web whitelist flows poll status across days; purpose/aud binding (not a
# shorter TTL) is the fix for cross-context confusion.
_DISCORD_PLAYER_AUD = "discord-player"

# ── Helpers ───────────────────────────────────────────────────────────────────
def _make_player_token(user: dict) -> str:
    payload = {
        "sub":          str(user["discord_id"]),
        "discord_id":   str(user["discord_id"]),
        "username":     user["username"],
        "avatar":       user.get("avatar") or "",
        "role":         "player",
        "purpose":      "discord_player",
        "aud":          _DISCORD_PLAYER_AUD,
        "exp":          datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE),
    }
    return jwt.encode(payload, PASETO_SIGNING_KEY, algorithm=JWT_ALGO)

def _decode_player_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, PASETO_SIGNING_KEY, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid or expired Discord session")
    # R7-4 — jwt_compat.decode ignores `audience` (PASETO backend), so enforce
    # both claims manually: a forum access token (purpose "auth") or any other
    # JWT sharing this cookie must never pass as a player session.
    if payload.get("purpose") != "discord_player" or payload.get("aud") != _DISCORD_PLAYER_AUD:
        raise HTTPException(401, "Invalid or expired Discord session")
    return payload

def _get_player(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "Discord login required")
    payload = _decode_player_token(creds.credentials)
    if payload.get("role") != "player":
        raise HTTPException(403, "Player token required")
    return payload

def _upsert_discord_user(discord_user: dict) -> tuple[dict, bool]:
    """Upsert player into discord_users table.
    Returns (row, is_new) — is_new=True on first sign-up."""
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "discord_id":    str(discord_user["id"]),
        "username":      discord_user.get("global_name") or discord_user.get("username", ""),
        "discriminator": discord_user.get("discriminator", "0"),
        "avatar":        discord_user.get("avatar") or "",
        "email":         discord_user.get("email") or "",
        "last_login":    now,
    }
    existing = supabase.table("discord_users").select("id,created_at").eq("discord_id", row["discord_id"]).execute()
    if existing.data:
        supabase.table("discord_users") \
            .update({k: v for k, v in row.items() if k != "discord_id"}) \
            .eq("discord_id", row["discord_id"]).execute()
        row["created_at"] = existing.data[0].get("created_at", now)
        return row, False
    else:
        row["created_at"] = now
        supabase.table("discord_users").insert(row).execute()
        return row, True


async def _send_discord_welcome(email: str, username: str):
    """Send welcome email to a newly registered Discord user (fire-and-forget).
    Uses the 'discord_welcome' mail template if configured, else a built-in fallback."""
    if not email:
        return
    subject, html = render_template("discord_welcome", {
        "username":     username,
        "frontend_url": FRONTEND_URL,
    })
    if not subject:
        subject = f"Welcome to AIFAZI RP, {username}!"
        html = (
            f"<h2>Welcome, {username}!</h2>"
            f"<p>Your Discord account has been linked to <strong>AIFAZI RP</strong>.</p>"
            f"<p>You can now <a href='{FRONTEND_URL}/whitelist'>apply for whitelist</a> "
            f"and check your application status at any time.</p>"
            f"<p>See you in the city! 🌆</p>"
        )
    await queue_email(email, subject, html, "", "discord_welcome")

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/login")
async def discord_login(redirect: str = ""):
    """Redirect player to Discord OAuth consent screen.

    C2 — `redirect` is now signed into the OAuth state via HMAC so the callback can
    verify state integrity + reject open-redirect attempts.
    """
    if not _client_id():
        raise HTTPException(503, "Discord OAuth not configured — set it in Admin → Identity & OAuth")
    safe_dest = _safe_relative_path(redirect, default="/profile")
    state = make_oauth_state("discord", safe_dest)
    params = _urlparse.urlencode({
        "client_id":     _client_id(),
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         "identify email",
        "state":         state,
    })
    return RedirectResponse(f"https://discord.com/oauth2/authorize?{params}")

@router.get("/callback")
async def discord_callback(code: str = "", error: str = "", state: str = ""):
    """Handle Discord OAuth callback, issue JWT, redirect to frontend."""
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=1")

    # C2 — verify the signed OAuth state BEFORE trusting any dest. Fail closed.
    try:
        state_info = verify_oauth_state_full(state or "", "discord")
        dest = state_info["dest"]
        mobile = state_info.get("mobile", False)
    except ValueError:
        return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=state")

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            f"{DISCORD_API}/oauth2/token",
            data={
                "client_id":     _client_id(),
                "client_secret": _client_secret(),
                "grant_type":    "authorization_code",
                "code":          code,
                "redirect_uri":  REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=2")
        token_data = token_resp.json()
        access_token = token_data.get("access_token", "")

        # Fetch Discord user info
        user_resp = await client.get(
            f"{DISCORD_API}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=3")
        discord_user = user_resp.json()

    # Upsert into Supabase
    try:
        db_user, is_new = _upsert_discord_user(discord_user)
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=db")

    # Send welcome email to brand-new Discord signups (queued, reliable on serverless)
    if is_new and db_user.get("email"):
        await _send_discord_welcome(db_user["email"], db_user["username"])

    # Mobile deep link — H2/C6: one-time exchange code in the fragment (never
    # a token) so OS intent logs / proxy access logs capture no credential.
    # The app exchanges it via POST /api/auth/mobile/exchange. Issue failure
    # fails closed — no token-in-URL fallback.
    if mobile:
        safe_dest = _safe_relative_path(dest)
        try:
            from utils.mobile_oauth_codes import app_state_from, issue_code, mobile_fragment, state_echo
            one_time_code = issue_code(
                "discord", str(db_user["discord_id"]), db_user.get("username") or "",
                "player", safe_dest, kind="discord_player",
                app_state=app_state_from(state_info.get("extra")),
            )
        except Exception:
            return RedirectResponse(f"{MOBILE_AUTH_URL}/discord?discord_error=db")
        return RedirectResponse(
            MOBILE_AUTH_URL + "/discord" + mobile_fragment(one_time_code, safe_dest)
            + state_echo(state_info.get("extra"))
        )

    # Issue JWT
    jwt_token = _make_player_token(db_user)

    # Web — set HttpOnly cookie (primary) + keep hash for legacy clients; frontend
    # prefers cookie via /auth/me and clears hash immediately. Token never in query.
    resp = RedirectResponse(FRONTEND_URL + "/auth/discord#dest=" + _urlparse.quote(_safe_relative_path(dest), safe='/'))
    resp.set_cookie(
        key="auth_token", value=jwt_token, httponly=True,
        secure=_IS_PROD, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=JWT_EXPIRE * 60, path="/",
    )
    return resp

@router.get("/me")
async def discord_me(player: dict = Depends(_get_player)):
    """Return current player's profile + whitelist application status."""
    discord_id = player["discord_id"]

    # Get player row
    user_res = supabase.table("discord_users").select("*").eq("discord_id", discord_id).execute()
    user_row = user_res.data[0] if user_res.data else {}

    # Get whitelist application
    wl_res = supabase.table("fivem_whitelist") \
        .select("id,status,txadmin_synced,character_name,created_at,reviewed_at,approved_at,reviewer_note") \
        .eq("discord_id", discord_id) \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    whitelist = wl_res.data[0] if wl_res.data else None

    return {
        "discord_id":   discord_id,
        "username":     player.get("username", ""),
        "avatar":       player.get("avatar", ""),
        "created_at":   user_row.get("created_at"),
        "last_login":   user_row.get("last_login"),
        "fivem_id":     user_row.get("fivem_id"),
        "whitelist":    whitelist,
    }

@router.post("/logout")
async def discord_logout():
    """Logout — client should clear the token from sessionStorage."""
    return {"ok": True}

@router.get("/my-application")
async def my_application(player: dict = Depends(_get_player)):
    """Return the current player's most recent whitelist application with full details."""
    discord_id = player["discord_id"]
    wl_res = supabase.table("fivem_whitelist") \
        .select("id,status,txadmin_synced,character_name,fivem_id,discord_id,discord_name,created_at,reviewed_at,approved_at,reviewer_note,reviewed_by") \
        .eq("discord_id", discord_id) \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    if not wl_res.data:
        return None
    app = wl_res.data[0]
    # Enrich status display
    if app["status"] == "approved" and not app.get("txadmin_synced"):
        app["display_status"] = "syncing"
    elif app["status"] == "approved" and app.get("txadmin_synced"):
        app["display_status"] = "active"
    else:
        app["display_status"] = app["status"]
    return app

@router.get("/whitelist-status")
async def whitelist_status(player: dict = Depends(_get_player)):
    """Return just the whitelist status for the current player."""
    discord_id = player["discord_id"]
    wl_res = supabase.table("fivem_whitelist") \
        .select("id,status,txadmin_synced,character_name,created_at,reviewed_at,approved_at,reviewer_note") \
        .eq("discord_id", discord_id) \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    if not wl_res.data:
        return {"status": "none", "application": None}
    app = wl_res.data[0]
    # Compute display status
    display = app["status"]
    if app["status"] == "approved" and not app.get("txadmin_synced"):
        display = "syncing"  # approved but not yet in txAdmin
    elif app["status"] == "approved" and app.get("txadmin_synced"):
        display = "active"   # fully whitelisted
    return {"status": display, "application": app}
