"""auth_discord.py — Discord OAuth2 login, connect, and disconnect.

Extracted from auth.py. Handles Discord OAuth flow for user authentication
and account linking.
"""
import logging
import os
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from database import supabase
from dependencies import get_current_user
from utils.mobile_oauth_codes import app_state_from, issue_code, mobile_fragment, state_echo
from utils.oauth_state import (
    _safe_relative_path,
    make_oauth_state,
    verify_oauth_state_full,
)

router = APIRouter()
log = logging.getLogger("auth.discord")

API_URL = (os.getenv("API_URL") or "https://api.aifazi.net").rstrip("/")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
# Default matches the redirect registered in the site Discord app
# (Developer Portal → OAuth2 → Redirects). It MUST match exactly when the
# flow starts — an empty/mismatched value makes Discord reject the login
# with a redirect_uri error before any callback ever happens.
DISCORD_REDIRECT_URI = (
    os.getenv("DISCORD_REDIRECT_URI", "").strip()
    or f"{API_URL}/api/auth/discord/callback"
)
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
# H2/C6 — deep-link base for mobile OAuth completion. Server-controlled; the
# app only accepts redirects under this exact prefix (matches MOBILE_AUTH_URL
# in the other provider routers and OAUTH_REDIRECT_BASE in apps/mobile).
MOBILE_AUTH_URL = os.getenv("MOBILE_AUTH_URL", "aifazi:///oauth/callback").rstrip("/")


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
    """Initiate Discord OAuth2 login flow.

    P1-2 — state is now a HMAC-signed, time-bound token (TTL + provider
    binding via utils/oauth_state), matching routers/discord_auth.py. The old
    cookie-compared random state had no expiry binding and broke whenever the
    cookie was missing (cross-site / blocked third-party cookies).
    """
    dest = _safe_relative_path(
        request.query_params.get("redirect") or request.query_params.get("dest") or "/profile"
    )
    # H2/C6 — the mobile app starts the flow with `mobile=1` plus its own
    # one-time `state` (CSPRNG hex), which the callback echoes back in the
    # deep-link fragment so the app can bind the redirect to its own flow.
    is_mobile = request.query_params.get("mobile") == "1"
    app_state = request.query_params.get("state") or ""
    extra = {"state": app_state[:128]} if app_state else None
    try:
        state = make_oauth_state("discord", dest, mobile=is_mobile, extra=extra)
    except ValueError:
        state = make_oauth_state("discord", dest, mobile=is_mobile)
    except RuntimeError:
        raise HTTPException(503, "OAuth state signing is not configured")
    return RedirectResponse(
        url=f"https://discord.com/api/oauth2/authorize?"
            f"client_id={DISCORD_CLIENT_ID}&"
            f"redirect_uri={urllib.parse.quote(DISCORD_REDIRECT_URI)}&"
            f"response_type=code&"
            f"scope=identify%20email%20guilds.members.read&"
            f"state={urllib.parse.quote(state)}"
    )


def _mobile_code_redirect(user_id: str, user_username: str, st: dict | None) -> RedirectResponse:
    """H2/C6 — mobile deep link carrying a one-time exchange code, never a token.

    The app exchanges the code via POST /api/auth/mobile/exchange. Issue
    failure fails closed (error param) — no token-in-URL fallback.
    """
    dest = _safe_relative_path((st or {}).get("dest") or "/profile")
    try:
        code = issue_code("discord", user_id, user_username, "user", dest,
                          app_state=app_state_from((st or {}).get("extra")))
    except Exception:
        log.error("discord mobile code issue failed", exc_info=True)
        return RedirectResponse(f"{MOBILE_AUTH_URL}/discord?discord_error=db")
    return RedirectResponse(
        MOBILE_AUTH_URL + "/discord" + mobile_fragment(code, dest) + state_echo((st or {}).get("extra"))
    )


@router.get("/discord/callback")
async def discord_callback(request: Request):
    """Handle Discord OAuth2 callback (login AND account-link flows).

    The signed `state` decides the flow: provider "discord" runs the login
    flow below; provider "discord-connect" carries a bound `uid` claim and
    links the Discord identity to that existing account instead. Trying the
    login kind first keeps the stock login URL working unchanged.
    """
    code = request.query_params.get("code")
    state = request.query_params.get("state")

    if not code:
        raise HTTPException(400, "Missing authorization code")

    login_payload = None
    link_payload = None
    try:
        login_payload = verify_oauth_state_full(state or "", "discord")
    except ValueError:
        pass
    if login_payload is None:
        try:
            link_payload = verify_oauth_state_full(state or "", "discord-connect")
        except ValueError:
            pass
    if login_payload is None and link_payload is None:
        raise HTTPException(403, "Invalid OAuth state")

    discord_id, username, email, avatar = await _exchange_discord_user(code)

    if link_payload is not None:
        return await _link_discord_account(link_payload, discord_id, username, email)

    if not discord_id:
        raise HTTPException(400, "Invalid Discord user data")

    # Web destination comes from the signed state (falls back to /profile).
    # The frontend finisher lives at /auth/discord-callback — NOT bare
    # /auth/callback, which never existed (that 404s). The page restores the
    # session from the HttpOnly cookie (or the #token fragment), then follows
    # #dest, mirroring the github/steam callback targets.
    dest = _safe_relative_path((login_payload or {}).get("dest") or "/profile")

    # H2/C6 — mobile flows (started with mobile=1) never receive tokens in the
    # redirect: they get a one-time exchange code deep link instead.
    is_mobile = bool((login_payload or {}).get("mobile"))

    # Check if user exists
    existing = supabase.table("users").select("id,username,discord_id").eq("discord_id", discord_id).limit(1).execute()
    # Web tokens are delivered via HttpOnly SameSite=Lax cookies (same
    # _set_auth_cookies pattern as routers/auth.py) — never in the redirect
    # URL, where they would leak via history, logs, and Referer headers.
    from datetime import datetime, timezone

    from utils.auth_tokens import _set_auth_cookies, make_forum_token, make_refresh_token
    avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar}.png" if avatar else ""
    if existing.data:
        # User exists — issue forum-style tokens (id included for /refresh).
        user = existing.data[0]
        if is_mobile:
            return _mobile_code_redirect(user["id"], user["username"], login_payload)
        token = make_forum_token(user["id"], user["username"], "user")
        refresh = make_refresh_token({"id": user["id"], "username": user["username"], "role": "user"}, 60 * 24 * 7)
        supabase.table("users").update({
            "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user["id"]).execute()
        resp = RedirectResponse(
            url=f"{FRONTEND_URL}/auth/discord-callback#dest=" + urllib.parse.quote(dest, safe="/"),
            status_code=302,
        )
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
        if is_mobile:
            return _mobile_code_redirect(new_id, new_username, login_payload)
        token = make_forum_token(new_id, new_username, "user")
        refresh = make_refresh_token({"id": new_id, "username": new_username, "role": "user"}, 60 * 24 * 7)
        if new_id:
            supabase.table("users").update({
                "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", new_id).execute()
        resp = RedirectResponse(
            url=f"{FRONTEND_URL}/auth/discord-callback#dest=" + urllib.parse.quote(dest, safe="/"),
            status_code=302,
        )
        _set_auth_cookies(resp, token, refresh)
        return resp


@router.get("/discord/connect-url")
async def discord_connect_url(request: Request, user: dict = Depends(get_current_user)):
    """Get URL to link a Discord account to the caller's account.

    Requires auth; the signed state binds the caller's user id so a completed
    flow can only ever link to the account that minted it (no login-CSRF).
    """
    uid = user.get("id")
    if not uid:
        raise HTTPException(401, "Authentication required")
    try:
        state = make_oauth_state("discord-connect", "/profile?tab=fivem", extra={"uid": str(uid)})
    except (RuntimeError, ValueError):
        raise HTTPException(503, "OAuth state signing is not configured")
    return {
        "url": (
            f"https://discord.com/api/oauth2/authorize?"
            f"client_id={DISCORD_CLIENT_ID}&"
            f"redirect_uri={urllib.parse.quote(DISCORD_REDIRECT_URI)}&"
            f"response_type=code&"
            f"scope=identify%20email%20guilds.members.read&"
            f"state={urllib.parse.quote(state)}"
        )
    }


async def _exchange_discord_user(code: str) -> tuple:
    """Exchange an OAuth code for (discord_id, username, email, avatar)."""
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
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(400, "Failed to exchange code for token")

    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(400, "Failed to get Discord user info")
        discord_user = user_resp.json()

    return (
        discord_user.get("id"),
        str(discord_user.get("username", "")).lower(),
        discord_user.get("email", ""),
        discord_user.get("avatar", ""),
    )


async def _link_discord_account(link_payload: dict, discord_id, username: str, email: str):
    """Link the OAuth Discord identity to the uid bound in the signed state."""
    from datetime import datetime, timezone

    uid = (link_payload.get("extra") or {}).get("uid")
    if not uid or not discord_id:
        raise HTTPException(400, "Invalid link request")
    target = supabase.table("users").select("id,username,discord_id").eq("id", str(uid)).limit(1).execute()
    if not target.data:
        raise HTTPException(404, "Account not found")
    taken = supabase.table("users").select("id").eq("discord_id", discord_id).limit(1).execute()
    if taken.data and taken.data[0].get("id") != str(uid):
        raise HTTPException(409, "This Discord account is already linked elsewhere")
    supabase.table("users").update({
        "discord_id": discord_id,
        "discord_username": username,
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(uid)).execute()
    email_note = f" ({email})" if email else ""
    log.info("discord linked for user %s%s", uid, email_note)
    return RedirectResponse(url=f"{FRONTEND_URL}/profile?tab=fivem&linked=discord", status_code=302)


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
