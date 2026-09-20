"""auth_2fa.py — Two-Factor Authentication (TOTP) endpoints.

Mirrors routers/auth.py (monolith): admin TOTP state lives in the admin_2fa
table, user TOTP in users.totp_secret/totp_enabled, recovery codes are
bcrypt-hashed dicts on the same rows. Tokens minted here include the
users-row id so /refresh can validate them.
"""
import logging
from datetime import datetime, timezone

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user
from utils.audit import record as _audit
from utils.rate_limit import (
    clear_2fa_failures as _2fa_clear_fails,
    is_2fa_locked as _2fa_locked,
    record_2fa_failure as _2fa_record_fail,
)

router = APIRouter()
log = logging.getLogger("auth.2fa")


def _is_env_admin(user: dict) -> bool:
    """True only for the env-configured admin (ADMIN_USERNAME). Other
    role=admin rows are staff accounts with their OWN users-row TOTP —
    they must never touch the shared admin_2fa slot."""
    from routers.auth import ADMIN_USERNAME

    return (user.get("username") or "") == ADMIN_USERNAME


# ── Models ───────────────────────────────────────────────────────────────────
class TwoFAVerifyBody(BaseModel):
    partial_token: str
    code: str


class TwoFAEnableBody(BaseModel):
    code: str


class TwoFADisableBody(BaseModel):
    password: str
    code: str | None = None


class RecoveryCodesBody(BaseModel):
    password: str = ""
    code: str = ""


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/2fa/status")
async def twofa_status(user: dict = Depends(get_current_user)):
    from routers.auth import _get_admin_2fa, _has_recovery_codes

    if _is_env_admin(user):
        row = _get_admin_2fa()
        return {
            "enabled": bool(row and row.get("enabled")),
            "recovery_codes": _has_recovery_codes("admin", ""),
        }
    res = supabase.table("users").select("totp_enabled").eq("id", user["id"]).execute()
    return {
        "enabled": bool(res.data and res.data[0].get("totp_enabled")),
        "recovery_codes": _has_recovery_codes("user", user["id"]),
    }


@router.post("/2fa/setup")
async def twofa_setup(user: dict = Depends(get_current_user)):
    from routers.auth import ADMIN_USERNAME, _make_qr_b64, _upsert_admin_2fa

    secret = pyotp.random_base32()
    label = user.get("username", ADMIN_USERNAME)
    uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name="aifazi.net")
    if _is_env_admin(user):
        _upsert_admin_2fa({"totp_secret": secret, "enabled": False})
    else:
        supabase.table("users").update(
            {"totp_secret": secret, "totp_enabled": False}
        ).eq("id", user["id"]).execute()
    return {"secret": secret, "otpauth_uri": uri, "qr_image": _make_qr_b64(uri)}


@router.post("/2fa/enable")
async def twofa_enable(body: TwoFAEnableBody, user: dict = Depends(get_current_user)):
    from routers.auth import _get_admin_2fa, _rotate_recovery_codes, _upsert_admin_2fa

    if _is_env_admin(user):
        row = _get_admin_2fa()
        if not row or not row.get("totp_secret"):
            raise HTTPException(400, "Call /2fa/setup first")
        if not pyotp.TOTP(row["totp_secret"]).verify(body.code, valid_window=1):
            raise HTTPException(400, "Invalid code")
        _upsert_admin_2fa({"enabled": True})
        recovery = _rotate_recovery_codes("admin", "")
    else:
        res = supabase.table("users").select("totp_secret").eq("id", user["id"]).execute()
        if not res.data or not res.data[0].get("totp_secret"):
            raise HTTPException(400, "Call /2fa/setup first")
        if not pyotp.TOTP(res.data[0]["totp_secret"]).verify(body.code, valid_window=1):
            raise HTTPException(400, "Invalid code")
        supabase.table("users").update({"totp_enabled": True}).eq("id", user["id"]).execute()
        recovery = _rotate_recovery_codes("user", user["id"])
    _audit(user.get("username"), "2fa_enabled")
    return {"enabled": True, "recovery_codes": recovery}


@router.post("/2fa/confirm")
async def twofa_confirm(body: TwoFAEnableBody, user: dict = Depends(get_current_user)):
    """Alias: frontend calls /2fa/confirm → same logic as /2fa/enable."""
    return await twofa_enable(body, user)


@router.post("/2fa/disable")
async def twofa_disable(body: TwoFADisableBody, user: dict = Depends(get_current_user)):
    from routers.auth import (
        _check_admin_password,
        _get_admin_2fa,
        _upsert_admin_2fa,
        _verify,
        _verify_2fa_entry,
    )

    if _is_env_admin(user):
        if not _check_admin_password(body.password):
            raise HTTPException(400, "Invalid password")
        row = _get_admin_2fa()
        if row and row.get("enabled") and row.get("totp_secret"):
            if not _verify_2fa_entry("admin", "", row["totp_secret"], body.code or ""):
                raise HTTPException(400, "Invalid 2FA code")
        _upsert_admin_2fa({"enabled": False, "totp_secret": None, "recovery_codes": None})
    else:
        res = supabase.table("users").select(
            "password_hash,totp_secret,totp_enabled"
        ).eq("id", user["id"]).execute()
        if not res.data:
            raise HTTPException(404, "Not found")
        s = res.data[0]
        if not _verify(body.password, s.get("password_hash") or ""):
            raise HTTPException(400, "Invalid password")
        if s.get("totp_enabled") and s.get("totp_secret"):
            if not _verify_2fa_entry("user", user["id"], s["totp_secret"], body.code or ""):
                raise HTTPException(400, "Invalid 2FA code")
        supabase.table("users").update(
            {"totp_enabled": False, "totp_secret": None, "recovery_codes": None}
        ).eq("id", user["id"]).execute()
    _audit(user.get("username"), "2fa_disabled")
    return {"enabled": False}


@router.post("/2fa/recovery-codes")
async def twofa_recovery_codes(body: RecoveryCodesBody, user: dict = Depends(get_current_user)):
    """Regenerate recovery codes. Requires password AND a valid 2FA entry."""
    from routers.auth import (
        _check_admin_password,
        _get_admin_2fa,
        _rotate_recovery_codes,
        _verify,
        _verify_2fa_entry,
    )

    if _is_env_admin(user):
        if not _check_admin_password(body.password):
            raise HTTPException(400, "Invalid password")
        row = _get_admin_2fa()
        secret = (row or {}).get("totp_secret")
        if secret and not _verify_2fa_entry("admin", "", secret, body.code):
            raise HTTPException(400, "Invalid 2FA code")
    else:
        res = supabase.table("users").select(
            "password_hash,totp_secret,totp_enabled"
        ).eq("id", user["id"]).execute()
        if not res.data:
            raise HTTPException(404, "Not found")
        s = res.data[0]
        if not _verify(body.password, s.get("password_hash") or ""):
            raise HTTPException(400, "Invalid password")
        if s.get("totp_enabled") and s.get("totp_secret"):
            if not _verify_2fa_entry("user", user["id"], s["totp_secret"], body.code):
                raise HTTPException(400, "Invalid 2FA code")
    codes = _rotate_recovery_codes("admin" if _is_env_admin(user) else "user",
                                   "" if _is_env_admin(user) else user["id"])
    _audit(user.get("username"), "2fa_recovery_codes_rotated")
    return {"recovery_codes": codes}


@router.post("/2fa/verify")
async def twofa_verify(body: TwoFAVerifyBody, request: Request, response: Response):
    """Complete login with the TOTP/recovery code for a tfa_pending partial."""
    from paseto_token import decode_token as _paseto_decode
    from routers.auth import (
        _get_admin_2fa,
        _send_new_device_alert,
        _set_auth_cookies,
        _upsert_forum_session,
        _verify_2fa_entry,
        make_refresh_token,
        make_token,
    )

    try:
        payload = _paseto_decode(body.partial_token, purpose="auth")
        if not payload:
            raise HTTPException(401, "Invalid or expired token")
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    if not payload.get("tfa_pending"):
        raise HTTPException(400, "Not a 2FA challenge token")
    username = payload.get("username") or "unknown"
    role = payload.get("role")
    user_id = payload.get("id")
    ip = request.client.host if request.client else ""
    if await _2fa_locked(username, ip):
        raise HTTPException(429, "Too many failed 2FA attempts. Try again later.")
    from routers.auth import ADMIN_USERNAME as _ADMIN_USERNAME

    if username == _ADMIN_USERNAME:
        row = _get_admin_2fa()
        if not row or not row.get("totp_secret"):
            raise HTTPException(500, "2FA not configured on server")
        if not _verify_2fa_entry("admin", "", row["totp_secret"], body.code):
            await _2fa_record_fail(username, ip)
            _audit(username, "2fa_failed", ip=ip)
            raise HTTPException(400, "Invalid code")
        token = make_token({"username": username, "role": role, "id": user_id})
        refresh = make_refresh_token({"username": username, "role": role, "id": user_id}, 60 * 24 * 7)
        if user_id:
            supabase.table("users").update({
                "refresh_token": refresh,
                "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }).eq("id", user_id).execute()
        await _2fa_clear_fails(username, ip)
        _audit(username, "admin_login_2fa", target="admin_panel", ip=ip)
        if user_id and _upsert_forum_session(user_id, username, ip, request.headers.get("user-agent", "")):
            _send_new_device_alert(username, (row or {}).get("email") or "", ip, request.headers.get("user-agent", ""))
        _set_auth_cookies(response, token, refresh)
        return {"token": token, "refreshToken": refresh, "user": {"username": username, "role": role}}
    res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    s = res.data[0]
    if not _verify_2fa_entry("user", user_id, s.get("totp_secret") or "", body.code):
        await _2fa_record_fail(username, ip)
        _audit(username, "2fa_failed", ip=ip)
        raise HTTPException(400, "Invalid code")
    token = make_token({"username": s["username"], "role": s["role"], "id": s["id"]})
    refresh = make_refresh_token({"username": s["username"], "role": s["role"], "id": s["id"]}, 60 * 24 * 7)
    supabase.table("users").update({
        "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
    }).eq("id", s["id"]).execute()
    await _2fa_clear_fails(username, ip)
    _audit(username, "staff_login_2fa", target="admin_panel", ip=ip)
    if _upsert_forum_session(s["id"], s["username"], ip, request.headers.get("user-agent", "")):
        _send_new_device_alert(s["username"], s.get("email") or "", ip, request.headers.get("user-agent", ""))
    _set_auth_cookies(response, token, refresh)
    return {"token": token, "refreshToken": refresh, "user": {"username": username, "role": role}}
