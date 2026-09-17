"""auth_register.py — Registration, verification, password reset.

Extracted from auth.py. Handles new user registration, email verification,
forgot/reset password, and username checks.
"""
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import supabase

router = APIRouter()
log = logging.getLogger("auth.register")

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@aifazi.net")


# ── Models ───────────────────────────────────────────────────────────────────
class RegisterBody(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8)
    email: str | None = None


class ForgotBody(BaseModel):
    username: str


class ResetBody(BaseModel):
    username: str
    new_password: str = Field(min_length=8)


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
        return {"available": False, "reason": "Username taken"}
    staff = supabase.table("staff_users").select("username").eq("username", username.lower()).limit(1).execute()
    if staff.data:
        return {"available": False, "reason": "Username taken"}
    return {"available": True}


@router.get("/check-email")
async def check_email(email: str):
    """Check if email is registered."""
    if not email or "@" not in email:
        return {"registered": False}
    res = supabase.table("users").select("email").eq("email", email.lower()).limit(1).execute()
    return {"registered": bool(res.data)}


@router.post("/register")
async def register(body: RegisterBody):
    """Register a new user account."""
    username = body.username.strip().lower()
    password = body.password
    email = body.email

    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        raise HTTPException(400, "Username must be alphanumeric with underscores only.")

    # Check availability
    existing = supabase.table("users").select("username").eq("username", username).limit(1).execute()
    if existing.data:
        raise HTTPException(400, "Username already taken.")
    staff = supabase.table("staff_users").select("username").eq("username", username).limit(1).execute()
    if staff.data:
        raise HTTPException(400, "Username already taken.")

    # Hash password
    from passlib.hash import bcrypt
    hashed = bcrypt.hash(password)

    # Create user
    supabase.table("users").insert({
        "username": username,
        "hashed_password": hashed,
        "email": email or f"{username}@placeholder.local",
        "role": "user",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # Send verification email if email provided
    if email and "@" in email:
        token = secrets.token_urlsafe(32)
        supabase.table("email_verification_tokens").upsert({
            "username": username,
            "token": token,
            "expires_at": (datetime.now(timezone.utc) + __import__("datetime").timedelta(hours=24)).isoformat(),
        }, on_conflict="username").execute()
        # TODO: Send verification email via mail queue

    return {"ok": True, "message": "Account created. Please check your email for verification."}


@router.get("/verify-email")
async def verify_email_page():
    """Placeholder for email verification page."""
    return {"message": "Email verification endpoint"}


@router.get("/verify-email/{token}")
async def verify_email_token(token: str):
    """Verify email with token."""
    res = supabase.table("email_verification_tokens").select("username").eq("token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(400, "Invalid or expired token")
    username = res.data[0]["username"]
    supabase.table("users").update({"email_verified": True}).eq("username", username).execute()
    supabase.table("email_verification_tokens").delete().eq("token", token).execute()
    return {"ok": True, "message": "Email verified!"}


@router.post("/resend-verification")
async def resend_verification(body: ForgotBody):
    """Resend verification email."""
    username = body.username.strip().lower()
    res = supabase.table("users").select("username,email").eq("username", username).limit(1).execute()
    if not res.data:
        raise HTTPException(400, "User not found")
    user = res.data[0]
    if not user.get("email") or "@" not in user["email"]:
        raise HTTPException(400, "No valid email on file")
    token = secrets.token_urlsafe(32)
    supabase.table("email_verification_tokens").upsert({
        "username": username,
        "token": token,
        "expires_at": (datetime.now(timezone.utc) + __import__("datetime").timedelta(hours=24)).isoformat(),
    }, on_conflict="username").execute()
    return {"ok": True}


@router.get("/verify-status")
async def verify_status(username: str):
    """Check if a username is verified (for registration flow)."""
    res = supabase.table("users").select("email_verified").eq("username", username.strip().lower()).limit(1).execute()
    if not res.data:
        return {"verified": False, "exists": False}
    return {"verified": bool(res.data[0].get("email_verified")), "exists": True}


@router.post("/forgot")
async def forgot_password(body: ForgotBody):
    """Send password reset email."""
    username = body.username.strip().lower()
    res = supabase.table("users").select("username,email").eq("username", username).limit(1).execute()
    if not res.data:
        raise HTTPException(400, "User not found")
    user = res.data[0]
    token = secrets.token_urlsafe(32)
    supabase.table("password_reset_tokens").upsert({
        "username": username,
        "token": token,
        "expires_at": (datetime.now(timezone.utc) + __import__("datetime").timedelta(hours=1)).isoformat(),
    }, on_conflict="username").execute()
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
    """Reset password using token from email."""
    res = supabase.table("password_reset_tokens").select("username").eq("token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(400, "Invalid or expired token")
    username = res.data[0]["username"]
    from passlib.hash import bcrypt
    hashed = bcrypt.hash(body.new_password)
    supabase.table("users").update({"hashed_password": hashed}).eq("username", username).execute()
    supabase.table("password_reset_tokens").delete().eq("token", token).execute()
    return {"ok": True}


@router.get("/find-username")
async def find_username(email: str):
    """Find username by email (for password reset)."""
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email")
    res = supabase.table("users").select("username").eq("email", email.lower()).limit(1).execute()
    if not res.data:
        return {"found": False}
    return {"found": True, "username": res.data[0]["username"]}
