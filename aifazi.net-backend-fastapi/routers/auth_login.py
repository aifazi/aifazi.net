"""auth_login.py — Login / Refresh / Logout endpoints.

Mirrors the data model of routers/auth.py (monolith): staff are `users`
rows with staff roles, admin is ADMIN_USERNAME with bcrypt-hashed
ADMIN_PASSWORD, forum users log in by email or username. Tokens carry the
users-row id; refresh validates + rotates server-side.
"""
import logging
from datetime import datetime, timezone

import bcrypt as _bcrypt
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from database import supabase
from permissions import normalize_permissions, role_permissions
from utils.audit import record as _audit
from utils.audit import record_auth as _auth_log

router = APIRouter()
log = logging.getLogger("auth.login")

_STAFF_ROLES = ("admin", "moderator", "editor", "chat")


def _verify(pw: str, hashed: str) -> bool:
    """bcrypt verify that fails clean (False) on empty/legacy hashes."""
    if not hashed or not hashed.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    try:
        return _bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception as exc:
        log.error("bcrypt verify failed: %s", exc)
        return False


# ── Models ───────────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str = Field(min_length=1)
    totp_code: str | None = None


class RefreshBody(BaseModel):
    refreshToken: str | None = None


# ── Routes ───────────────────────────────────────────────────────────────────
@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    from routers.auth import (
        ADMIN_USERNAME,
        _check_admin_password,
        _find_user_by_ci,
        _get_admin_2fa,
        _record_user_activity,
        _send_new_device_alert,
        _set_auth_cookies,
        _upsert_forum_session,
        make_forum_token,
        make_refresh_token,
        make_token,
    )

    client_ip = request.client.host if request.client else ""
    user_agent = request.headers.get("user-agent", "")
    username = (body.username or "").strip()
    password = body.password or ""

    if not username and not body.email:
        raise HTTPException(400, "Username and password are required.")

    # ── 1. Admin login ─────────────────────────────────────────────────────
    if username and username == ADMIN_USERNAME:
        if not _check_admin_password(password):
            _audit("unknown", "login_failed", target=username, ip=client_ip)
            _auth_log(username, success=False, ip=client_ip, user_agent=user_agent,
                      role="admin", reason="wrong_password")
            raise HTTPException(400, "Invalid credentials")
        fu = supabase.table("users").select("id").eq("username", ADMIN_USERNAME).limit(1).execute()
        forum_id = fu.data[0]["id"] if fu.data else None
        if not forum_id:
            now = datetime.now(timezone.utc).isoformat()
            fu2 = supabase.table("users").insert({
                "username": ADMIN_USERNAME, "email": f"{ADMIN_USERNAME}@aifazi.net",
                "email_verified": True, "role": "admin", "password_hash": "",
                "created_at": now, "last_seen": now,
            }).execute()
            forum_id = fu2.data[0]["id"] if fu2.data else None
        token = make_token({"username": ADMIN_USERNAME, "role": "admin", "id": forum_id})
        refresh = make_refresh_token({"username": ADMIN_USERNAME, "role": "admin", "id": forum_id}, 60 * 24 * 7)
        if forum_id:
            supabase.table("users").update({
                "refresh_token": refresh,
                "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }).eq("id", forum_id).execute()
        _audit(ADMIN_USERNAME, "admin_login", target="admin_panel",
               details={"role": "admin"}, ip=client_ip)
        _auth_log(ADMIN_USERNAME, success=True, ip=client_ip, user_agent=user_agent, role="admin")
        row = _get_admin_2fa()
        if row and row.get("enabled") and row.get("totp_secret"):
            partial = make_token({"username": ADMIN_USERNAME, "role": "admin", "id": forum_id, "tfa_pending": True}, 5)
            return {"requires_2fa": True, "partial_token": partial}
        if forum_id and _upsert_forum_session(forum_id, ADMIN_USERNAME, client_ip, user_agent):
            _send_new_device_alert(ADMIN_USERNAME, (row or {}).get("email") or f"{ADMIN_USERNAME}@aifazi.net", client_ip, user_agent)
        _set_auth_cookies(response, token, refresh)
        return {"token": token, "refreshToken": refresh, "user": {"username": ADMIN_USERNAME, "role": "admin"}}

    # ── 2. Staff login (by username, staff roles only) ──────────────────────
    if username:
        res = supabase.table("users").select("*").eq("username", username).execute()
        staff = res.data[0] if res.data else None
        if staff and staff.get("role") in _STAFF_ROLES:
            if not _verify(password, staff.get("password_hash") or ""):
                _audit("unknown", "login_failed", target=username, ip=client_ip)
                _auth_log(username, success=False, ip=client_ip, user_agent=user_agent,
                          role="", reason="wrong_password")
                raise HTTPException(400, "Invalid credentials")
            if staff.get("banned"):
                _auth_log(username, success=False, ip=client_ip, user_agent=user_agent,
                          role=staff.get("role", ""), reason="account_suspended")
                raise HTTPException(403, "Account suspended")
            perms = normalize_permissions(staff.get("staff_permissions") or role_permissions(staff.get("role")))
            token = make_token({"username": staff["username"], "role": staff["role"], "id": staff["id"], "permissions": perms})
            refresh = make_refresh_token({"username": staff["username"], "role": staff["role"], "id": staff["id"], "permissions": perms}, 60 * 24 * 7)
            supabase.table("users").update({
                "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
            }).eq("id", staff["id"]).execute()
            _audit(staff["username"], "staff_login", target="admin_panel",
                   details={"role": staff["role"]}, ip=client_ip)
            _auth_log(staff["username"], success=True, ip=client_ip, user_agent=user_agent,
                      role=staff.get("role", ""))
            if staff.get("totp_enabled") and staff.get("totp_secret"):
                partial = make_token({"username": staff["username"], "role": staff["role"], "id": staff["id"], "tfa_pending": True}, 5)
                return {"requires_2fa": True, "partial_token": partial}
            if _upsert_forum_session(staff["id"], staff["username"], client_ip, user_agent):
                _send_new_device_alert(staff["username"], staff.get("email") or "", client_ip, user_agent)
            _set_auth_cookies(response, token, refresh)
            return {"token": token, "refreshToken": refresh, "user": {"username": staff["username"], "role": staff["role"], "permissions": perms}}

    # ── 3. Forum login (by email or username, case-insensitive) ─────────────
    identifier = body.email or username or ""
    if not identifier:
        raise HTTPException(400, "Email or username is required")
    if "@" in identifier:
        user = _find_user_by_ci("email", identifier, "*")
    else:
        user = _find_user_by_ci("username", identifier, "*")
        if not user:
            user = _find_user_by_ci("email", identifier, "*")
    if not user:
        raise HTTPException(400, "Invalid credentials")
    if not _verify(password, user.get("password_hash") or ""):
        _auth_log(user["username"], success=False, ip=client_ip, user_agent=user_agent,
                  role=user.get("role", ""), reason="wrong_password")
        raise HTTPException(400, "Invalid credentials")
    if user.get("banned"):
        _auth_log(user["username"], success=False, ip=client_ip, user_agent=user_agent,
                  role=user.get("role", ""), reason="account_suspended")
        raise HTTPException(403, f"Account suspended: {user.get('ban_reason', '')}")
    if not user.get("email_verified"):
        raise HTTPException(403, "Email not verified")
    if user.get("totp_enabled") and user.get("totp_secret"):
        _auth_log(user["username"], success=True, ip=client_ip, user_agent=user_agent,
                  role=user.get("role", ""), reason="2fa_required")
        return {
            "requires_2fa": True,
            "partial_token": make_token({
                "username": user["username"], "role": user.get("role", "user"),
                "id": user["id"], "tfa_pending": True,
            }, 5),
            "verify_path": "/auth/2fa/verify",
            "user_type": "forum",
        }
    _auth_log(user["username"], success=True, ip=client_ip, user_agent=user_agent,
              role=user.get("role", ""), reason="login_success")
    _record_user_activity(user["id"], user["username"], "login", f"IP: {client_ip}", client_ip)
    if _upsert_forum_session(user["id"], user["username"], client_ip, user_agent):
        _send_new_device_alert(user["username"], user.get("email") or "", client_ip, user_agent)
    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    refresh = make_refresh_token({"id": user["id"], "username": user["username"], "role": user.get("role", "user")}, 60 * 24 * 7)
    supabase.table("users").update({
        "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
    }).eq("id", user["id"]).execute()
    _set_auth_cookies(response, token, refresh)
    return {
        "token": token,
        "refreshToken": refresh,
        "user": {
            "id": user["id"], "username": user["username"],
            "email": user["email"], "role": user.get("role", "user"),
            "avatar": user.get("avatar", ""), "bio": user.get("bio", ""),
        },
    }


@router.post("/refresh")
async def refresh_token(request: Request, response: Response, body: RefreshBody = RefreshBody()):
    """Refresh with DB validation + rotation (mirrors monolith FIX #4)."""
    import hmac as _hmac

    from paseto_token import decode_token as _paseto_decode
    from routers.auth import _REFRESH_ROTATION_GRACE, _set_auth_cookies, make_refresh_token, make_token

    token_str = request.cookies.get("refresh_token") or body.refreshToken or ""
    if not token_str:
        raise HTTPException(401, "No refresh token provided")
    try:
        payload = _paseto_decode(token_str, purpose="auth")
        if not payload:
            raise HTTPException(401, "Invalid refresh token")
    except Exception:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("purpose") not in ("auth",) or payload.get("tfa_pending"):
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("token_type") == "access":
        raise HTTPException(401, "Access token cannot be used as a refresh token")

    user_id = payload.get("id")
    username = payload.get("username")
    if user_id:
        row = supabase.table("users").select("refresh_token,previous_refresh_token,refresh_rotated_at").eq("id", user_id).execute()
        stored = (row.data[0].get("refresh_token") if row.data else None) or ""
        previous = (row.data[0].get("previous_refresh_token") if row.data else None) or ""
        rotated_at = (row.data[0].get("refresh_rotated_at") if row.data else None) or None
        if not stored:
            raise HTTPException(401, "Refresh token revoked or invalid")
        accepted = _hmac.compare_digest(stored, token_str)
        if not accepted and previous:
            accepted = _hmac.compare_digest(previous, token_str)
            age_s = _REFRESH_ROTATION_GRACE + 1
            if rotated_at:
                try:
                    age_s = (datetime.now(timezone.utc) - datetime.fromisoformat(str(rotated_at))).total_seconds()
                except Exception:
                    age_s = _REFRESH_ROTATION_GRACE + 1
            if age_s > _REFRESH_ROTATION_GRACE:
                accepted = False
        if not accepted:
            raise HTTPException(401, "Invalid refresh token")
        new_access = make_token({k: v for k, v in payload.items() if k != "exp"})
        new_refresh = make_refresh_token({k: v for k, v in payload.items() if k != "exp"}, 60 * 24 * 7)
        supabase.table("users").update({
            "previous_refresh_token": token_str,
            "refresh_token": new_refresh,
            "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user_id).execute()
        _set_auth_cookies(response, new_access, new_refresh)
        return {"token": new_access, "refreshToken": new_refresh}

    # Tokens without a users-row id (legacy admin) validate by username only.
    from routers.auth import ADMIN_USERNAME
    if username != ADMIN_USERNAME:
        raise HTTPException(401, "Invalid refresh token")
    new_access = make_token({k: v for k, v in payload.items() if k != "exp"})
    new_refresh = make_refresh_token({k: v for k, v in payload.items() if k != "exp"}, 60 * 24 * 7)
    _set_auth_cookies(response, new_access, new_refresh)
    return {"token": new_access, "refreshToken": new_refresh}


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Revoke server-side refresh + clear cookies (mirrors monolith M8)."""
    from paseto_token import decode_token as _paseto_decode
    from routers.auth import COOKIE_DOMAIN

    auth_header = request.headers.get("authorization", "")
    token_str = auth_header.replace("Bearer ", "", 1) if auth_header.startswith("Bearer ") else ""
    if not token_str:
        token_str = request.cookies.get("auth_token") or ""
    try:
        user = _paseto_decode(token_str, purpose="auth") if token_str else {}
    except Exception:
        user = {}
    if isinstance(user, dict) and user.get("impersonated"):
        # Impersonated ("view as") sessions hold the VICTIM's users-row id in
        # the token — revoking users.refresh_token here would log the victim
        # out of their real session (and the impersonated refresh was never
        # persisted, so there is nothing server-side to revoke). Clear the
        # client cookies, audit, and return WITHOUT touching the DB.
        _audit(str(user.get("impersonated_by") or "admin"), "impersonation_end",
               target=str(user.get("username") or ""),
               details={"impersonated": True, "via": "logout"},
               ip=request.client.host if request.client else "")
        response.delete_cookie("auth_token", path="/", domain=COOKIE_DOMAIN or None)
        response.delete_cookie("admin_session", path="/", domain=COOKIE_DOMAIN or None)
        response.delete_cookie("refresh_token", path="/", domain=COOKIE_DOMAIN or None)
        return {"message": "Logged out"}
    if isinstance(user, dict) and user.get("id"):
        supabase.table("users").update({
            "refresh_token": None,
            "previous_refresh_token": None,
        }).eq("id", user["id"]).execute()
    response.delete_cookie("auth_token", path="/", domain=COOKIE_DOMAIN or None)
    response.delete_cookie("admin_session", path="/", domain=COOKIE_DOMAIN or None)
    response.delete_cookie("refresh_token", path="/", domain=COOKIE_DOMAIN or None)
    return {"message": "Logged out"}
