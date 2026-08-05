"""
routers/steam_auth.py — Steam OpenID 2.0 login for forum users
────────────────────────────────────────────────────────────────
Flow:
  1. GET  /api/forum/auth/steam/login          → redirect to Steam OpenID
  2. GET  /api/forum/auth/steam/callback       → validate OpenID → upsert forum_users → JWT → redirect
  3. GET  /api/forum/auth/steam/connect-init   → start link flow (issues link_token)
  4. GET  /api/forum/auth/steam/connect-url    → OpenID URL for linking (mode=connect)
  5. DEL  /api/forum/auth/steam/disconnect     → unlink Steam (requires password set)

  Note: Steam linking ONLY happens via the OpenID callback (mode=connect) after
  Steam verifies ownership. There is intentionally NO client-supplied steam_id
  link endpoint — that would let a user claim someone else's Steam64.

Vercel env vars needed:
  STEAM_API_KEY    — from https://steamcommunity.com/dev/apikey  (optional but recommended)
  FRONTEND_URL     — https://aifazi.net
  API_URL          — https://api.aifazi.net
  JWT_SECRET       — already set

FiveM steam_hex:
  steam_hex = "steam:" + hex(int(steam64_id))[2:]   (lowercase, no "0x" prefix)
  e.g. 76561198085247440 → steam:110000124a95210

Uniqueness guarantees:
  - steam_id has a UNIQUE index in forum_users (see migration)
  - The callback checks for conflicts before linking
  - register/discord flows are unaffected (can't register with a Steam ID)
"""

import os, re
from datetime import datetime, timezone, timedelta
import urllib.parse as _urlparse
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

try:
    import httpx as _httpx
except ImportError:
    _httpx = None

from jwt_compat import jwt, JWTError
from database import supabase
from dependencies import CookieHTTPBearer
from utils.audit import record as _audit
from utils.oauth_state import make_oauth_state, verify_oauth_state, _safe_relative_path

router = APIRouter()

# ── Config ────────────────────────────────────────────────────────────────────
STEAM_API_KEY  = os.getenv("STEAM_API_KEY", "")
FRONTEND_URL   = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
API_URL        = os.getenv("API_URL", "https://api.aifazi.net").rstrip("/")
STEAM_CALLBACK = f"{API_URL}/api/forum/auth/steam/callback"
STEAM_REALM    = API_URL   # must be a prefix of STEAM_CALLBACK

STEAM_OPENID   = "https://steamcommunity.com/openid/login"
STEAM_PROF_API = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"

JWT_SECRET = os.getenv("PASETO_SECRET", os.getenv("JWT_SECRET", ""))
JWT_ALGO   = "HS256"
JWT_EXPIRE = 60 * 24 * 7   # 7 days in minutes

bearer = CookieHTTPBearer(auto_error=False)
ACTIVE_IDENTITY_MESSAGE = "Your player identity is active. Contact an admin or open a ticket to change Discord or Steam."

# ── Helpers ───────────────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _steam64_to_hex(steam64: str) -> str | None:
    """Convert Steam64 ID to FiveM steam: identifier."""
    try:
        return f"steam:{hex(int(steam64))[2:].lower()}"
    except (ValueError, TypeError):
        return None


def _make_forum_token(user_id: str, username: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE)
    return jwt.encode({"id": user_id, "username": username, "role": role, "exp": exp},
                      JWT_SECRET, algorithm=JWT_ALGO)


def _make_forum_2fa_token(user_id: str, username: str, role: str, provider: str = "steam") -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode({
        "id": user_id,
        "username": username,
        "role": role,
        "tfa_pending": True,
        "provider": provider,
        "exp": exp,
    }, JWT_SECRET, algorithm=JWT_ALGO)


def _make_steam_link_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=10)
    return jwt.encode({"id": user_id, "purpose": "steam_link", "exp": exp},
                      JWT_SECRET, algorithm=JWT_ALGO)


def _decode_steam_link_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload if payload.get("purpose") == "steam_link" else None
    except JWTError:
        return None


def _get_forum_user(creds: HTTPAuthorizationCredentials | None) -> dict | None:
    if not creds:
        return None
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        return None


def _record_activity(user_id: str, username: str, action: str, detail: str = "") -> None:
    try:
        supabase.table("user_activity_logs").insert({
            "user_id": user_id, "username": username,
            "action": action, "detail": detail,
            "created_at": _now(),
        }).execute()
    except Exception:
        pass


def _steam_openid_url(return_to: str) -> str:
    params = _urlparse.urlencode({
        "openid.ns":         "http://specs.openid.net/auth/2.0",
        "openid.mode":       "checkid_setup",
        "openid.return_to":  return_to,
        "openid.realm":      STEAM_REALM,
        "openid.identity":   "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    })
    return f"{STEAM_OPENID}?{params}"


def _clean_username(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", (raw or "").strip()).strip("._-")
    return (cleaned[:30] or "player")


def _next_available_username(raw: str) -> str:
    base  = _clean_username(raw)
    uname = base
    suffix = 0
    while _find_user_by_ci("username", uname):
        suffix += 1
        uname = f"{base[:max(1, 30-len(str(suffix)))]}{suffix}"
    return uname


def _find_user_by_ci(field: str, value: str) -> dict | None:
    value = (value or "").strip()
    if not value:
        return None
    res = supabase.table("users").select("id").ilike(field, value).limit(5).execute()
    needle = value.lower()
    return next((row for row in (res.data or []) if str(row.get(field, "")).lower() == needle), None)


def _active_identity_locked(user_id: str) -> bool:
    row = supabase.table("users").select("discord_id,steam_id").eq("id", user_id).limit(1).execute()
    if not row.data:
        return False
    user = row.data[0]
    filters = []
    discord_id = str(user.get("discord_id") or "").strip()
    steam_hex = _steam64_to_hex(user.get("steam_id"))
    if discord_id:
        filters.append(f"discord_id.eq.{discord_id}")
    if steam_hex:
        filters.append(f"steam_hex.eq.{steam_hex}")
    if not filters:
        return False
    res = (
        supabase.table("fivem_whitelist")
        .select("id,last_played_at")
        .eq("status", "approved")
        .not_.is_("last_played_at", "null")
        .or_(",".join(filters))
        .limit(1)
        .execute()
    )
    return bool(res.data)


async def _fetch_steam_profile(steam64: str) -> dict:
    """
    Fetch username + avatar from Steam Web API.
    Returns {"username": ..., "avatar": ...} — falls back to defaults if unavailable.
    """
    if not STEAM_API_KEY or not _httpx:
        return {"username": f"SteamUser_{steam64[-6:]}", "avatar": ""}

    try:
        async with _httpx.AsyncClient() as c:
            resp = await c.get(STEAM_PROF_API,
                               params={"key": STEAM_API_KEY, "steamids": steam64},
                               timeout=8)
        if resp.status_code == 200:
            players = resp.json().get("response", {}).get("players", [])
            if players:
                p = players[0]
                return {
                    "username": p.get("personaname", f"SteamUser_{steam64[-6:]}"),
                    "avatar":   p.get("avatarfull", p.get("avatar", "")),
                }
    except Exception:
        pass
    return {"username": f"SteamUser_{steam64[-6:]}", "avatar": ""}


async def _verify_steam_openid(raw_params: dict) -> str | None:
    """
    Verify a Steam OpenID 2.0 response by posting back to Steam
    with openid.mode=check_authentication.
    Returns Steam64 ID string on success, None on failure.
    """
    if not _httpx:
        return None

    check = dict(raw_params)
    check["openid.mode"] = "check_authentication"

    try:
        async with _httpx.AsyncClient() as c:
            resp = await c.post(STEAM_OPENID, data=check, timeout=10)
    except Exception:
        return None

    if "is_valid:true" not in resp.text:
        return None

    claimed_id = raw_params.get("openid.claimed_id", "")
    m = re.search(r"/openid/id/(\d+)$", claimed_id)
    return m.group(1) if m else None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/login")
async def steam_login(dest: str = "/forum/profile"):
    """Redirect user to Steam OpenID consent screen."""
    # M10 — sign dest into a time-bound OAuth state token. Steam OpenID 2.0 has
    # no native state param, but return_to (which Steam echoes back on the
    # callback) is under our control, so we embed the state there. The callback
    # verifies signature + expiry and rejects any forged/echoed login (login-CSRF).
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    state = make_oauth_state("steam", safe_dest)
    # Embed dest in return_to so it survives the OpenID redirect
    return_to = (
        f"{STEAM_CALLBACK}?state={_urlparse.quote(state, safe='')}"
        f"&dest={_urlparse.quote(safe_dest, safe='/')}"
    )
    return RedirectResponse(_steam_openid_url(return_to))


@router.get("/callback")
async def steam_callback(request: Request, dest: str = "/forum/profile",
                         mode: str = "login", link_token: str | None = None,
                         state: str | None = None):
    """
    Handle Steam OpenID callback:
      1. Validate signature with Steam
      2. Verify the signed OAuth state (M10 — login-CSRF guard)
      3. Fetch profile from Steam API
      4. Upsert forum_users (create or link)
      5. Issue JWT → redirect to frontend /auth/steam-callback
    """
    front = FRONTEND_URL

    # Collect ALL query params (openid.* come from Steam)
    raw_params = dict(request.query_params)

    # Validate
    steam64 = await _verify_steam_openid(raw_params)
    if not steam64:
        return RedirectResponse(f"{front}/login?steam_error=1")

    # M10 — verify the signed state token. Steam echoes `openid.return_to` back,
    # so `state` here is the one we issued in /login or /connect-*. Any forged,
    # replayed, or expired state fails closed (prevents login-CSRF + open-redirect).
    try:
        dest = verify_oauth_state(state, "steam")
    except ValueError:
        return RedirectResponse(f"{front}/login?steam_error=state")
    dest = _safe_relative_path(dest, default="/forum/profile")

    # Fetch Steam profile
    profile = await _fetch_steam_profile(steam64)
    steam_username = profile["username"]
    steam_avatar   = profile["avatar"]
    steam_hex      = _steam64_to_hex(steam64)

    now = _now()

    try:
        if mode == "connect":
            link_payload = _decode_steam_link_token(link_token)
            if not link_payload:
                return RedirectResponse(f"{front}/login?steam_error=link")

            current_user_id = link_payload["id"]
            if _active_identity_locked(current_user_id):
                safe_dest = dest if str(dest).startswith("/") else "/profile"
                sep = "&" if "?" in safe_dest else "?"
                return RedirectResponse(f"{front}{safe_dest}{sep}steam_error=identity_locked")
            ex = supabase.table("users").select("id,username").eq("steam_id", steam64).execute()
            if ex.data and ex.data[0]["id"] != current_user_id:
                safe_dest = dest if str(dest).startswith("/") else "/profile"
                sep = "&" if "?" in safe_dest else "?"
                return RedirectResponse(f"{front}{safe_dest}{sep}steam_error=duplicate")

            row = supabase.table("users").select("*").eq("id", current_user_id).execute()
            if not row.data:
                return RedirectResponse(f"{front}/login?steam_error=missing")
            user = row.data[0]

            supabase.table("users").update({
                "steam_id":       steam64,
                "steam_username": steam_username,
                "steam_avatar":   steam_avatar,
                "last_seen":      now,
            }).eq("id", current_user_id).execute()
            is_new_account = False
        else:
            # ── 1. Already linked by steam_id ──────────────────────────────
            ex = supabase.table("users").select("*").eq("steam_id", steam64).execute()
            if ex.data:
                user = ex.data[0]
                is_new_account = False
                supabase.table("users").update({
                    "steam_username": steam_username,
                    "steam_avatar":   steam_avatar,
                    "last_seen":      now,
                }).eq("id", user["id"]).execute()

            else:
                user = None
                is_new_account = False

                # ── 2. No existing Steam link — create new account ──────────
                uname = _next_available_username(steam_username)
                row = supabase.table("users").insert({
                    "username":         uname,
                    "email":            f"{steam64}@steam.placeholder",
                    "password_hash":    "",
                    "email_verified":   True,
                    "steam_id":         steam64,
                    "steam_username":   steam_username,
                    "steam_avatar":     steam_avatar,
                    "role":             "user",
                    "created_at":       now,
                    "last_seen":        now,
                }).execute()
                user = row.data[0]
                is_new_account = True

    except Exception as exc:
        import logging
        logging.getLogger("steam_auth").error("steam_callback db: %s", exc)
        return RedirectResponse(f"{front}/login?steam_error=db")

    if user.get("banned"):
        return RedirectResponse(f"{front}/login?steam_error=banned")

    if mode != "connect" and user.get("totp_enabled") and user.get("totp_secret"):
        partial = _make_forum_2fa_token(user["id"], user["username"], user.get("role", "user"), "steam")
        safe_dest = _urlparse.quote(dest, safe="/")
        safe_user = _urlparse.quote(user.get("username") or "")
        safe_partial = _urlparse.quote(partial, safe="")
        return RedirectResponse(f"{front}/login#twofa=forum&partial_token={safe_partial}&username={safe_user}&next={safe_dest}")

    token = _make_forum_token(user["id"], user["username"], user.get("role", "user"))
    _record_activity(user["id"], user["username"], "steam_connect" if mode == "connect" else "steam_login", f"steam64={steam64}")

    safe_dest = _urlparse.quote(dest, safe="/")
    # For brand-new Steam accounts, send to profile edit tab so they can set email
    new_flag = "&new_account=1" if is_new_account else ""
    # Use hash fragment instead of query param — tokens don't appear in server logs or Referer headers
    # H4 — also set HttpOnly auth cookies so the session survives without
    # localStorage; the fragment token stays as a legacy fallback.
    try:
        from routers.auth import make_token, _set_auth_cookies
        refresh = make_token({"id": user["id"], "username": user["username"], "role": user.get("role", "user")}, 60 * 24 * 7)
        try:
            supabase.table("users").update({
                "refresh_token": refresh, "refresh_rotated_at": now, "last_seen": now,
            }).eq("id", user["id"]).execute()
        except Exception:
            pass
        resp = RedirectResponse(f"{front}/auth/steam-callback#token={token}&dest={safe_dest}{new_flag}")
        _set_auth_cookies(resp, token, refresh)
        return resp
    except Exception:
        return RedirectResponse(f"{front}/auth/steam-callback#token={token}&dest={safe_dest}{new_flag}")


@router.delete("/disconnect")
async def steam_disconnect(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """
    Unlink Steam from the current account.
    Requires email/password login so the user can still sign in afterward.
    """
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)

    ur = supabase.table("users") \
        .select("password_hash") \
        .eq("id", payload["id"]).execute()
    if not ur.data:
        raise HTTPException(404, "User not found")

    u = ur.data[0]
    if not u.get("password_hash"):
        raise HTTPException(400,
            "Email/password login is required before disconnecting Steam")

    supabase.table("users").update({
        "steam_id": None, "steam_username": None, "steam_avatar": None,
    }).eq("id", payload["id"]).execute()

    _record_activity(payload["id"], payload.get("username", ""), "steam_disconnect")
    return {"ok": True}


@router.get("/connect-init")
async def steam_connect_init(dest: str = "/forum/profile",
                             creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """
    Start the Steam OpenID flow for connecting (not login).
    dest should include the user's auth token so the callback page can re-authenticate.
    This is a convenience redirect — the actual linking happens in /connect.
    """
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)

    link_token = _make_steam_link_token(payload["id"])
    # M10 — sign dest into the state token so the connect callback rejects a
    # forged/echoed flow and can't be driven as an open-redirect.
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    state = make_oauth_state("steam", safe_dest)
    return_to = (
        f"{STEAM_CALLBACK}?dest={_urlparse.quote(safe_dest, safe='/')}"
        f"&mode=connect&link_token={_urlparse.quote(link_token)}"
        f"&state={_urlparse.quote(state, safe='')}"
    )
    return RedirectResponse(_steam_openid_url(return_to))


@router.get("/connect-url")
async def steam_connect_url(dest: str = "/forum/profile",
                            creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Return a Steam OpenID URL that links Steam to the current forum user."""
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)

    link_token = _make_steam_link_token(payload["id"])
    # M10 — sign dest into the state token (see /connect-init).
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    state = make_oauth_state("steam", safe_dest)
    return_to = (
        f"{STEAM_CALLBACK}?dest={_urlparse.quote(safe_dest, safe='/')}"
        f"&mode=connect&link_token={_urlparse.quote(link_token)}"
        f"&state={_urlparse.quote(state, safe='')}"
    )
    return {"url": _steam_openid_url(return_to)}
