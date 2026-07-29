"""
routers/chat_livekit.py — LiveKit token generation for voice/video/screen share.

LiveKit Cloud (free tier: 50 GB/month) provides an SFU that handles
NAT traversal and relay for mobile-data / firewalled users — no TURN
server configuration needed.

Set in .env:
  LIVEKIT_API_KEY      — from LiveKit Cloud dashboard
  LIVEKIT_API_SECRET   — from LiveKit Cloud dashboard
  LIVEKIT_URL          — wss://<project>.livekit.cloud
"""
import os
import logging
import secrets
import base64
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from jose import jwt
from database import supabase
from dependencies import get_current_user, require_staff, require_admin
from routers.chat import _ensure_room_access

log = logging.getLogger("chat_livekit")
router = APIRouter()

LIVEKIT_URL    = os.getenv("LIVEKIT_URL", "")
LIVEKIT_KEY    = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

# ── Room encryption key management ──────────────────────────────────────────
# Each chat room gets a persistent AES-256 key for E2EE.
# Voice/video uses it via LiveKit E2EE; text messages use it client-side.

def _get_or_create_room_key(room_id: str) -> str:
    """Fetch existing room key or generate a new one. Returns base64-encoded 256-bit key."""
    try:
        res = supabase.table("chat_rooms").select("encryption_key").eq("id", room_id).single().execute()
        if res.data and res.data.get("encryption_key"):
            return res.data["encryption_key"]
    except Exception:
        pass
    # Generate new key
    key = base64.b64encode(secrets.token_bytes(32)).decode()
    try:
        supabase.table("chat_rooms").update({"encryption_key": key}).eq("id", room_id).execute()
    except Exception:
        pass  # Column might not exist yet — key still works for this session
    return key


def _generate_token(
    identity: str,
    room_id: str,
    can_publish: bool = True,
    can_subscribe: bool = True,
    can_screen_share: bool = False,
    metadata: str = "",
    ttl_minutes: int = 120,
    e2ee_key: str = "",
) -> str:
    """Generate a LiveKit access token (standard JWT) with optional E2EE."""
    now = datetime.now(timezone.utc)
    payload = {
        "iss": LIVEKIT_KEY,
        "sub": identity,
        "name": identity,  # Display name for participants list
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "video": {
            "room": room_id,
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
            "canPublishData": True,
            "canPublishSources": (
                ["camera", "microphone", "screen_share"]
                if can_screen_share
                else ["camera", "microphone"]
            ),
        },
    }
    if e2ee_key:
        payload["e2ee"] = {"encryptionKey": e2ee_key}
    if metadata:
        payload["metadata"] = metadata
    return jwt.encode(payload, LIVEKIT_SECRET, algorithm="HS256")


class JoinRoomRequest(BaseModel):
    room_id: str
    room_name: str = ""


@router.get("/livekit/token")
async def get_livekit_token(
    room_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Generate a LiveKit access token for the current user to join a voice room."""
    if not LIVEKIT_URL or not LIVEKIT_KEY or not LIVEKIT_SECRET:
        raise HTTPException(503, "LiveKit env vars not set: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET")

    username = user.get("username", "unknown")
    role = user.get("role", "user")

    # Single query for all room data (was 3 separate queries)
    try:
        room = supabase.table("chat_rooms").select(
            "id,name,is_private,allowed_users,allowed_roles,speak_roles,screen_share_roles,encryption_key"
        ).eq("id", room_id).single().execute()
        r = room.data
    except Exception:
        r = {}

    if r:
        if r.get("is_private"):
            allowed = r.get("allowed_users") or []
            if username not in allowed and role not in ("admin", "moderator"):
                raise HTTPException(403, "You do not have access to this channel")

        allowed_roles = r.get("allowed_roles") or []
        if allowed_roles and role not in allowed_roles and role not in ("admin", "moderator"):
            raise HTTPException(403, f"Only {', '.join(allowed_roles)} can join this voice channel")

    can_publish = True
    can_screen_share = role in ("admin", "moderator")

    if r:
        speak_roles = r.get("speak_roles") or []
        screen_roles = r.get("screen_share_roles") or []
        if speak_roles and role not in speak_roles and role not in ("admin", "moderator"):
            can_publish = False
        if screen_roles and role not in screen_roles and role not in ("admin", "moderator"):
            can_screen_share = False

    metadata = json.dumps({
        "username": username,
        "role": role,
    })

    # Use encryption_key from the single query, or create if missing
    encryption_key = (r or {}).get("encryption_key") or ""
    if not encryption_key:
        encryption_key = _get_or_create_room_key(room_id)

    token = _generate_token(
        identity=username,
        room_id=room_id,
        can_publish=can_publish,
        can_subscribe=True,
        can_screen_share=can_screen_share,
        metadata=metadata,
        e2ee_key=encryption_key,
    )

    return {
        "token": token,
        "url": LIVEKIT_URL,
        "can_publish": can_publish,
        "can_screen_share": can_screen_share,
        "identity": username,
        "username": username,
        "role": role,
        "room": room_id,
        "encryption_key": encryption_key,
    }


@router.put("/rooms/{room_id}/voice-settings")
async def update_voice_settings(
    room_id: str,
    body: dict,
    _: dict = Depends(require_staff),
):
    """Set voice channel permissions for a room."""
    allowed = {}
    for key in ("speak_roles", "screen_share_roles", "allowed_roles"):
        if key in body:
            allowed[key] = body[key]

    if not allowed:
        raise HTTPException(400, "No voice settings provided")

    supabase.table("chat_rooms").update(allowed).eq("id", room_id).execute()
    return {"ok": True, "room_id": room_id, **allowed}


@router.get("/livekit/status")
async def livekit_status(_: dict = Depends(get_current_user)):
    """Check if LiveKit is configured."""
    return {
        "available": bool(LIVEKIT_URL and LIVEKIT_KEY and LIVEKIT_SECRET),
        "configured": bool(LIVEKIT_URL),
        "url_set": bool(LIVEKIT_URL),
        "key_set": bool(LIVEKIT_KEY),
        "secret_set": bool(LIVEKIT_SECRET),
    }


@router.get("/rooms/{room_id}/encryption-key")
async def get_text_encryption_key(
    room_id: str,
    user: dict = Depends(get_current_user),
):
    """Return the room's encryption key for client-side text message encryption."""
    _ensure_room_access(room_id, user)
    encryption_key = _get_or_create_room_key(room_id)
    return {
        "room_id": room_id,
        "encryption_key": encryption_key,
        "identity": user.get("username", "unknown"),
    }


@router.post("/rooms/{room_id}/rotate-key")
async def rotate_encryption_key(
    room_id: str,
    user: dict = Depends(require_admin),
):
    """Generate a new encryption key for the room. Admin-only. Old messages stay encrypted with old key."""
    new_key = base64.b64encode(secrets.token_bytes(32)).decode()
    try:
        supabase.table("chat_rooms").update({"encryption_key": new_key}).eq("id", room_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rotate key: {e}")
    return {
        "room_id": room_id,
        "encryption_key": new_key,
        "rotated_by": user.get("username", "unknown"),
        "rotated_at": datetime.now(timezone.utc).isoformat(),
        "warning": "Messages sent before this rotation will not be decryptable with the new key. Inform users to rejoin.",
    }
