"""
routers/github_auth.py — GitHub OAuth2 login for forum users
────────────────────────────────────────────────────────────────
Flow:
  1. GET  /api/forum/auth/github/login        → redirect to GitHub OAuth
  2. GET  /api/forum/auth/github/callback     → exchange code → upsert forum_users → JWT → redirect
  3. GET  /api/forum/auth/github/connect-url  → start link flow (issues signed state + link_token)
  4. DEL  /api/forum/auth/github/disconnect   → unlink GitHub (requires password set)

  GitHub linking ONLY happens via the verified OAuth callback (mode=connect),
  which carries a signed link_token. There is intentionally NO client-supplied
  github_id link endpoint — that would let a user claim someone else's identity.

Vercel env vars needed:
  GITHUB_CLIENT_ID       — from github.com/settings/developers
  GITHUB_CLIENT_SECRET   — from github.com/settings/developers
  FRONTEND_URL           — https://aifazi.net
  API_URL                — https://api.aifazi.net
  JWT_SECRET / PASETO_SECRET — already set

  OAuth app callback URL:  https://api.aifazi.net/api/forum/auth/github/callback
"""

import os
import logging
import urllib.parse as _urlparse
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials

log = logging.getLogger("github_auth")

try:
    import httpx as _httpx
except ImportError:
    _httpx = None

from jwt_compat import JWTError
from database import supabase
from utils.oauth_state import make_oauth_state, verify_oauth_state, _safe_relative_path

from routers.auth import (
    make_forum_token,
    make_forum_2fa_token,
    _record_user_activity,
    _get_forum_user,
    _active_identity_locked,
    _ensure_identity_available,
    _next_available_username,
    _normalized_email,
    _find_user_by_ci,
    SITE_URL,
    SECRET,
    ALGO,
    bearer,
    ACTIVE_IDENTITY_MESSAGE,
)

router = APIRouter()

# ── Config ────────────────────────────────────────────────────────────────────
GITHUB_CLIENT_ID     = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
API_URL              = os.getenv("API_URL", "https://api.aifazi.net").rstrip("/")
GITHUB_REDIRECT_URI  = f"{API_URL}/api/forum/auth/github/callback"

GITHUB_AUTH_URL  = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API       = "https://api.github.com"


# ── Helpers ───────────────────────────────────────────────────────────────────
def _make_github_link_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc).timestamp() + 10 * 60
    from jwt_compat import jwt
    return jwt.encode({"id": user_id, "purpose": "github_link", "exp": exp}, SECRET, algorithm=ALGO)


def _decode_github_link_token(token: str | None) -> dict | None:
    if not token:
        return None
    from jwt_compat import jwt
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        return payload if payload.get("purpose") == "github_link" else None
    except JWTError:
        return None


def _github_oauth_url(state: str) -> str:
    params = _urlparse.urlencode({
        "client_id":     GITHUB_CLIENT_ID,
        "redirect_uri":  GITHUB_REDIRECT_URI,
        "scope":         "read:user user:email",
        "state":         state,
    })
    return f"{GITHUB_AUTH_URL}?{params}"


async def _fetch_github_profile(access_token: str) -> dict:
    """
    Fetch GitHub profile + verified primary email.
    Returns {"id", "username", "avatar", "email", "name"}.
    """
    async with _httpx.AsyncClient() as c:
        me = await c.get(
            f"{GITHUB_API}/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=10,
        )
        if me.status_code != 200:
            raise HTTPException(400, "GitHub profile fetch failed")
        d = me.json()
        email = d.get("email") or ""
        if not email:
            emails = await c.get(
                f"{GITHUB_API}/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
                timeout=10,
            )
            if emails.status_code == 200:
                primary = next(
                    (e.get("email") for e in emails.json()
                     if e.get("verified") and e.get("primary")),
                    None,
                )
                email = primary or email
    return {
        "id":       str(d.get("id") or ""),
        "username": d.get("login") or "",
        "name":     d.get("name") or "",
        "avatar":   d.get("avatar_url") or "",
        "email":    email,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/login")
async def github_login(dest: str = "/forum/profile"):
    """Redirect the player to the GitHub OAuth consent screen."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(500, "GitHub OAuth not configured — set GITHUB_CLIENT_ID")
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    state = make_oauth_state("github", safe_dest)
    return RedirectResponse(_github_oauth_url(state))


@router.get("/connect-url")
async def github_connect_url(dest: str = "/profile",
                             creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Return a GitHub OAuth URL that links GitHub to the current forum user."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(500, "GitHub OAuth not configured — set GITHUB_CLIENT_ID")
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    link_token = _make_github_link_token(payload["id"])
    safe_dest = _safe_relative_path(dest, default="/profile")
    state = f"connect:{link_token}:{safe_dest}"
    return {"url": _github_oauth_url(state)}


@router.get("/callback")
async def github_callback(code: str = None, state: str = None, error: str = None):
    """Exchange GitHub code, upsert forum_users, issue JWT, redirect to frontend."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(500, "GitHub OAuth not configured — set GITHUB_CLIENT_ID")
    front = SITE_URL
    state_value = _urlparse.unquote(state or "") if state else ""
    dest = "/forum/profile"
    mode = "login"
    link_payload = None

    if state_value.startswith("connect:"):
        parts = state_value.split(":", 2)
        if len(parts) != 3:
            return RedirectResponse(f"{front}/profile?github_error=link")
        mode = "connect"
        link_payload = _decode_github_link_token(parts[1])
        dest = _safe_relative_path(parts[2], default="/forum/profile")
        if not link_payload:
            return RedirectResponse(f"{front}/profile?github_error=link")
    else:
        try:
            dest = verify_oauth_state(state_value, "github")
        except ValueError:
            return RedirectResponse(f"{front}/login?github_error=state")

    if error or not code:
        return RedirectResponse(f"{front}/login?github_error=1")

    if not _httpx:
        return RedirectResponse(f"{front}/login?github_error=cfg")

    # 1. Exchange code for GitHub access token
    try:
        async with _httpx.AsyncClient() as c:
            tok = await c.post(
                GITHUB_TOKEN_URL,
                data={
                    "client_id":     GITHUB_CLIENT_ID,
                    "client_secret": GITHUB_CLIENT_SECRET,
                    "code":          code,
                    "redirect_uri":  GITHUB_REDIRECT_URI,
                },
                headers={"Accept": "application/json"},
                timeout=10,
            )
        if tok.status_code != 200:
            return RedirectResponse(f"{front}/login?github_error=2")
        access_token = tok.json().get("access_token")
        if not access_token:
            return RedirectResponse(f"{front}/login?github_error=2")
    except Exception:
        return RedirectResponse(f"{front}/login?github_error=2")

    # 2. Fetch GitHub profile
    try:
        profile = await _fetch_github_profile(access_token)
        github_id       = profile["id"]
        github_username = profile["username"]
        github_name     = profile["name"]
        github_avatar   = profile["avatar"]
        github_email    = profile["email"]
    except HTTPException:
        return RedirectResponse(f"{front}/login?github_error=3")
    except Exception:
        return RedirectResponse(f"{front}/login?github_error=3")

    now = datetime.now(timezone.utc).isoformat()

    # 3. Find or create forum_users row
    try:
        if mode == "connect":
            current_user_id = link_payload["id"]
            if _active_identity_locked(current_user_id):
                safe_dest = dest if str(dest).startswith("/") else "/profile"
                sep = "&" if "?" in safe_dest else "?"
                return RedirectResponse(f"{front}{safe_dest}{sep}github_error=identity_locked")
            ex = supabase.table("users").select("id,username").eq("github_id", github_id).execute()
            if ex.data and ex.data[0]["id"] != current_user_id:
                safe_dest = dest if str(dest).startswith("/") else "/profile"
                sep = "&" if "?" in safe_dest else "?"
                return RedirectResponse(f"{front}{safe_dest}{sep}github_error=duplicate")

            row = supabase.table("users").select("*").eq("id", current_user_id).execute()
            if not row.data:
                return RedirectResponse(f"{front}/login?github_error=missing")
            user = row.data[0]
            supabase.table("users").update({
                "github_username": github_username,
                "github_avatar":   github_avatar,
                "last_seen":       now,
                "github_id":       github_id,
            }).eq("id", current_user_id).execute()
            user = {**user, "github_id": github_id, "github_username": github_username, "github_avatar": github_avatar}
        else:
            # a) Already linked by github_id
            ex = supabase.table("users").select("*").eq("github_id", github_id).execute()
            if ex.data:
                user = ex.data[0]
                supabase.table("users").update({
                    "github_username": github_username,
                    "github_avatar":   github_avatar,
                    "last_seen":       now,
                }).eq("id", user["id"]).execute()
            else:
                user = None
                # b) Match by email -> link existing account, case-insensitively.
                if github_email:
                    user = _find_user_by_ci("email", github_email, "*")
                    if user and not user.get("email_verified"):
                        # Do NOT auto-link to an account whose email is unverified:
                        # a GitHub account using that (unclaimed/bouncing) address
                        # could otherwise hijack the victim's forum account.
                        log.info("github callback: refusing email-match link to unverified account for %s", github_email)
                        safe_dest = dest if str(dest).startswith("/") else "/profile"
                        sep = "&" if "?" in safe_dest else "?"
                        return RedirectResponse(f"{front}{safe_dest}{sep}github_error=email_unverified")
                    if user:
                        _ensure_identity_available("github_id", github_id, user["id"], "GitHub account")
                        supabase.table("users").update({
                            "github_id":       github_id,
                            "github_username": github_username,
                            "github_avatar":   github_avatar,
                            "last_seen":       now,
                        }).eq("id", user["id"]).execute()
                # c) Create brand-new account
                if not user:
                    uname = _next_available_username(github_username or f"github_{github_id[-6:]}")
                    row = supabase.table("users").insert({
                        "username":         uname,
                        "email":            _normalized_email(github_email) or f"{github_id}@github.placeholder",
                        "password_hash":    "",
                        "email_verified":   True,   # GitHub already verified the email
                        "github_id":        github_id,
                        "github_username":  github_username,
                        "github_avatar":    github_avatar,
                        "role":             "user",
                        "created_at":       now,
                        "last_seen":        now,
                    }).execute()
                    user = row.data[0]
    except Exception as exc:
        import logging
        logging.getLogger("github_auth").error("github_callback db: %s", exc)
        return RedirectResponse(f"{front}/login?github_error=db")

    if user.get("banned"):
        return RedirectResponse(f"{front}/login?github_error=banned")

    # 4. Issue the same JWT the rest of the site uses
    if mode != "connect" and user.get("totp_enabled") and user.get("totp_secret"):
        partial = make_forum_2fa_token(user["id"], user["username"], user.get("role", "user"), "github")
        safe_dest = _urlparse.quote(dest, safe="/")
        safe_user = _urlparse.quote(user.get("username") or "")
        safe_partial = _urlparse.quote(partial, safe="")
        return RedirectResponse(f"{front}/login#twofa=forum&partial_token={safe_partial}&username={safe_user}&next={safe_dest}")

    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    _record_user_activity(user["id"], user["username"], "github_connect" if mode == "connect" else "github_login", f"github_id={github_id}")

    # 5. Redirect to frontend callback page with token
    try:
        from routers.auth import make_refresh_token, _set_auth_cookies
        refresh = make_refresh_token({"id": user["id"], "username": user["username"], "role": user.get("role", "user")}, 60 * 24 * 7)
        try:
            supabase.table("users").update({
                "refresh_token": refresh, "refresh_rotated_at": now, "last_seen": now,
            }).eq("id", user["id"]).execute()
        except Exception:
            pass
        safe_dest = _urlparse.quote(dest, safe="/")
        resp = RedirectResponse(f"{front}/auth/github-callback#token={token}&dest={safe_dest}")
        _set_auth_cookies(resp, token, refresh)
        return resp
    except Exception:
        safe_dest = _urlparse.quote(dest, safe="/")
        return RedirectResponse(f"{front}/auth/github-callback#token={token}&dest={safe_dest}")


@router.delete("/disconnect")
async def github_disconnect(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Unlink GitHub from the current account (requires email/password login)."""
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(400, "A player account is required to disconnect GitHub")
    if _active_identity_locked(user_id):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    ur = supabase.table("users").select("password_hash").eq("id", user_id).execute()
    if not ur.data or not ur.data[0].get("password_hash"):
        raise HTTPException(400, "Email/password login is required before disconnecting GitHub")
    supabase.table("users").update({
        "github_id": None, "github_username": None, "github_avatar": None,
    }).eq("id", user_id).execute()
    _record_user_activity(user_id, payload.get("username", ""), "github_disconnect")
    return {"ok": True}
