"""auth_register.py — Registration, verification, password reset.

Extracted from auth.py. Handles new user registration, email verification,
forgot/reset password, and username checks.
"""
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import _escape_ilike, supabase
from utils.timezone import utc_now

router = APIRouter()
log = logging.getLogger("auth.register")


def _hash(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@aifazi.net")


def _token_expired(expires_at: str | None) -> bool:
    """True when a token's expires_at is missing, unparsable, or in the past."""
    if not expires_at:
        return True
    try:
        exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp < utc_now()
    except (ValueError, TypeError):
        return True


# ── Models ───────────────────────────────────────────────────────────────────
class RegisterBody(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8)
    email: str | None = None


class ForgotBody(BaseModel):
    """Accepts username OR email — Login.jsx/ForumAuth.jsx send {email}."""
    username: str | None = None
    email: str | None = None


class CheckUsernameBody(BaseModel):
    username: str = ""


class VerifyStatusBody(BaseModel):
    username: str | None = None
    email: str | None = None


class FindUsernameBody(BaseModel):
    email: str = ""


class ResetBody(BaseModel):
    username: str
    new_password: str = Field(min_length=8)


def _find_account(username: str | None = None, email: str | None = None):
    """Resolve a users row by username or email (case-insensitive)."""
    if username and username.strip():
        res = supabase.table("users").select("username,email").ilike("username", _escape_ilike(username.strip())).limit(5).execute()
        needle = username.strip().lower()
        row = next((r for r in (res.data or []) if (r.get("username") or "").lower() == needle), None)
        if row:
            return row
    if email and "@" in email:
        res = supabase.table("users").select("username,email").ilike("email", _escape_ilike(email.strip())).limit(5).execute()
        needle = email.strip().lower()
        return next((r for r in (res.data or []) if (r.get("email") or "").lower() == needle), None)
    return None


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/check-username")
async def check_username(username: str):
    """Check if username is available."""
    if not username or len(username) < 3:
        return {"available": False, "reason": "Too short"}
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        return {"available": False, "reason": "Invalid characters"}
    res = supabase.table("users").select("username").eq("username", username.lower()).limit(1).execute()
    if res.data:
        return {"available": False, "reason": "Not available"}
    return {"available": True}


@router.post("/check-username")
async def check_username_post(body: CheckUsernameBody):
    """POST twin (Login.jsx sends JSON body); same logic as GET."""
    return await check_username(body.username or "")


@router.get("/check-email")
async def check_email(email: str):
    """Anti-enumeration: always return a generic response (never reveal whether
    an email is registered). Rate limiting in main.py further throttles probes."""
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email")
    return {"ok": True}


@router.post("/register")
async def register(body: RegisterBody):
    """Register a new user account."""
    username = body.username.strip().lower()
    password = body.password
    email = body.email

    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        raise HTTPException(400, "Username must be alphanumeric with underscores only.")

    # Check availability (staff live in users with staff roles — one check covers all)
    existing = supabase.table("users").select("username").eq("username", username).limit(1).execute()
    if existing.data:
        raise HTTPException(400, "Username already taken.")

    # Hash password
    hashed = _hash(password)

    # Create user (banned defaults False = active; no is_active column)
    supabase.table("users").insert({
        "username": username,
        "password_hash": hashed,
        "email": email or f"{username}@placeholder.local",
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # Stash a verification token on the users row (mirrors monolith register).
    # NOTE: the verification email itself is sent by the mail-queue flow.
    if email and "@" in email:
        token = secrets.token_urlsafe(32)
        supabase.table("users").update({
            "verify_token": token,
            "verify_expires": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        }).eq("username", username).execute()

    return {"ok": True, "message": "Account created. Please check your email for verification."}


@router.get("/verify-email")
async def verify_email_page():
    """Placeholder for email verification page."""
    return {"message": "Email verification endpoint"}


@router.get("/verify-email/{token}")
async def verify_email_token(token: str):
    """Verify email with token (one-time-use: token cleared on success)."""
    res = supabase.table("users").select("username,verify_expires").eq("verify_token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(400, "Invalid or expired token")
    if _token_expired(res.data[0].get("verify_expires")):
        raise HTTPException(400, "Invalid or expired token")
    username = res.data[0]["username"]
    supabase.table("users").update({
        "email_verified": True, "verify_token": None, "verify_expires": None,
    }).eq("username", username).execute()
    return {"ok": True, "message": "Email verified!"}


@router.post("/resend-verification")
async def resend_verification(body: ForgotBody):
    """Resend verification email. Accepts username OR email (Login.jsx and
    ForumAuth.jsx send {email}). Anti-enumeration: always return ok True."""
    if not (body.username and body.username.strip()) and not (body.email and body.email.strip()):
        raise HTTPException(400, "Username or email is required.")
    row = _find_account(body.username, body.email)
    if not row:
        return {"ok": True}
    res = supabase.table("users").select("username,email").eq("username", row["username"]).limit(1).execute()
    if not res.data:
        return {"ok": True}
    user = res.data[0]
    if not user.get("email") or "@" not in user["email"]:
        return {"ok": True}
    token = secrets.token_urlsafe(32)
    supabase.table("users").update({
        "verify_token": token,
        "verify_expires": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
    }).eq("username", user["username"]).execute()
    return {"ok": True}


@router.get("/verify-status")
async def verify_status(username: str):
    """Check if a username is verified (for registration flow). Anti-enumeration:
    never reveal whether the account exists — unknown users read as unverified."""
    res = supabase.table("users").select("email_verified").eq("username", (username or "").strip().lower()).limit(1).execute()
    if not res.data:
        return {"verified": False}
    return {"verified": bool(res.data[0].get("email_verified"))}


@router.post("/verify-status")
async def verify_status_post(body: VerifyStatusBody):
    """POST twin (Login.jsx sends {email}). Unknown accounts read as unverified."""
    row = _find_account(body.username, body.email)
    if not row:
        return {"verified": False}
    res = supabase.table("users").select("email_verified").eq("username", row["username"]).limit(1).execute()
    if not res.data:
        return {"verified": False}
    return {"verified": bool(res.data[0].get("email_verified"))}


@router.post("/forgot")
async def forgot_password(body: ForgotBody):
    """Send password reset email. Accepts username OR email. Anti-enumeration:
    always return ok True regardless of whether the account exists."""
    if not (body.username and body.username.strip()) and not (body.email and body.email.strip()):
        raise HTTPException(400, "Username or email is required.")
    row = _find_account(body.username, body.email)
    if not row:
        return {"ok": True}
    username = row["username"]
    user_res = supabase.table("users").select("username,email").eq("username", username).limit(1).execute()
    if not user_res.data:
        return {"ok": True}
    token = secrets.token_urlsafe(32)
    supabase.table("users").update({
        "reset_token": token,
        "reset_expires": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }).eq("username", username).execute()
    # TODO: Send reset email via mail queue
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password_alias(body: ForgotBody):
    """Alias for /forgot — backward compat."""
    return await forgot_password(body)


@router.post("/reset")
async def reset_password(body: ResetBody):
    """Reset password with token (from email link)."""
    # This endpoint expects token in body — the frontend flow uses the token URL
    raise HTTPException(400, "Use /reset-password/{token} instead")


@router.post("/reset-password/{token}")
async def reset_password_with_token(token: str, body: ResetBody):
    """Reset password using token from email (one-time-use: token cleared)."""
    res = supabase.table("users").select("username,reset_expires").eq("reset_token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(400, "Invalid or expired token")
    if _token_expired(res.data[0].get("reset_expires")):
        raise HTTPException(400, "Invalid or expired token")
    username = res.data[0]["username"]
    hashed = _hash(body.new_password)
    supabase.table("users").update({
        "password_hash": hashed, "reset_token": None, "reset_expires": None,
    }).eq("username", username).execute()
    return {"ok": True}


@router.get("/find-username")
async def find_username(email: str):
    """Anti-enumeration: always return a generic response (never reveal whether
    an email is registered, and never disclose the username)."""
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email")
    return {"ok": True}


@router.post("/find-username")
async def find_username_post(body: FindUsernameBody):
    """POST twin (ForumAuth.jsx sends {email}); same generic response."""
    return await find_username(body.email or "")
