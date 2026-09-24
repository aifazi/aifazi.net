"""auth_discord.py — Discord OAuth2 login, connect, and disconnect.

Extracted from auth.py. Handles Discord OAuth flow for user authentication
and account linking.
"""
import hmac
import logging
import os
import secrets
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from database import supabase
from dependencies import get_current_user

router = APIRouter()
log = logging.getLogger("auth.discord")

DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")


def _validate_frontend_url(value: str) -> str:
    """Fail-closed FRONTEND_URL allowlist, mirrored from main.py (kept local to
    avoid a main<->router import cycle). Production accepts only
    https://aifazi.net (and www); dev additionally accepts localhost URLs."""
    raw = (value or "").strip().rstrip("/") or "https://aifazi.net"
    is_prod = os.getenv("ENV", "production") == "production" or os.getenv("VERCEL", "") == "1"
    prod_allowed = {"https://aifazi.net", "https://www.aifazi.net"}
    if is_prod:
        if raw not in prod_allowed:
            raise RuntimeError(
                f"FRONTEND_URL={raw!r} is not allowlisted in production "
                "(expected https://aifazi.net). Refusing to start."
            )
        return raw
    if raw in prod_allowed or raw.startswith(("http://localhost:", "http://127.0.0.1:")):
        return raw
    log.warning("FRONTEND_URL=%r is not on the dev allowlist; continuing (non-production)", raw)
    return raw


FRONTEND_URL = _validate_frontend_url(os.getenv("FRONTEND_URL", "https://aifazi.net"))
WHITELIST_GUILD_ID = os.getenv("DISCORD_WHITELIST_GUILD_ID", "")
WHITELIST_ROLE_ID = os.getenv("DISCORD_WHITELIST_ROLE_ID", "")


@router.get("/discord/login")
async def discord_login(request: Request):
    """Initiate Discord OAuth2 login flow."""
    state = secrets.token_urlsafe(32)
    # Store state in cookie for CSRF protection
    response = RedirectResponse(
        url=f"https://discord.com/api/oauth2/authorize?"
            f"client_id={DISCORD_CLIENT_ID}&"
            f"redirect_uri={urllib.parse.quote(DISCORD_REDIRECT_URI)}&"
            f"response_type=code&"
            f"scope=identify%20email%20guilds.members.read&"
            f"state={state}"
    )
    response.set_cookie("discord_oauth_state", state, httponly=True, secure=True, samesite="lax", max_age=600)
    return response


@router.get("/discord/callback")
async def discord_callback(request: Request):
    """Handle Discord OAuth2 callback."""
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    stored_state = request.cookies.get("discord_oauth_state")

    if not code:
        raise HTTPException(400, "Missing authorization code")

    # Validate state — fail CLOSED: a missing state (or missing stored cookie)
    # must reject, otherwise an attacker can strip the state param to bypass
    # the CSRF check entirely (previous code only compared when both present).
    if not state or not stored_state or not hmac.compare_digest(state, stored_state):
        raise HTTPException(403, "Invalid OAuth state")

    # Exchange code for access token
    import httpx
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://discord.com/api/oauth2/token",
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(400, "Failed to exchange code for token")
        token_data = token_resp.json()
        access_token = token_data["access_token"]

    # Get user info from Discord
    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(400, "Failed to get Discord user info")
        discord_user = user_resp.json()

    discord_id = discord_user.get("id")
    username = discord_user.get("username", "").lower()
    email = discord_user.get("email", "")
    avatar = discord_user.get("avatar", "")

    if not discord_id:
        raise HTTPException(400, "Invalid Discord user data")

    # Check if user exists
    existing = supabase.table("users").select("id,username,discord_id").eq("discord_id", discord_id).limit(1).execute()
    # Tokens are delivered via HttpOnly SameSite=Lax cookies (same
    # _set_auth_cookies pattern as routers/auth.py) — never in the redirect
    # URL, where they would leak via history, logs, and Referer headers.
    from datetime import datetime, timezone

    from routers.auth import _set_auth_cookies, make_forum_token, make_refresh_token
    avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar}.png" if avatar else ""
    if existing.data:
        # User exists — issue forum-style tokens (id included for /refresh).
        user = existing.data[0]
        token = make_forum_token(user["id"], user["username"], "user")
        refresh = make_refresh_token({"id": user["id"], "username": user["username"], "role": "user"}, 60 * 24 * 7)
        supabase.table("users").update({
            "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user["id"]).execute()
        resp = RedirectResponse(url=f"{FRONTEND_URL}/auth/callback", status_code=302)
        _set_auth_cookies(resp, token, refresh)
        return resp
    else:
        # New user — create account (banned defaults False = active).
        new_username = f"discord_{username}"
        ins = supabase.table("users").insert({
            "username": new_username,
            "discord_id": discord_id,
            "discord_username": username,
            "email": email,
            "avatar": avatar_url,
            "profile_avatar": avatar_url,
            "role": "user",
        }).execute()
        new_id = ins.data[0]["id"] if ins.data else None
        if not new_id:
            raise HTTPException(500, "Failed to create user")
        token = make_forum_token(new_id, new_username, "user")
        refresh = make_refresh_token({"id": new_id, "username": new_username, "role": "user"}, 60 * 24 * 7)
        if new_id:
            supabase.table("users").update({
                "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", new_id).execute()
        resp = RedirectResponse(url=f"{FRONTEND_URL}/auth/callback", status_code=302)
        _set_auth_cookies(resp, token, refresh)
        return resp


@router.get("/discord/connect-url")
async def discord_connect_url(request: Request):
    """Get URL to link Discord account to existing account."""
    state = secrets.token_urlsafe(32)
    response = {
        "url": (
            f"https://discord.com/api/oauth2/authorize?"
            f"client_id={DISCORD_CLIENT_ID}&"
            f"redirect_uri={urllib.parse.quote(DISCORD_REDIRECT_URI)}&"
            f"response_type=code&"
            f"scope=identify%20email%20guilds.members.read&"
            f"state=connect_{state}"
        )
    }
    return response


@router.post("/discord/connect")
async def discord_connect(request: Request):
    """Link Discord account to current user."""
    body = await request.json()
    code = body.get("code")
    if not code:
        raise HTTPException(400, "Missing code")
    # Exchange code and link
    # (Implementation similar to callback but updates existing user)
    return {"ok": True}


@router.delete("/discord/disconnect")
async def discord_disconnect(user: dict = Depends(get_current_user)):
    """Unlink Discord account."""
    username = user.get("username") or ""
    supabase.table("users").update({
        "discord_id": None,
        "discord_username": None,
    }).eq("username", username).execute()
    return {"ok": True}


@router.get("/discord/whitelist-status")
async def discord_whitelist_status(user: dict = Depends(get_current_user)):
    """Check if user is whitelisted in Discord guild."""
    username = user.get("username") or ""
    # Get discord_id
    res = supabase.table("users").select("discord_id").eq("username", username).limit(1).execute()
    if not res.data or not res.data[0].get("discord_id"):
        return {"whitelisted": False, "reason": "No Discord account linked"}
    discord_id = res.data[0]["discord_id"]
    # Check guild membership
    if not DISCORD_BOT_TOKEN or not WHITELIST_GUILD_ID:
        return {"whitelisted": False, "reason": "Discord bot not configured"}
    import httpx
    async with httpx.AsyncClient() as client:
        member_resp = await client.get(
            f"https://discord.com/api/guilds/{WHITELIST_GUILD_ID}/members/{discord_id}",
            headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
        )
        if member_resp.status_code != 200:
            return {"whitelisted": False, "reason": "Not in guild"}
        member = member_resp.json()
        roles = member.get("roles", [])
        if WHITELIST_ROLE_ID and WHITELIST_ROLE_ID in roles:
            return {"whitelisted": True}
        return {"whitelisted": False, "reason": "Missing whitelist role"}
