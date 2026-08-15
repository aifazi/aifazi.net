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
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import jwt  # PyJWT — LiveKit access tokens are standard HS256 JWTs
import httpx


class StoreE2EEKeyRequest(BaseModel):
    encrypted_key: str


class EnableE2EERequest(BaseModel):
    enabled: bool
from database import supabase
from dependencies import get_current_user, require_staff, require_admin
from routers.chat import _ensure_room_access, _role_allowed

log = logging.getLogger("chat_livekit")
router = APIRouter()

LIVEKIT_URL    = os.getenv("LIVEKIT_URL", "")
LIVEKIT_KEY    = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

# ── Room encryption key management ──────────────────────────────────────────
# Each chat room gets a persistent AES-256 key used to encrypt messages at rest
# and LiveKit media. NOTE: this is SERVER-SIDE encryption, not true end-to-end
# encryption — the key is stored on and served by the server, so a compromised
# server (or client) can decrypt everything.

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
    # Fail CLOSED: if the room can't be loaded (missing/deleted/DB error) we
    # reject the token request. The old `r = {}` fallback skipped every access
    # check and minted a publishing token for any room_id.
    try:
        room = supabase.table("chat_rooms").select(
            "id,name,is_private,allowed_users,allowed_roles,speak_roles,screen_share_roles,encryption_key"
        ).eq("id", room_id).limit(1).execute()
        r = (room.data or [None])[0]
    except Exception:
        r = None
    if not r:
        raise HTTPException(404, "Room not found")

    # Mirror chat._ensure_room_access: a user banned from the room must not get
    # a voice token either (the old path only checked private/role gates, so a
    # banned user could still join the voice channel).
    banned = (
        supabase.table("chat_bans")
        .select("id")
        .eq("room_id", room_id)
        .eq("username", username)
        .limit(1)
        .execute()
        .data
    )
    if banned:
        raise HTTPException(403, "You are banned from this channel")

    # Same access gate as text chat: roles + per-user allowlist.
    if not _role_allowed(r, user):
        raise HTTPException(403, "You do not have access to this channel")

    can_publish = True
    can_screen_share = role in ("admin", "moderator")

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
    encryption_key = r.get("encryption_key") or ""
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
    """Return the room's encryption key for client-side text message encryption.
    
    For E2EE-enabled rooms, returns the user's encrypted key (decrypt client-side).
    For legacy rooms, returns the server-side key (backward compatibility)."""
    _ensure_room_access(room_id, user)
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        raise HTTPException(401, "Login required")
    
    # Check if room has E2EE enabled
    room_res = supabase.table("chat_rooms").select("e2ee_enabled, encryption_key").eq("id", room_id).single().execute()
    room = room_res.data
    if not room:
        raise HTTPException(404, "Room not found")
    
    e2ee_enabled = room.get("e2ee_enabled", False)
    legacy_key = room.get("encryption_key", "")
    
    if not e2ee_enabled:
        # Legacy mode: return server-side key (backward compatibility)
        key = legacy_key or _get_or_create_room_key(room_id)
        return {
            "room_id": room_id,
            "encryption_key": key,
            "identity": user.get("username", "unknown"),
            "e2ee": False,
        }
    
    # E2EE mode: fetch user's encrypted key
    key_res = supabase.table("chat_room_user_keys").select("encrypted_key").eq("room_id", room_id).eq("user_id", user_id).single().execute()
    if not key_res.data or not key_res.data.get("encrypted_key"):
        raise HTTPException(404, "No encryption key found for this room. Rejoin to generate one.")
    
    return {
        "room_id": room_id,
        "encryption_key": key_res.data["encrypted_key"],
        "identity": user.get("username", "unknown"),
        "e2ee": True,
    }


@router.post("/rooms/{room_id}/e2ee-key")
async def store_e2ee_key(
    room_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Store client-generated room key encrypted with user's public key.
    
    Body: { "encrypted_key": "base64_encrypted_key" }
    Client generates room key, encrypts with their public key, sends encrypted blob."""
    _ensure_room_access(room_id, user)
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        raise HTTPException(401, "Login required")
    
    encrypted_key = body.get("encrypted_key")
    if not encrypted_key:
        raise HTTPException(400, "encrypted_key required")
    
    # Ensure room has E2EE enabled
    room_res = supabase.table("chat_rooms").select("e2ee_enabled").eq("id", room_id).single().execute()
    if not room_res.data or not room_res.data.get("e2ee_enabled"):
        raise HTTPException(400, "E2EE not enabled for this room")
    
    # Upsert user's encrypted key
    supabase.table("chat_room_user_keys").upsert({
        "room_id": room_id,
        "user_id": user_id,
        "encrypted_key": encrypted_key,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    
    return {"ok": True, "room_id": room_id}


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


@router.post("/rooms/{room_id}/e2ee")
async def toggle_e2ee(
    room_id: str,
    body: EnableE2EERequest,
    user: dict = Depends(require_admin),
):
    """Enable or disable E2EE for a room. Admin-only.
    
    When enabling: existing members will need to rejoin to generate their keys.
    When disabling: falls back to server-side encryption key."""
    room_res = supabase.table("chat_rooms").select("id").eq("id", room_id).single().execute()
    if not room_res.data:
        raise HTTPException(404, "Room not found")
    
    supabase.table("chat_rooms").update({"e2ee_enabled": body.enabled}).eq("id", room_id).execute()
    
    if not body.enabled:
        # Clean up per-user keys when disabling E2EE
        supabase.table("chat_room_user_keys").delete().eq("room_id", room_id).execute()
    
    return {
        "room_id": room_id,
        "e2ee_enabled": body.enabled,
        "message": f"E2EE {'enabled' if body.enabled else 'disabled'} for room",
    }


# ── LiveKit participant moderation (staff) ─────────────────────────────────────
# Uses the LiveKit Cloud REST API (HTTP Basic auth with the API key/secret).
# Works on LiveKit Cloud (wss://*.livekit.cloud). Muting a remote participant
# requires muting each published microphone track by SID.

_LK_CLOUD_API = "https://api.livekit.cloud"


def _lk_headers() -> dict:
    cred = base64.b64encode(f"{LIVEKIT_KEY}:{LIVEKIT_SECRET}".encode()).decode()
    return {"Authorization": f"Basic {cred}", "Content-Type": "application/json"}


def _lk_configured() -> bool:
    if not LIVEKIT_KEY or not LIVEKIT_SECRET:
        raise HTTPException(503, "LiveKit not configured")
    return True


async def _lk_list_participants(room_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{_LK_CLOUD_API}/v1/rooms/{quote(room_id, safe='')}/participants", headers=_lk_headers())
        if r.status_code != 200:
            raise HTTPException(502, "Could not reach LiveKit to list participants")
        return (r.json() or {}).get("participants", []) or []


def _lk_tracks(p: dict) -> list[dict]:
    state_tracks = ((p.get("state") or {}).get("tracks") or [])
    pubs = (p.get("publishers") or [])
    return state_tracks or pubs


class LkParticipantBody(BaseModel):
    room_id: str
    identity: str


@router.get("/livekit/admin/room/{room_id}/participants")
async def lk_admin_participants(room_id: str, _: dict = Depends(require_staff)):
    """List participants currently in a voice/video room, with track info."""
    _lk_configured()
    parts = await _lk_list_participants(room_id)
    out = []
    for p in parts:
        meta = {}
        try:
            meta = json.loads(p.get("metadata") or "{}")
        except Exception:
            pass
        tracks = []
        for t in _lk_tracks(p):
            tracks.append({
                "sid": t.get("sid"),
                "source": t.get("source"),
                "kind": t.get("kind"),
                "muted": bool(t.get("muted")),
            })
        out.append({
            "identity": p.get("identity"),
            "name": p.get("name"),
            "username": meta.get("username") or p.get("identity"),
            "role": meta.get("role") or "member",
            "tracks": tracks,
        })
    return out


@router.post("/livekit/admin/mute")
async def lk_admin_mute(body: LkParticipantBody, _: dict = Depends(require_staff)):
    """Force-mute a participant's microphone in a room."""
    _lk_configured()
    parts = await _lk_list_participants(body.room_id)
    target = next((p for p in parts if p.get("identity") == body.identity), None)
    if not target:
        raise HTTPException(404, "Participant is not in this room")
    async with httpx.AsyncClient(timeout=10) as client:
        for t in _lk_tracks(target):
            if t.get("source") == "microphone" and t.get("sid"):
                await client.post(
                    f"{_LK_CLOUD_API}/v1/rooms/{quote(body.room_id, safe='')}/mutePublishedTrack",
                    json={"identity": body.identity, "track_sid": t["sid"], "muted": True},
                    headers=_lk_headers(),
                )
    return {"ok": True, "identity": body.identity, "room_id": body.room_id}


@router.post("/livekit/admin/kick")
async def lk_admin_kick(body: LkParticipantBody, _: dict = Depends(require_staff)):
    """Disconnect a participant from a room."""
    _lk_configured()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.delete(
            f"{_LK_CLOUD_API}/v1/rooms/{quote(body.room_id, safe='')}/participants/{quote(body.identity, safe='')}",
            headers=_lk_headers(),
        )
        if r.status_code not in (200, 204):
            raise HTTPException(502, "Could not disconnect participant")
    return {"ok": True, "identity": body.identity, "room_id": body.room_id}
