"""auth_2fa.py — Two-Factor Authentication (TOTP) endpoints.

Extracted from auth.py for maintainability. Handles:
- 2FA status check
- TOTP setup / enable / confirm / disable
- Recovery codes generation
- 2FA verification during login
"""
import logging
import os
import secrets

import pyotp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, require_staff

router = APIRouter()
log = logging.getLogger("auth.2fa")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")


# ── Models ───────────────────────────────────────────────────────────────────
class TwoFAVerifyBody(BaseModel):
    code: str
    partial_token: str | None = None


class TwoFAEnableBody(BaseModel):
    code: str


class TwoFARecoveryBody(BaseModel):
    username: str


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/2fa/status")
async def twofa_status(user: dict = Depends(get_current_user)):
    username = user.get("username") or ""
    res = supabase.table("users").select("totp_enabled").eq("username", username).limit(1).execute()
    enabled = False
    if res.data:
        enabled = bool(res.data[0].get("totp_enabled", False))
    return {"enabled": enabled}


@router.post("/2fa/setup")
async def twofa_setup(user: dict = Depends(require_staff)):
    username = user.get("username") or ""
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=username,
        issuer_name="aifazi.net"
    )
    # Store secret temporarily (not enabled yet)
    supabase.table("staff_users").update({
        "totp_secret": secret
    }).eq("username", username).execute()
    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
    }


@router.post("/2fa/enable")
async def twofa_enable(body: TwoFAEnableBody, user: dict = Depends(require_staff)):
    username = user.get("username") or ""
    res = supabase.table("staff_users").select("totp_secret").eq("username", username).limit(1).execute()
    if not res.data or not res.data[0].get("totp_secret"):
        raise HTTPException(400, "Run /2fa/setup first")
    secret = res.data[0]["totp_secret"]
    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid 2FA code")
    supabase.table("staff_users").update({
        "totp_enabled": True
    }).eq("username", username).execute()
    # Generate recovery codes
    codes = [secrets.token_hex(6) for _ in range(10)]
    supabase.table("recovery_codes").upsert({
        "username": username,
        "codes": codes,
    }, on_conflict="username").execute()
    return {"ok": True, "recovery_codes": codes}


@router.post("/2fa/confirm")
async def twofa_confirm(body: TwoFAEnableBody, user: dict = Depends(require_staff)):
    return await twofa_enable(body, user)


@router.post("/2fa/disable")
async def twofa_disable(user: dict = Depends(require_staff)):
    username = user.get("username") or ""
    supabase.table("staff_users").update({
        "totp_enabled": False,
        "totp_secret": None,
    }).eq("username", username).execute()
    supabase.table("recovery_codes").delete().eq("username", username).execute()
    return {"ok": True}


@router.post("/2fa/recovery-codes")
async def twofa_recovery_codes(body: TwoFARecoveryBody, user: dict = Depends(require_staff)):
    username = user.get("username") or ""
    codes = [secrets.token_hex(6) for _ in range(10)]
    supabase.table("recovery_codes").upsert({
        "username": username,
        "codes": codes,
    }, on_conflict="username").execute()
    return {"recovery_codes": codes}


@router.post("/2fa/verify")
async def twofa_verify(body: TwoFAVerifyBody):
    """Verify 2FA code during login (uses partial_token from login response)."""
    from paseto_token import create_token as _mint, decode_token as _decode_partial
    if not body.partial_token:
        raise HTTPException(400, "Missing partial token")
    payload = _decode_partial(body.partial_token, purpose="auth")
    if not payload:
        raise HTTPException(401, "Invalid or expired partial token")
    if payload.get("tfa_pending") is not True:
        raise HTTPException(401, "Invalid partial token")
    username = payload.get("sub") or payload.get("username") or ""
    role = payload.get("role", "staff")
    # Check TOTP
    res = supabase.table("staff_users").select("totp_secret").eq("username", username).limit(1).execute()
    if not res.data or not res.data[0].get("totp_secret"):
        raise HTTPException(400, "2FA not set up for this account")
    secret = res.data[0]["totp_secret"]
    totp = pyotp.TOTP(secret)
    if totp.verify(body.code, valid_window=1):
        # Issue full token
        token = _mint({"sub": username, "role": role, "token_type": "access"}, purpose="auth")
        refresh = _mint({"sub": username, "role": role, "token_type": "refresh"}, purpose="refresh")
        return {"token": token, "refreshToken": refresh}
    # Check recovery codes
    rc = supabase.table("recovery_codes").select("codes").eq("username", username).limit(1).execute()
    if rc.data and body.code in (rc.data[0].get("codes") or []):
        codes = rc.data[0]["codes"]
        codes.remove(body.code)
        supabase.table("recovery_codes").update({"codes": codes}).eq("username", username).execute()
        token = _mint({"sub": username, "role": role, "token_type": "access"}, purpose="auth")
        refresh = _mint({"sub": username, "role": role, "token_type": "refresh"}, purpose="refresh")
        return {"token": token, "refreshToken": refresh}
    raise HTTPException(400, "Invalid 2FA code")
