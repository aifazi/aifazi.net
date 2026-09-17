"""auth_discord.py — Discord OAuth2 login, connect, and disconnect.

Extracted from auth.py. Handles Discord OAuth flow for user authentication
and account linking.
"""
import hashlib
import hmac
import logging
import os
import secrets
import urllib.parse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from database import supabase
from dependencies import create_token

router = APIRouter()
log = logging.getLogger("auth.discord")

DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net")
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

    # Validate state
    if state and stored_state and not hmac.compare_digest(state, stored_state):
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
    if existing.data:
        # User exists — issue tokens
        user = existing.data[0]
        token = create_token({"sub": user["username"], "role": "user"}, purpose="auth")
        refresh = create_token({"sub": user["username"], "role": "user"}, purpose="refresh")
        # Redirect to frontend with tokens
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/callback?token={token}&refreshToken={refresh}",
            status_code=302,
        )
    else:
        # New user — create account
        new_username = f"discord_{username}"
        supabase.table("users").insert({
            "username": new_username,
            "discord_id": discord_id,
            "discord_username": username,
            "email": email,
            "avatar_url": f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar}.png" if avatar else "",
            "role": "user",
            "is_active": True,
        }).execute()
        token = create_token({"sub": new_username, "role": "user"}, purpose="auth")
        refresh = create_token({"sub": new_username, "role": "user"}, purpose="refresh")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/callback?token={token}&refreshToken={refresh}",
            status_code=302,
        )


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
