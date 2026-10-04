"""
routers/authentik_oidc.py — Sign in to aifazi.net with Authentik (OIDC).

Flow:
  1. GET /api/auth/authentik/login  → redirect to Authentik authorize
  2. GET /api/auth/authentik/callback → code → token → userinfo → PASETO cookies
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse as _Redir
from fastapi.security import HTTPAuthorizationCredentials

from database import supabase
from routers.auth_shared import (
    ACTIVE_IDENTITY_MESSAGE,
    _active_identity_locked,
    _auth_log,
    _audit,
    _ensure_identity_available,
    _find_user_by_ci,
    _get_forum_user,
    _next_available_username,
    _normalized_email,
    _record_user_activity,
    _upsert_forum_session,
    bearer,
)
from utils.auth_tokens import _set_auth_cookies, make_forum_2fa_token, make_forum_token, make_refresh_token
from utils.mobile_oauth_codes import issue_code, mobile_fragment, state_echo
from utils.oauth_state import (
    _safe_relative_path,
    make_oauth_state,
    verify_oauth_state_full,
)

try:
    import httpx as _httpx
except ImportError:
    _httpx = None  # type: ignore[assignment]  # optional dep; guarded at use sites

log = logging.getLogger("authentik_oidc")
router = APIRouter()

API_URL = (os.getenv("API_URL") or "https://api.aifazi.net").rstrip("/")
SITE_URL = (os.getenv("SITE_URL") or "https://aifazi.net").rstrip("/")
MOBILE_AUTH_URL = os.getenv("MOBILE_AUTH_URL", "aifazi:///oauth/callback").rstrip("/")


def _ak():
    # Portal-over-env: site_config.settings.oauth.authentik wins over env vars
    # so the admin panel is the single place to rotate the secret (the Oct 2026
    # invalid_client incident was a DB↔env desync). Env stays as fallback.
    try:
        from routers.oauth_admin import get_authentik_config
        merged = get_authentik_config()
    except Exception:
        merged = {}
    return {
        "issuer": (merged.get("issuer") or os.getenv("AUTHENTIK_ISSUER") or "https://auth.aifazi.net").rstrip("/"),
        "client_id": merged.get("client_id") or os.getenv("AUTHENTIK_CLIENT_ID", "aifazi-net"),
        "client_secret": merged.get("client_secret") or os.getenv("AUTHENTIK_CLIENT_SECRET", ""),
        "redirect_uri": merged.get("redirect_uri") or os.getenv(
            "AUTHENTIK_REDIRECT_URI",
            f"{API_URL}/api/auth/authentik/callback",
        ),
    }


def _authorize_url(state: str) -> str:
    cfg = _ak()
    params = urlencode({
        "client_id": cfg["client_id"],
        "redirect_uri": cfg["redirect_uri"],
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
    })
    # Authentik application slug path
    return f"{cfg['issuer']}/application/o/authorize/?{params}"


def _ak_fail(request: Request, front: str, m_login: str, code: str, username: str = ""):
    """Log an Authentik login/connect failure to auth_logs (never raises) and
    build the error redirect. These rows feed the admin Identity panel's
    sign-in activity feed, so a future invalid_client-style outage is visible
    in the panel without VPS log access."""
    try:
        _client = getattr(request, "client", None)
        ip = getattr(_client, "host", "") or ""
    except Exception:
        ip = ""
    try:
        ua = (request.headers.get("user-agent", "") or "")[:200]
    except Exception:
        ua = ""
    _auth_log(username or "unknown", success=False, ip=ip or "", user_agent=ua,
              reason=f"authentik_error={code}")
    return _Redir(f"{front}{m_login}?authentik_error={code}")


@router.get("/authentik/login")
async def authentik_login(dest: str = "/forum/profile", mobile: int = 0, state: str = ""):
    """Start the Authentik OIDC flow.

    H2/C6 — the mobile app appends its own one-time `state` (CSPRNG hex); it is
    carried inside the HMAC-signed OAuth state and echoed back in the deep-link
    fragment so the app can verify the redirect belongs to its own flow.
    """
    cfg = _ak()
    if not cfg["client_id"] or not cfg["client_secret"]:
        raise HTTPException(500, "Authentik OIDC not configured")
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    extra = {"state": state[:128]} if state else None
    try:
        signed_state = make_oauth_state("authentik", safe_dest, mobile=bool(mobile), extra=extra)
    except ValueError:
        signed_state = make_oauth_state("authentik", safe_dest, mobile=bool(mobile))
    return _Redir(_authorize_url(signed_state))


@router.get("/authentik/connect-url")
async def authentik_connect_url(dest: str = "/profile", creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    cfg = _ak()
    if not cfg["client_id"]:
        raise HTTPException(500, "Authentik OIDC not configured")
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    # connect mode: reuse oauth state with marker
    safe_dest = _safe_relative_path(dest, default="/profile")
    state = make_oauth_state("authentik", f"connect:{payload['id']}:{safe_dest}", mobile=False)
    return {"url": _authorize_url(state)}


@router.get("/authentik/callback")
async def authentik_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    cfg = _ak()
    if not _httpx:
        raise HTTPException(500, "httpx not installed")
    if error or not code:
        return _ak_fail(request, SITE_URL, "/login", "1")

    dest = "/forum/profile"
    mode = "login"
    connect_user_id = None
    st = {"dest": dest, "mobile": False}
    state_value = state or ""
    if state_value.startswith("connect:"):
        # signed state may wrap connect payload — try normal verify first
        try:
            st = verify_oauth_state_full(state_value, "authentik")
            dest = str(st.get("dest") or dest)
            if dest.startswith("connect:"):
                parts = dest.split(":", 2)
                mode = "connect"
                connect_user_id = parts[1]
                dest = _safe_relative_path(parts[2], default="/profile")
        except ValueError:
            return _ak_fail(request, SITE_URL, "/login", "state")
    else:
        try:
            st = verify_oauth_state_full(state_value, "authentik")
            dest = str(st.get("dest") or dest)
        except ValueError:
            return _ak_fail(request, SITE_URL, "/login", "state")

    front = SITE_URL
    if st.get("mobile"):
        front = f"{MOBILE_AUTH_URL}/authentik"
    m_login = "" if st.get("mobile") else "/login"

    # Exchange code
    token_url = f"{cfg['issuer']}/application/o/token/"
    try:
        async with _httpx.AsyncClient() as c:
            tok = await c.post(token_url, data={
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": cfg["redirect_uri"],
            }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=15)
        if tok.status_code != 200:
            log.error("Authentik token exchange failed: %s %s", tok.status_code, tok.text[:200])
            return _ak_fail(request, front, m_login, "2")
        access_token = tok.json().get("access_token")
        if not access_token:
            return _ak_fail(request, front, m_login, "2")
    except Exception as exc:
        log.error("Authentik token exchange exception: %s", exc)
        return _ak_fail(request, front, m_login, "2")

    userinfo_url = f"{cfg['issuer']}/application/o/userinfo/"
    try:
        async with _httpx.AsyncClient() as c:
            me = await c.get(userinfo_url, headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
        if me.status_code != 200:
            log.error("Authentik userinfo failed: %s %s", me.status_code, me.text[:200])
            return _ak_fail(request, front, m_login, "3")
        u = me.json()
        ak_sub = str(u.get("sub") or "")
        ak_email = (u.get("email") or "").strip().lower()
        ak_name = u.get("name") or u.get("preferred_username") or u.get("nickname") or ""
        ak_username = u.get("preferred_username") or ak_name or (ak_email.split("@")[0] if ak_email else "user")
    except Exception as exc:
        log.error("Authentik userinfo exception: %s", exc)
        return _ak_fail(request, front, m_login, "3")

    if not ak_sub:
        return _ak_fail(request, front, m_login, "3")

    now = datetime.now(timezone.utc).isoformat()
    try:
        if mode == "connect":
            current_user_id = connect_user_id
            if not current_user_id:
                return _ak_fail(request, SITE_URL, "/profile", "link")
            row = supabase.table("users").select("*").eq("id", current_user_id).execute()
            if not row.data:
                return _ak_fail(request, SITE_URL, "/profile", "missing")
            user = row.data[0]
            supabase.table("users").update({
                "authentik_id": ak_sub,
                "last_seen": now,
            }).eq("id", current_user_id).execute()
            user = {**user, "authentik_id": ak_sub}
        else:
            ex = supabase.table("users").select("*").eq("authentik_id", ak_sub).execute()
            if ex.data:
                user = ex.data[0]
                supabase.table("users").update({"last_seen": now}).eq("id", user["id"]).execute()
            else:
                user = None
                if ak_email:
                    user = _find_user_by_ci("email", ak_email, "*")
                    if user and not user.get("email_verified"):
                        return _ak_fail(request, SITE_URL, "/login", "email_unverified",
                                        ak_email or ak_username)
                    if user:
                        _ensure_identity_available("authentik_id", ak_sub, user["id"], "Authentik account")
                        supabase.table("users").update({
                            "authentik_id": ak_sub,
                            "last_seen": now,
                        }).eq("id", user["id"]).execute()
                if not user:
                    uname = _next_available_username(ak_username)
                    row = supabase.table("users").insert({
                        "username": uname,
                        "email": _normalized_email(ak_email) or f"{ak_sub[:16]}@authentik.local",
                        "password_hash": "",
                        "email_verified": True,
                        "authentik_id": ak_sub,
                        # NOTE: users has no display_name column — ak_name is
                        # surfaced only in API responses, never persisted.
                        "role": "user",
                        "created_at": now,
                        "last_seen": now,
                    }).execute()
                    user = row.data[0] if row.data else None
                    if not user:
                        return _ak_fail(request, front, m_login, "db", ak_username)
    except Exception as exc:
        log.error("Authentik callback db error: %s", exc)
        return _ak_fail(request, front, m_login, "db")

    if not user:
        return _ak_fail(request, front, m_login, "db")
    if user.get("banned"):
        return _ak_fail(request, front, m_login, "banned", user.get("username") or "")

    if mode != "connect" and user.get("totp_enabled") and user.get("totp_secret"):
        partial = make_forum_2fa_token(user["id"], user["username"], user.get("role", "user"), "authentik")
        safe_dest = _safe_relative_path(dest if isinstance(dest, str) else "/profile", default="/profile")
        return _Redir(
            front + m_login + "#twofa=forum&partial_token=" + quote(str(partial), safe='')
            + "&username=" + quote(str(user.get('username', '')), safe='')
            + "&next=" + quote(safe_dest, safe='/')
            + state_echo(st.get("extra"))
        )

    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    refresh = make_refresh_token(
        {"id": user["id"], "username": user["username"], "role": user.get("role", "user")},
        60 * 24 * 7,
    )
    try:
        supabase.table("users").update({
            "refresh_token": refresh,
            "refresh_rotated_at": now,
            "last_seen": now,
        }).eq("id", user["id"]).execute()
    except Exception:
        pass

    _audit(user["username"], "authentik_login" if mode != "connect" else "authentik_connect",
           details={"sub": ak_sub[:16]})
    _auth_log(user["username"], success=True, role=user.get("role", "user"), reason="authentik_login")
    _record_user_activity(
        user["id"], user["username"],
        "authentik_connect" if mode == "connect" else "authentik_login",
        f"sub={ak_sub[:16]}",
    )
    try:
        _upsert_forum_session(user["id"], user["username"], "", "")
    except Exception:
        pass
    _set_auth_cookies(response, token, refresh)

    if st.get("mobile"):
        # H2/C6 — one-time exchange code in the app deep link, never a token:
        # the app exchanges it via POST /api/auth/mobile/exchange. Issue
        # failure fails closed (error param) — no token-in-URL fallback.
        safe_dest = _safe_relative_path(dest if isinstance(dest, str) else "/profile", default="/profile")
        try:
            code = issue_code("authentik", user["id"], user.get("username") or "", user.get("role", "user"), safe_dest)
        except Exception:
            log.error("authentik mobile code issue failed", exc_info=True)
            return _ak_fail(request, front, m_login, "db", user.get("username") or "")
        return _Redir(front + mobile_fragment(code, safe_dest) + state_echo(st.get("extra")))
    safe_dest = _safe_relative_path(dest if isinstance(dest, str) else "/profile", default="/profile")
    sep = "&" if "?" in safe_dest else "?"
    return _Redir(SITE_URL + safe_dest + sep + "authentik=1")
