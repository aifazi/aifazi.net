"""auth_profile.py — User profile, avatar, change-password, account deletion.

Extracted from auth.py. Handles user self-service profile management.
"""
import logging
import os
import uuid
from datetime import datetime, timezone

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from database import supabase
from dependencies import get_current_user
from routers.auth_shared import _get_forum_user, bearer

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
_AVATAR_URL_ALLOW_HOSTS = (
    "cdn.discordapp.com",
    "cdn.discord.com",
    "avatars.githubusercontent.com",
    "api.dicebear.com",
    "res.cloudinary.com",
)


def _validate_avatar_url(value: str) -> None:
    """Reject non-https / off-allowlist avatar URLs (stored-XSS guard)."""
    from urllib.parse import urlparse

    if not value:
        return
    try:
        parts = urlparse(value)
    except Exception:
        raise HTTPException(400, "Invalid avatar URL")
    if not parts.scheme:
        # Relative path — safe to store.
        if value.startswith(("http:", "https:", "javascript:", "data:", "vbscript:")):
            raise HTTPException(400, "Invalid avatar URL")
        return
    if parts.scheme != "https":
        raise HTTPException(400, "Avatar URL must use https")
    host = (parts.hostname or "").lower()
    supabase_host = ""
    try:
        supabase_host = (urlparse(os.environ.get("SUPABASE_URL", "")).hostname or "").lower()
    except Exception:
        supabase_host = ""
    allowed = set(_AVATAR_URL_ALLOW_HOSTS)
    if supabase_host:
        allowed.add(supabase_host)
    if host not in allowed and not any(host.endswith("." + a) for a in allowed):
        raise HTTPException(400, "Avatar host is not allowlisted")
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
        # P1 — allowlist avatar URLs: bare persistence of `javascript:` /
        # `data:text/html` / attacker-CDN URLs is a stored-XSS vector wherever
        # avatars render. Only https URLs on known-good hosts (or relative
        # paths) are stored; empty string clears the avatar.
        _validate_avatar_url(body.avatar_url)
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
    # P1-8 — sanitize the username path segment so a hostile username
    # (e.g. `../../x`) can never escape its prefix inside the bucket.
    from routers.upload import _safe_storage_filename as _safe_path_seg
    safe_username = _safe_path_seg(username) or "user"
    path = f"avatars/{safe_username}/{uuid.uuid4().hex[:8]}.{ext}"
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
    # P1-1 — revoke sessions on password change so a stolen/old refresh cookie
    # can't silently re-login (mirrors routers/auth.py revoke-on-reset).
    supabase.table("users").update({
        "password_hash": new_hash,
        "refresh_token": None, "previous_refresh_token": None,
        "reset_token": None, "reset_expires": None,
    }).eq("username", username).execute()
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
    # P1-1 — revoke sessions on account deletion (mirrors revoke-on-reset).
    # P1 — also scrub PII + OAuth link IDs so the deleted address can be
    # re-registered and linked accounts can't silently re-enter this row.
    tombstone = f"deleted_{uuid.uuid4().hex[:8]}@deleted.local"
    supabase.table("users").update({
        "username": f"deleted_{uuid.uuid4().hex[:8]}",
        "email": tombstone,
        "pending_email": None,
        "profile_bio": "",
        "bio": "",
        "profile_avatar": "",
        "avatar": "",
        "password_hash": "",
        "refresh_token": None, "previous_refresh_token": None,
        "reset_token": None, "reset_expires": None,
        "verify_token": None, "verify_expires": None,
        "discord_id": None, "discord_username": None, "discord_avatar": None,
        "steam_id": None, "steam_username": None, "steam_avatar": None,
        "github_id": None, "github_username": None, "github_avatar": None,
        "totp_secret": None, "totp_enabled": False,
        "recovery_codes": None,
        "banned": True,
    }).eq("username", username).execute()
    return {"ok": True}


# ── Activity log + helpdesk tickets (forum bearer auth) ─────────────────────────
@router.get("/activity")
async def user_activity_log(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    try:
        rows = supabase.table("user_activity_logs").select("action,detail,ip,created_at").eq("user_id", payload["id"]).order("created_at", desc=True).limit(50).execute()
        return rows.data or []
    except Exception:
        return []


@router.get("/my-tickets")
async def user_my_tickets(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_res = supabase.table("users").select("email").eq("id", payload["id"]).execute()
    email = (user_res.data[0].get("email", "") if user_res.data else "") or ""
    user_id = payload.get("id", "")
    select_cols = "id,ticket_id,subject,status,priority,created_at,updated_at,response,responded_at,category,email,user_id"
    seen: dict[str, dict] = {}
    try:
        res = supabase.table("helpdesk_tickets").select(select_cols).eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()
        for t in (res.data or []):
            if t["id"] in seen:
                continue
            t_uid = str(t.get("user_id") or "")
            t_em = (t.get("email") or "").strip().lower()
            if t_uid and t_em:
                if t_uid == user_id and t_em == email.lower():
                    seen[t["id"]] = t
            elif t_uid and t_uid == user_id or t_em and t_em == email.lower():
                seen[t["id"]] = t
    except Exception:
        pass
    if email:
        try:
            res_email = supabase.table("helpdesk_tickets").select(select_cols).eq("email", email).order("created_at", desc=True).limit(100).execute()
            for t in (res_email.data or []):
                if t["id"] in seen:
                    continue
                t_uid = str(t.get("user_id") or "")
                t_em = (t.get("email") or "").strip().lower()
                if t_uid and t_em:
                    if t_uid == user_id and t_em == email.lower():
                        seen[t["id"]] = t
                elif t_uid and t_uid == user_id or t_em and t_em == email.lower():
                    seen[t["id"]] = t
        except Exception:
            pass
    tickets = sorted(seen.values(), key=lambda t: t.get("created_at", ""), reverse=True)
    for t in tickets:
        t.pop("email", None)
        t.pop("user_id", None)
    return tickets
