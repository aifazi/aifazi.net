"""auth_login.py — Login / Refresh / Logout endpoints.

Extracted from auth.py. Handles admin, staff, and forum user authentication
with password verification and optional 2FA challenge.
"""
import logging
import os
import secrets

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from database import supabase
from dependencies import create_token, decode_token

router = APIRouter()
log = logging.getLogger("auth.login")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")


# ── Models ───────────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    username: str = ""
    password: str = Field(min_length=1)
    totp_code: str | None = None


# ── Routes ───────────────────────────────────────────────────────────────────
@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    username = (body.username or "").strip().lower()
    password = body.password

    if not username or not password:
        raise HTTPException(400, "Username and password are required.")

    # ── Admin check ──────────────────────────────────────────────────────
    if username == "admin" and ADMIN_PASSWORD:
        import hmac as _hmac
        if _hmac.compare_digest(password, ADMIN_PASSWORD):
            return await _issue_and_set_cookies(response, username, "admin")

    # ── Forum user check ─────────────────────────────────────────────────
    if username.startswith("forum_"):
        raise HTTPException(400, "Forum accounts cannot log in with this form.")

    # ── Staff check ──────────────────────────────────────────────────────
    res = (
        supabase.table("staff_users")
        .select("username,password_hash,role")
        .eq("username", username)
        .limit(1)
        .execute()
    )
    staff = res.data[0] if res.data else None

    # ── Regular user check ───────────────────────────────────────────────
    if not staff:
        user_res = supabase.table("users").select("username,hashed_password,role").eq("username", username).limit(1).execute()
        user = user_res.data[0] if user_res.data else None
        if user and user.get("hashed_password"):
            from passlib.hash import bcrypt
            if bcrypt.verify(password, user["hashed_password"]):
                # Check 2FA if enabled
                totp_res = supabase.table("users").select("totp_enabled").eq("username", username).limit(1).execute()
                if totp_res.data and totp_res.data[0].get("totp_enabled"):
                    if not body.totp_code:
                        partial = create_token({"sub": username, "role": user.get("role", "user")}, purpose="auth", expires_in=600)
                        return {"requires_2fa": True, "partial_token": partial}
                    # Verify TOTP
                    import pyotp
                    secret_res = supabase.table("staff_users").select("totp_secret").eq("username", username).limit(1).execute()
                    if secret_res.data and secret_res.data[0].get("totp_secret"):
                        totp = pyotp.TOTP(secret_res.data[0]["totp_secret"])
                        if not totp.verify(body.totp_code, valid_window=1):
                            raise HTTPException(400, "Invalid 2FA code")
                return await _issue_and_set_cookies(response, username, user.get("role", "user"))
        raise HTTPException(401, "Invalid credentials.")

    # ── Staff login ──────────────────────────────────────────────────────
    from passlib.hash import bcrypt
    if not bcrypt.verify(password, staff["password_hash"]):
        raise HTTPException(401, "Invalid credentials.")

    role = staff.get("role", "staff")

    # Check 2FA
    totp_res = supabase.table("staff_users").select("totp_enabled").eq("username", username).limit(1).execute()
    if totp_res.data and totp_res.data[0].get("totp_enabled"):
        if not body.totp_code:
            partial = create_token({"sub": username, "role": role}, purpose="auth", expires_in=600)
            return {"requires_2fa": True, "partial_token": partial}
        import pyotp
        secret_res = supabase.table("staff_users").select("totp_secret").eq("username", username).limit(1).execute()
        if secret_res.data and secret_res.data[0].get("totp_secret"):
            totp = pyotp.TOTP(secret_res.data[0]["totp_secret"])
            if not totp.verify(body.totp_code, valid_window=1):
                raise HTTPException(400, "Invalid 2FA code")

    return await _issue_and_set_cookies(response, username, role)


async def _issue_and_set_cookies(response: Response, username: str, role: str):
    """Issue tokens and set secure cookies."""
    from routers.auth import _issue_tokens, _set_auth_cookies
    token, refresh = _issue_tokens(username, role)
    _set_auth_cookies(response, token, refresh)
    return {"token": token, "refreshToken": refresh}


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    """Refresh an expired access token using the refresh token cookie."""
    refresh = request.cookies.get("refresh_token")
    if not refresh:
        raise HTTPException(401, "Missing refresh token.")
    try:
        payload = decode_token(refresh, purpose="refresh")
    except Exception:
        raise HTTPException(401, "Invalid or expired refresh token.")
    username = payload.get("sub") or payload.get("username") or ""
    role = payload.get("role", "user")
    from routers.auth import _issue_tokens, _set_auth_cookies
    token, new_refresh = _issue_tokens(username, role)
    _set_auth_cookies(response, token, new_refresh)
    return {"token": token, "refreshToken": new_refresh}


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookies."""
    response.delete_cookie("auth_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}
