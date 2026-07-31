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
  JWT_SECRET              — already set
"""

import os, secrets, httpx, urllib.parse as _urlparse
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt_compat import jwt, JWTError
from database import supabase
from utils.email import render_template
from utils.email_queue import queue_email
from utils.oauth_state import make_oauth_state, verify_oauth_state, _safe_relative_path

router = APIRouter()

# ── Config ────────────────────────────────────────────────────────────────────
DISCORD_CLIENT_ID     = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
FRONTEND_URL          = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
API_URL               = os.getenv("API_URL", "https://api.aifazi.net").rstrip("/")
REDIRECT_URI          = f"{API_URL}/api/discord/callback"

JWT_SECRET  = os.getenv("PASETO_SECRET", os.getenv("JWT_SECRET", ""))
JWT_ALGO    = "HS256"
JWT_EXPIRE  = 60 * 24 * 7   # 7 days in minutes

DISCORD_API = "https://discord.com/api/v10"

bearer = HTTPBearer(auto_error=False)

# ── Helpers ───────────────────────────────────────────────────────────────────
def _make_player_token(user: dict) -> str:
    payload = {
        "sub":          str(user["discord_id"]),
        "discord_id":   str(user["discord_id"]),
        "username":     user["username"],
        "avatar":       user.get("avatar") or "",
        "role":         "player",
        "exp":          datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def _decode_player_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid or expired Discord session")

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
    queue_email(email, subject, html, "", "discord_welcome")

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/login")
async def discord_login(redirect: str = ""):
    """Redirect player to Discord OAuth consent screen.

    C2 — `redirect` is now signed into the OAuth state via HMAC so the callback can
    verify state integrity + reject open-redirect attempts.
    """
    if not DISCORD_CLIENT_ID:
        raise HTTPException(503, "Discord OAuth not configured — set DISCORD_CLIENT_ID in Vercel")
    safe_dest = _safe_relative_path(redirect, default="/profile")
    state = make_oauth_state("discord", safe_dest)
    params = _urlparse.urlencode({
        "client_id":     DISCORD_CLIENT_ID,
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
        dest = verify_oauth_state(state or "", "discord")
    except ValueError:
        return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=state")

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            f"{DISCORD_API}/oauth2/token",
            data={
                "client_id":     DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
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
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/whitelist?discord_error=db")

    # Send welcome email to brand-new Discord signups (queued, reliable on serverless)
    if is_new and db_user.get("email"):
        await _send_discord_welcome(db_user["email"], db_user["username"])

    # Issue JWT
    jwt_token = _make_player_token(db_user)

    # dest already validated as a same-origin relative path by verify_oauth_state.
    # URL-encode it once so frontend receives a single-encoded query value.
    safe_dest = _urlparse.quote(dest, safe="/")
    # Use hash fragment instead of query param — tokens don't appear in server logs or Referer headers
    return RedirectResponse(f"{FRONTEND_URL}/auth/discord#token={jwt_token}&dest={safe_dest}")

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
