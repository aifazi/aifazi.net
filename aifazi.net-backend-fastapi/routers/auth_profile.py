"""auth_profile.py — User profile, avatar, change-password, account deletion.

Extracted from auth.py. Handles user self-service profile management.
"""
import logging
import uuid
from datetime import datetime, timezone

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from database import supabase
from dependencies import get_current_user

router = APIRouter()
log = logging.getLogger("auth.profile")


def _verify(pw: str, hashed: str) -> bool:
    """bcrypt verify that fails clean (False) on empty/legacy hashes."""
    if not hashed or not hashed.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    try:
        return _bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception as exc:
        log.error("bcrypt verify failed: %s", exc)
        return False


def _hash(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

# Avatar upload limits (P1-4): 2 MB cap, image-only extensions; the stored
# Content-Type always comes from server-side magic-byte sniffing, never from
# the client-supplied header.
_AVATAR_MAX_BYTES = 2 * 1024 * 1024
_AVATAR_ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp"}
_AVATAR_ALLOWED_MIMES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def _sniff_avatar_mimetype(content: bytes) -> str:
    """Magic-byte sniff mirroring routers/upload.py::_sniff_mimetype, restricted
    to avatar image types. SVG/HTML/JS are explicitly detected so they can be
    rejected even when disguised with an image extension."""
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        return "image/webp"
    head = content[:512].lstrip().lower()
    if head.startswith(b"<svg") or b"<svg" in content[:1024].lower():
        return "image/svg+xml"
    if head.startswith((b"<html", b"<!doctype html", b"<script")):
        return "text/html"
    return "application/octet-stream"


# ── Models ───────────────────────────────────────────────────────────────────
class ProfileBody(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    website_url: str | None = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class DeleteAccountBody(BaseModel):
    current_password: str


# ── Routes ───────────────────────────────────────────────────────────────────
# NOTE: the users table uses profile_bio/profile_avatar (not display_name/
# avatar_url) and has no website_url column — display_name/website_url are
# accepted for client compat but only username-backed fields are persisted.
@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user profile."""
    username = user.get("username") or ""
    res = supabase.table("users").select("username,email,avatar,bio,profile_avatar,profile_bio,role,banned,created_at").eq("username", username).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    row = res.data[0]
    avatar = row.get("profile_avatar") or row.get("avatar") or ""
    bio = row.get("profile_bio") or row.get("bio") or ""
    return {**row, "display_name": username, "avatar_url": avatar, "bio": bio, "is_active": not row.get("banned", False)}


@router.put("/me")
async def update_me(body: ProfileBody, user: dict = Depends(get_current_user)):
    """Update current user profile."""
    username = user.get("username") or ""
    updates = {}
    if body.bio is not None:
        updates["profile_bio"] = body.bio[:1000]
        updates["bio"] = body.bio[:500]
    if body.avatar_url is not None:
        updates["profile_avatar"] = body.avatar_url[:500]
        updates["avatar"] = body.avatar_url[:500]
    # display_name/website_url have no backing columns — intentionally ignored.
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
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
    if not file or not isinstance(file, UploadFile):
        raise HTTPException(400, "No file provided")
    # Upload to Supabase Storage
    file_bytes = await file.read()
    if len(file_bytes) > _AVATAR_MAX_BYTES:
        raise HTTPException(413, "Avatar exceeds the 2 MB size limit")
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in _AVATAR_ALLOWED_EXTS:
        raise HTTPException(415, "Avatar must be a png, jpg, jpeg, or webp image")
    sniffed = _sniff_avatar_mimetype(file_bytes)
    if sniffed in ("image/svg+xml", "text/html", "application/javascript"):
        raise HTTPException(415, "SVG/HTML/JS files are not allowed as avatars")
    if sniffed not in _AVATAR_ALLOWED_MIMES:
        raise HTTPException(415, f"File type '{sniffed}' is not allowed")
    # Normalize the stored extension from the sniffed type so a mismatched
    # client extension can never be persisted.
    ext = _AVATAR_ALLOWED_MIMES[sniffed]
    path = f"avatars/{username}/{uuid.uuid4().hex[:8]}.{ext}"
    supabase.storage.from_("uploads").upload(path, file_bytes, {"content_type": sniffed})
    public_url = f"{supabase.storage.get_public_url(path)}"
    supabase.table("users").update({"profile_avatar": public_url, "avatar": public_url}).eq("username", username).execute()
    return {"avatar_url": public_url}


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    """Change password for authenticated user."""
    username = user.get("username") or ""
    res = supabase.table("users").select("password_hash").eq("username", username).limit(1).execute()
    if not res.data or not res.data[0].get("password_hash"):
        raise HTTPException(400, "Account uses external auth — cannot change password here.")
    if not _verify(body.current_password, res.data[0]["password_hash"]):
        raise HTTPException(400, "Current password is incorrect.")
    new_hash = _hash(body.new_password)
    supabase.table("users").update({"password_hash": new_hash}).eq("username", username).execute()
    return {"ok": True}


@router.delete("/account")
async def delete_account(body: DeleteAccountBody, user: dict = Depends(get_current_user)):
    """Delete current user account (soft-delete: anonymize + mark inactive).

    Requires the current password (mirrors the change-password pattern above).
    NOTE: main.py still needs an RL rule for this route (e.g. 3 attempts / 5 min)
    to throttle password-guessing against account deletion.
    """
    username = user.get("username") or ""
    res = supabase.table("users").select("password_hash").eq("username", username).limit(1).execute()
    if not res.data or not res.data[0].get("password_hash"):
        raise HTTPException(400, "This account uses social login and has no password — contact support to delete your account.")
    if not _verify(body.current_password, res.data[0]["password_hash"]):
        raise HTTPException(400, "Current password is incorrect.")
    supabase.table("users").update({
        "username": f"deleted_{uuid.uuid4().hex[:8]}",
        "profile_bio": "",
        "bio": "",
        "profile_avatar": "",
        "avatar": "",
        "password_hash": "",
        "banned": True,
    }).eq("username", username).execute()
    return {"ok": True}
