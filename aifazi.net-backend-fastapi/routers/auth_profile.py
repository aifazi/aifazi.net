"""auth_profile.py — User profile, avatar, change-password, account deletion.

Extracted from auth.py. Handles user self-service profile management.
"""
import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, require_staff

router = APIRouter()
log = logging.getLogger("auth.profile")


# ── Models ───────────────────────────────────────────────────────────────────
class ProfileBody(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    website_url: str | None = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user profile."""
    username = user.get("username") or ""
    res = supabase.table("users").select("username,display_name,bio,avatar_url,website_url,role,created_at").eq("username", username).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    return res.data[0]


@router.put("/me")
async def update_me(body: ProfileBody, user: dict = Depends(get_current_user)):
    """Update current user profile."""
    username = user.get("username") or ""
    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.bio is not None:
        updates["bio"] = body.bio[:500]
    if body.avatar_url is not None:
        updates["avatar_url"] = body.avatar_url
    if body.website_url is not None:
        updates["website_url"] = body.website_url
    if updates:
        supabase.table("users").update(updates).eq("username", username).execute()
    return {"ok": True}


@router.put("/profile")
async def update_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    """Alias for /me PUT — backward compat."""
    return await update_me(body, user)


@router.post("/avatar")
async def upload_avatar(request: Request, user: dict = Depends(get_current_user)):
    """Upload an avatar image (multipart/form-data)."""
    username = user.get("username") or ""
    form = await request.form()
    file = form.get("file")
    if not file:
        raise HTTPException(400, "No file provided")
    # Upload to Supabase Storage
    file_bytes = await file.read()
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png"
    path = f"avatars/{username}/{uuid.uuid4().hex[:8]}.{ext}"
    supabase.storage.from_("uploads").upload(path, file_bytes, {"content_type": file.content_type or "image/png"})
    public_url = f"{supabase.storage.get_public_url(path)}"
    supabase.table("users").update({"avatar_url": public_url}).eq("username", username).execute()
    return {"avatar_url": public_url}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    """Change password for authenticated user."""
    username = user.get("username") or ""
    res = supabase.table("users").select("hashed_password").eq("username", username).limit(1).execute()
    if not res.data or not res.data[0].get("hashed_password"):
        raise HTTPException(400, "Account uses external auth — cannot change password here.")
    from passlib.hash import bcrypt
    if not bcrypt.verify(body.current_password, res.data[0]["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect.")
    new_hash = bcrypt.hash(body.new_password)
    supabase.table("users").update({"hashed_password": new_hash}).eq("username", username).execute()
    return {"ok": True}


@router.delete("/account")
async def delete_account(request: Request, user: dict = Depends(get_current_user)):
    """Delete current user account (soft-delete: anonymize + mark inactive)."""
    username = user.get("username") or ""
    supabase.table("users").update({
        "username": f"deleted_{uuid.uuid4().hex[:8]}",
        "display_name": "Deleted User",
        "bio": "",
        "avatar_url": "",
        "hashed_password": "",
        "is_active": False,
    }).eq("username", username).execute()
    return {"ok": True}
