"""Auth token minting + cookie helpers — extracted from routers/auth.py."""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Response

from paseto_token import create_token as _paseto_create_token
from paseto_token import decode_token as _paseto_decode_token

SECRET = os.environ.get("PASETO_SECRET", "")
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "")
ADMIN_GATE_SECRET = os.getenv("ADMIN_GATE_SECRET", "")


def make_token(payload: dict, expires_minutes: int = 60 * 24) -> str:
    """Mint an ACCESS token (PASETO v4 local). Carries `token_type: "access"`."""
    if not SECRET:
        raise HTTPException(503, "PASETO_SECRET is not configured")
    data = payload.copy()
    data["token_type"] = "access"
    return _paseto_create_token(data, expires_in=expires_minutes * 60, purpose="auth")


def make_refresh_token(payload: dict, expires_minutes: int = 60 * 24 * 7) -> str:
    """Mint a REFRESH token (PASETO v4 local). Distinguished by `token_type: "refresh"`."""
    if not SECRET:
        raise HTTPException(503, "PASETO_SECRET is not configured")
    data = payload.copy()
    data["token_type"] = "refresh"
    return _paseto_create_token(data, expires_in=expires_minutes * 60, purpose="auth")


def make_admin_gate_token(payload: dict, expires_minutes: int = 60 * 24) -> str:
    if not ADMIN_GATE_SECRET:
        raise HTTPException(503, "Admin gate secret is not configured")
    data = {
        "username": payload.get("username"),
        "role": payload.get("role"),
        "purpose": "admin_gate",
    }
    if payload.get("id"):
        data["id"] = payload.get("id")
    if payload.get("staff_id"):
        data["staff_id"] = payload.get("staff_id")
    # Use PASETO for admin gate token too (proxy.ts expects PASETO).
    # H4 — pass ADMIN_GATE_SECRET explicitly instead of mutating the
    # process-global os.environ["PASETO_SECRET"]. The old env-var swap raced
    # concurrent make_token() calls: a login happening during the swap window
    # could mint an access token with the admin-gate secret (or an admin-gate
    # token with the access secret), a subtle cross-role trust break.
    return _paseto_create_token(data, expires_in=expires_minutes * 60, purpose="admin_gate", secret=ADMIN_GATE_SECRET)


def make_forum_token(user_id: str, username: str, role: str) -> str:
    return _paseto_create_token({"id": user_id, "username": username, "role": role, "token_type": "access"}, expires_in=7 * 86400, purpose="auth")


def make_forum_2fa_token(user_id: str, username: str, role: str, provider: str = "password") -> str:
    return _paseto_create_token({"id": user_id, "username": username, "role": role, "tfa_pending": True, "provider": provider}, expires_in=5 * 60, purpose="auth")


def _set_auth_cookies(response: Response, access: str, refresh: str):
    """Set auth cookies via Set-Cookie headers.
    auth_token: HttpOnly Secure cookie containing the PASETO access token.
    refresh_token: HttpOnly Secure cookie for token refresh.
    admin_session: HttpOnly signed gate token for Next.js Edge middleware.
      It carries purpose=admin_gate and is rejected by backend bearer auth.
    """
    is_prod = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "production").lower() == "production"
    response.set_cookie(
        key="auth_token", value=access,
        httponly=True, secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24, path="/",
    )
    response.set_cookie(
        key="refresh_token", value=refresh,
        httponly=True, secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24 * 7, path="/",
    )
    # Decode PASETO access token for admin gate
    access_payload = _paseto_decode_token(access, purpose="auth") or {}
    response.set_cookie(
        key="admin_session", value=make_admin_gate_token(access_payload, 60 * 24 * 7),
        httponly=True,
        secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24 * 7, path="/",
    )


def _set_admin_gate_cookie(response: Response, gate_token: str):
    is_prod = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "production").lower() == "production"
    response.set_cookie(
        key="admin_session", value=gate_token,
        httponly=True,
        secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24 * 7, path="/",
    )

# ── Admin login ─────────────────────────────────────────────────────────────────

