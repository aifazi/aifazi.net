"""
routers/chat.py — Chat rooms + message REST endpoints
Now includes:
  POST   /rooms/{id}/messages  — send a message (any authenticated user)
  PATCH  /messages/{id}        — edit own message (or admin)
  PATCH  /messages/{id}/react  — toggle reaction (any authenticated user)
  DELETE /messages/{id}        — delete own message OR staff can delete any
  POST   /rooms/{id}/mute      — mute a user from a room (staff)
  POST   /rooms/{id}/kick      — kick a user from a room (staff)
  POST   /rooms/{id}/ban       — ban a user (staff, room-level)
  DELETE /rooms/{id}/ban/{user_id} — unban a user (staff)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff, get_current_user
from datetime import datetime, timezone
from html import escape
import re
import os
import asyncio
import threading
import time
from utils.email import send_email, render_template
from utils.email_queue import queue_email, queue_email_bulk

router = APIRouter()

# ── In-memory chat history cache ────────────────────────────────────────────
# Caches the "latest N messages in a room" fetch (the hot path) for a short TTL
# so repeat history loads don't hammer Postgres. Single-process only — when the
# app scales to multiple API instances this should be replaced with Redis
# (Upstash/Railway) for presence/typing/rate-limit/cross-instance invalidation.
_HISTORY_TTL = 20.0          # seconds
_history_lock = threading.Lock()
_history_cache: dict[str, tuple[float, list]] = {}

def _get_cached_history(room_id: str, limit: int) -> list | None:
    with _history_lock:
        entry = _history_cache.get(room_id)
        if entry and time.monotonic() - entry[0] < _HISTORY_TTL:
            rows = entry[1]
            if len(rows) >= limit:
                return list(rows[:limit])
    return None

def _set_cached_history(room_id: str, rows: list) -> None:
    with _history_lock:
        _history_cache[room_id] = (time.monotonic(), list(rows))

def _invalidate_history(room_id: str) -> None:
    with _history_lock:
        _history_cache.pop(room_id, None)

def clear_history_cache() -> None:
    """Drop all cached history (used by the admin 'clear all chat' action)."""
    with _history_lock:
        _history_cache.clear()

# ── Message send throttling (in-memory, per instance) ────────────────────────
# Anti-spam. In-memory sliding windows — when the app scales to multiple API
# instances these move to Redis (per-user rate limits / slow-mode timestamps).
_MSG_WINDOW  = 20.0   # seconds
_MSG_MAX     = 8      # max messages per user per window
_send_times: dict[str, list[float]] = {}                 # username -> send timestamps
_last_send:  dict[tuple[str, str], float] = {}           # (username, room_id) -> monotonic
_send_lock   = threading.Lock()

def _check_send_throttle(user: dict, room: dict) -> None:
    """Per-user sliding-window throttle + per-room slow_mode. Staff exempt.
    Raises HTTPException(429) on violation."""
    if user.get("role") in ("admin", "moderator"):
        return
    now = time.monotonic()
    username = user.get("username") or ""

    with _send_lock:
        times = _send_times.setdefault(username, [])
        times = [t for t in times if now - t < _MSG_WINDOW]
        if len(times) >= _MSG_MAX:
            _send_times[username] = times
            raise HTTPException(429, "You're sending messages too fast. Slow down.")
        times.append(now)
        _send_times[username] = times

    slow = int(room.get("slow_mode") or 0)
    if slow > 0:
        key = (username, str(room.get("id") or ""))
        last = _last_send.get(key)
        if last and (now - last) < slow:
            wait = int(slow - (now - last)) + 1
            raise HTTPException(429, f"Slow mode is on — try again in {wait}s.")
        _last_send[key] = now

# Reaction emoji allowlist — only actual emoji codepoints are accepted.
_EMOJI_RE = re.compile(
    r"^[\U0001F000-\U0001FAFF\U0001F900-\U0001F9FF\U00002600-\U000027BF"
    r"\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF\U0000200D\U0000FE0F]+$"
)

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _role_allowed(room: dict, user: dict) -> bool:
    role = user.get("role") or "member"
    if role in ("admin", "moderator"):
        return True
    # H1 — a private room restricted to a user allowlist must NOT be readable by
    # anyone just because allowed_roles is empty. Enforce membership explicitly,
    # matching the voice gate in chat_livekit.py (empty allowlist => deny all).
    allowed_roles = room.get("allowed_roles") or []
    allowed_users = room.get("allowed_users") or []
    is_private = bool(room.get("is_private"))
    if is_private:
        username = (user.get("username") or "").lower()
        user_id = (user.get("id") or user.get("sub") or "").lower()
        allow_names = {str(u).lower() for u in allowed_users}
        allow_ids = {str(u).lower() for u in allowed_users}
        if username in allow_names or user_id in allow_ids:
            return True
        return False
    return not allowed_roles or role in allowed_roles

def _get_room_or_404(room_id: str) -> dict:
    room = (
        supabase.table("chat_rooms")
        .select("id,name,is_private,read_only,allowed_roles,allowed_users,speak_roles,screen_share_roles,type,slow_mode")
        .eq("id", room_id)
        .single()
        .execute()
        .data
    )
    if not room:
        raise HTTPException(404, "Room not found")
    return room

def _ensure_room_access(room_id: str, user: dict) -> dict:
    room = _get_room_or_404(room_id)
    if not _role_allowed(room, user):
        raise HTTPException(403, "You do not have access to this channel")
    banned = (
        supabase.table("chat_bans")
        .select("id")
        .eq("room_id", room_id)
        .eq("username", user["username"])
        .limit(1)
        .execute()
        .data
    )
    if banned:
        raise HTTPException(403, "You are banned from this channel")
    return room

def _chat_link(room_id: str) -> str:
    base = (os.getenv("FRONTEND_URL") or os.getenv("SITE_URL") or "https://aifazi.net").rstrip("/")
    return f"{base}/chat?room={room_id}"

async def _notify_chat_user(user_row: dict, subject: str, html: str, text: str, message: str, link: str, purpose: str):
    user_id = user_row.get("id")
    email = (user_row.get("email") or "").strip()
    if user_id:
        try:
            supabase.table("notifications").insert({
                "user_id": user_id,
                "type": purpose,
                "message": message,
                "link": link,
            }).execute()
        except Exception:
            pass
    if email:
        await queue_email(email, subject, html, text, purpose, user_row.get("username") or "")

def _queue_chat_message_notifications_sync(room: dict, room_id: str, sender: dict, content: str):
    """Sync fan-out, run in a worker thread (see the async wrapper below).

    Previously send_message awaited one inline SMTP email (15s timeout) + one
    template render (DB read) PER recipient, so a message in a 20-member room
    stalled the request for minutes. Now: the template is rendered once, the
    notifications insert is batched into a single write, and emails go through
    the insert-only mail queue (drained by dispatch_pending) — no blocking I/O
    on the event loop at all.
    """
    sender_name = sender.get("username") or "Someone"
    mentions = {m.lower() for m in re.findall(r"@([A-Za-z0-9_.-]{2,40})", content)}
    recipients: dict[str, dict] = {}

    if mentions:
        mentioned = supabase.table("users").select("id,username,email").in_("username", list(mentions)).execute()
        for row in mentioned.data or []:
            recipients[(row.get("username") or "").lower()] = row

    members = supabase.table("chat_members").select("username").eq("room_id", room_id).execute()
    usernames = [m.get("username") for m in (members.data or []) if m.get("username")]
    if usernames:
        users = supabase.table("users").select("id,username,email").in_("username", usernames).execute()
        for row in users.data or []:
            recipients[(row.get("username") or "").lower()] = row

    recipients.pop(sender_name.lower(), None)
    if not recipients:
        return

    room_name = room.get("name") or "Chat"
    snippet = content[:220]
    safe_room = escape(room_name)
    safe_sender = escape(sender_name)
    safe_snippet = escape(snippet)
    link = _chat_link(room_id)
    text = f"{sender_name} posted in {room_name}: {snippet}\n\nOpen chat: {link}"
    fallback_subject = f"New chat message in {room_name}"
    fallback_html = f"""
    <div style="font-family:Inter,Segoe UI,sans-serif;background:#0b0f14;color:#e6edf3;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #243244;border-radius:12px;padding:22px">
        <p style="margin:0 0 8px;color:#22d3ee;font-size:12px;letter-spacing:2px;text-transform:uppercase">Chat notification</p>
        <h2 style="margin:0 0 12px;font-size:20px">{safe_room}</h2>
        <p style="color:#9ca3af;margin:0 0 14px"><strong style="color:#e6edf3">{safe_sender}</strong> sent a message:</p>
        <blockquote style="margin:0 0 18px;padding:12px 14px;border-left:3px solid #22d3ee;background:#0b1220;color:#d1d5db">{safe_snippet}</blockquote>
        <a href="{escape(link)}" style="display:inline-block;background:#22d3ee;color:#020617;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px">Open Chat</a>
      </div>
    </div>
    """
    # Render the email template ONCE per message (was once per recipient → N+1 DB reads).
    subject, html = None, None
    try:
        subject, html = render_template("chat_message", {
            "site_name": "aifazi.net",
            "username": "there",
            "sender_name": sender_name,
            "room_name": room_name,
            "message_preview": snippet,
            "chat_url": link,
        })
    except Exception:
        subject, html = None, None
    subject = subject or fallback_subject
    html = html or fallback_html

    # Batch-insert notifications in a single write.
    notif_rows = [
        {"user_id": row.get("id"), "type": "chat_message",
         "message": f"{sender_name} posted in {room_name}", "link": link}
        for row in recipients.values() if row.get("id")
    ]
    if notif_rows:
        try:
            supabase.table("notifications").insert(notif_rows).execute()
        except Exception:
            pass

    # Insert-only bulk email (drained by dispatch_pending) — no inline SMTP.
    for row in recipients.values():
        email = (row.get("email") or "").strip()
        if email:
            queue_email_bulk(email, subject, html, text, "chat_message", row.get("username") or "")


async def _queue_chat_message_notifications(room: dict, room_id: str, sender: dict, content: str):
    await asyncio.to_thread(_queue_chat_message_notifications_sync, room, room_id, sender, content)

class RoomBody(BaseModel):
    name: str
    description: str = ""
    color: str = "#00ff88"
    emoji: str = "#"
    is_private: bool = False
    allowed_users: list[str] = []
    allowed_roles: list[str] = []
    speak_roles: list[str] = []
    screen_share_roles: list[str] = []
    type: str = "text"           # text | voice | video
    slow_mode: int = 0
    read_only: bool = False

class MessageBody(BaseModel):
    content: str
    type: str = "text"           # text | image | file
    file_name: str = ""
    file_size: str = ""
    reply_to: dict | None = None  # {id, sender, content}

class EditBody(BaseModel):
    content: str

class ReactBody(BaseModel):
    emoji: str

class BulkDeleteBody(BaseModel):
    message_ids: list[str]

class MemberBody(BaseModel):
    user_id: str = ""
    username: str = ""
    role: str = ""
    room_id: str = ""

class MuteBody(BaseModel):
    username: str
    duration_minutes: int = 60   # 0 = permanent until unmuted

class KickBanBody(BaseModel):
    username: str
    reason: str = ""

# ── Rooms ──────────────────────────────────────────────────────────────────────
@router.get("/rooms")
async def list_rooms(user: dict = Depends(get_current_user)):
    res = supabase.table("chat_rooms").select(
        "id,name,description,color,emoji,is_private,read_only,slow_mode,type,allowed_roles,speak_roles,screen_share_roles"
    ).limit(200).execute()
    rooms = res.data or []
    return [room for room in rooms if _role_allowed(room, user)]

@router.post("/rooms")
async def create_room(body: RoomBody, _: dict = Depends(require_staff)):
    res = supabase.table("chat_rooms").insert(body.model_dump()).execute()
    return res.data[0]

@router.put("/rooms/{room_id}")
async def update_room(room_id: str, body: RoomBody, _: dict = Depends(require_staff)):
    res = supabase.table("chat_rooms").update(body.model_dump()).eq("id", room_id).execute()
    if not res.data:
        raise HTTPException(404, "Room not found")
    return res.data[0]

@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, _: dict = Depends(require_staff)):
    supabase.table("chat_rooms").delete().eq("id", room_id).execute()
    return {"message": "Deleted"}

# ── Room moderation ────────────────────────────────────────────────────────────

@router.post("/rooms/{room_id}/mute")
async def mute_user(room_id: str, body: MuteBody, user: dict = Depends(require_staff)):
    """Mute a user in a room. Staff only."""
    expires_at = None
    if body.duration_minutes > 0:
        expires_at = (datetime.now(timezone.utc) + __import__("datetime").timedelta(minutes=body.duration_minutes)).isoformat()

    supabase.table("chat_mutes").upsert({
        "room_id": room_id,
        "username": body.username,
        "muted_by": user["username"],
        "expires_at": expires_at,
        "created_at": _now(),
    }, on_conflict="room_id,username").execute()
    return {"muted": True, "username": body.username, "room_id": room_id, "expires_at": expires_at}


@router.delete("/rooms/{room_id}/mute/{username}")
async def unmute_user(room_id: str, username: str, _: dict = Depends(require_staff)):
    """Unmute a user in a room. Staff only."""
    supabase.table("chat_mutes").delete().eq("room_id", room_id).eq("username", username).execute()
    return {"unmuted": True, "username": username}


@router.get("/rooms/{room_id}/mutes")
async def list_mutes(room_id: str, _: dict = Depends(require_staff)):
    """List muted users in a room."""
    res = supabase.table("chat_mutes").select("*").eq("room_id", room_id).execute()
    return res.data or []


@router.post("/rooms/{room_id}/ban")
async def ban_user(room_id: str, body: KickBanBody, user: dict = Depends(require_staff)):
    """Ban a user from a room. Staff only."""
    supabase.table("chat_bans").upsert({
        "room_id": room_id,
        "username": body.username,
        "banned_by": user["username"],
        "reason": body.reason,
        "created_at": _now(),
    }, on_conflict="room_id,username").execute()
    # Also remove from members so they lose access immediately
    supabase.table("chat_members").delete().eq("room_id", room_id).eq("username", body.username).execute()
    return {"banned": True, "username": body.username, "room_id": room_id}


@router.delete("/rooms/{room_id}/ban/{username}")
async def unban_user(room_id: str, username: str, user: dict = Depends(require_staff)):
    """Unban a user from a room. Staff only."""
    supabase.table("chat_bans").delete().eq("room_id", room_id).eq("username", username).execute()
    return {"unbanned": True, "username": username}


@router.post("/rooms/{room_id}/kick")
async def kick_user(room_id: str, body: KickBanBody, user: dict = Depends(require_staff)):
    """Kick a user from a room — removes their membership (they can rejoin if room allows). Staff only."""
    # Remove from chat_members so they leave the room
    supabase.table("chat_members").delete().eq("room_id", room_id).eq("username", body.username).execute()
    return {"kicked": True, "username": body.username, "room_id": room_id}


@router.get("/rooms/{room_id}/bans")
async def list_bans(room_id: str, _: dict = Depends(require_staff)):
    """List banned users in a room."""
    res = supabase.table("chat_bans").select("*").eq("room_id", room_id).execute()
    return res.data or []


@router.get("/rooms/{room_id}/is-banned")
async def check_banned(room_id: str, user: dict = Depends(get_current_user)):
    """Check if the current user is banned from a room."""
    try:
        res = supabase.table("chat_bans").select("id").eq("room_id", room_id).eq("username", user["username"]).execute()
        return {"banned": bool(res.data)}
    except Exception:
        return {"banned": False}


@router.get("/rooms/{room_id}/is-muted")
async def check_muted(room_id: str, user: dict = Depends(get_current_user)):
    """Check if the current user is muted in a room."""
    try:
        res = supabase.table("chat_mutes").select("id,expires_at").eq("room_id", room_id).eq("username", user["username"]).execute()
        if not res.data:
            return {"muted": False}
        mute = res.data[0]
        expires = mute.get("expires_at")
        if expires and expires < _now():
            supabase.table("chat_mutes").delete().eq("id", mute["id"]).execute()
            return {"muted": False}
        return {"muted": True, "expires_at": expires}
    except Exception:
        return {"muted": False}

# ── Messages ───────────────────────────────────────────────────────────────────
@router.get("/rooms/{room_id}/messages")
async def get_messages(
    room_id: str,
    limit: int = Query(50, le=200),
    before: str | None = None,
    user: dict = Depends(get_current_user),
):
    _ensure_room_access(room_id, user)
    # Cache hit path — only for the "latest messages" fetch (no cursor).
    if not before:
        cached = _get_cached_history(room_id, limit)
        if cached is not None:
            return cached
    q = (
        supabase.table("chat_messages")
        .select("*")
        .eq("room_id", room_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if before:
        q = q.lt("created_at", before)
    res = q.execute()
    rows = list(reversed(res.data or []))
    if not before:
        _set_cached_history(room_id, rows)
    return rows

@router.post("/rooms/{room_id}/messages")
async def send_message(
    room_id: str,
    body: MessageBody,
    user: dict = Depends(get_current_user),
):
    """Send a message — open to any authenticated user (admin, staff, chat, forum)."""
    room = _ensure_room_access(room_id, user)
    if room.get("read_only") and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(403, "This channel is read only")
    # Enforce mute
    mute = (
        supabase.table("chat_mutes")
        .select("id,expires_at")
        .eq("room_id", room_id)
        .eq("username", user["username"])
        .limit(1)
        .execute()
        .data
    )
    if mute:
        expires = mute[0].get("expires_at")
        if expires and expires < _now():
            supabase.table("chat_mutes").delete().eq("id", mute[0]["id"]).execute()
        else:
            raise HTTPException(403, "You are muted in this channel")
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "Message cannot be empty")
    if len(content) > 4000:
        raise HTTPException(400, "Message too long (max 4000 chars)")
    if body.type not in ("text", "image", "file"):
        raise HTTPException(400, "Invalid message type")

    # Sanitise reply_to to prevent injection
    safe_reply = None
    if body.reply_to and body.reply_to.get("id"):
        safe_reply = {
            "id":      str(body.reply_to["id"])[:64],
            "sender":  str(body.reply_to.get("sender", ""))[:80],
            "content": str(body.reply_to.get("content", ""))[:200],
        }

    _check_send_throttle(user, room)

    res = supabase.table("chat_messages").insert({
        "room_id":    room_id,
        "sender":     user["username"],
        "role":       user.get("role", "member"),
        "type":       body.type,
        "content":    content,
        "file_name":  body.file_name,
        "file_size":  body.file_size,
        "reply_to":   safe_reply,
        "created_at": _now(),
    }).execute()
    _invalidate_history(room_id)
    await _queue_chat_message_notifications(room, room_id, user, content)
    return res.data[0]

@router.patch("/messages/{msg_id}")
async def edit_message(
    msg_id: str,
    body: EditBody,
    user: dict = Depends(get_current_user),
):
    content = body.content.strip()
    if not content or len(content) > 4000:
        raise HTTPException(400, "Invalid content")

    msg = supabase.table("chat_messages").select("sender,room_id").eq("id", msg_id).single().execute().data
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg["sender"] != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Not your message")

    res = supabase.table("chat_messages").update({
        "content":   content,
        "edited":    True,
        "edited_at": _now(),
    }).eq("id", msg_id).execute()
    if msg.get("room_id"):
        _invalidate_history(msg["room_id"])
    return res.data[0]

@router.patch("/messages/{msg_id}/react")
async def toggle_reaction(
    msg_id: str,
    body: ReactBody,
    user: dict = Depends(get_current_user),
):
    if not body.emoji or len(body.emoji) > 16 or not _EMOJI_RE.match(body.emoji):
        raise HTTPException(400, "Invalid emoji")

    msg = supabase.table("chat_messages").select("reactions,room_id").eq("id", msg_id).single().execute().data
    if not msg:
        raise HTTPException(404, "Message not found")

    reactions = msg.get("reactions") or {}
    users = list(reactions.get(body.emoji, []))
    uname = user["username"]
    if uname in users:
        users.remove(uname)
    else:
        users.append(uname)
    if not users:
        reactions.pop(body.emoji, None)
    else:
        reactions[body.emoji] = users

    supabase.table("chat_messages").update({"reactions": reactions}).eq("id", msg_id).execute()
    if msg.get("room_id"):
        _invalidate_history(msg["room_id"])
    return {"reactions": reactions}

@router.delete("/messages/{msg_id}")
async def delete_message(
    msg_id: str,
    user: dict = Depends(get_current_user),
):
    """Owners can delete their own messages; staff/admin can delete any."""
    msg = supabase.table("chat_messages").select("sender,room_id").eq("id", msg_id).single().execute().data
    if not msg:
        raise HTTPException(404, "Message not found")

    is_staff = user.get("role") in ("admin", "moderator")
    if msg["sender"] != user["username"] and not is_staff:
        raise HTTPException(403, "Not your message")

    supabase.table("chat_messages").delete().eq("id", msg_id).execute()
    if msg.get("room_id"):
        _invalidate_history(msg["room_id"])
    return {"message": "Deleted"}

@router.post("/messages/bulk-delete")
async def bulk_delete_messages(body: BulkDeleteBody, user: dict = Depends(get_current_user)):
    """Delete multiple messages. Staff/admin can delete any; regular users can
    only delete their own messages."""
    ids = list(dict.fromkeys(body.message_ids))[:100]
    if not ids:
        raise HTTPException(400, "No messages provided")

    res = supabase.table("chat_messages").select("id,room_id,sender").in_("id", ids).execute()
    rows = res.data or []
    is_staff = user.get("role") in ("admin", "moderator")
    deletable: list[str] = []
    room_ids: set[str] = set()
    for m in rows:
        if is_staff or m.get("sender") == user.get("username"):
            deletable.append(m["id"])
            if m.get("room_id"):
                room_ids.add(m["room_id"])
    if deletable:
        supabase.table("chat_messages").delete().in_("id", deletable).execute()
    for rid in room_ids:
        _invalidate_history(rid)
    return {"deleted": len(deletable), "total": len(ids)}

# ── Members (staff only) ───────────────────────────────────────────────────────
@router.get("/members")
async def list_members(_: dict = Depends(require_staff)):
    res = supabase.table("chat_members").select("id,user_id,room_id,role,joined_at").limit(5000).execute()
    return res.data or []


@router.get("/rooms/{room_id}/members")
async def list_room_members(room_id: str, user: dict = Depends(get_current_user)):
    """List all members of a room with usernames (for user picker in admin actions)."""
    # Get member records for this room
    res = supabase.table("chat_members").select("username,role,joined_at").eq("room_id", room_id).execute()
    members = res.data or []
    # Also include allowed_users if the room has them
    room_res = supabase.table("chat_rooms").select("allowed_users,allowed_roles").eq("id", room_id).single().execute()
    allowed_users = (room_res.data or {}).get("allowed_users") or []
    # Merge: add allowed_users that aren't already members
    existing_usernames = {m["username"] for m in members if m.get("username")}
    for uid in allowed_users:
        if uid not in existing_usernames:
            members.append({"username": uid, "role": "member", "joined_at": None})
    # Deduplicate and sort
    seen = set()
    unique = []
    for m in members:
        un = m.get("username", "")
        if un and un not in seen:
            seen.add(un)
            unique.append({"username": un, "role": m.get("role", "member"), "joined_at": m.get("joined_at")})
    unique.sort(key=lambda x: x["username"])
    return unique

@router.post("/members")
async def create_member(body: MemberBody, _: dict = Depends(require_staff)):
    res = supabase.table("chat_members").insert(body.model_dump()).execute()
    return res.data[0]

@router.put("/members/{member_id}")
async def update_member(member_id: str, body: MemberBody, _: dict = Depends(require_staff)):
    res = supabase.table("chat_members").update(body.model_dump()).eq("id", member_id).execute()
    return res.data[0]

@router.delete("/members/{member_id}")
async def delete_member(member_id: str, _: dict = Depends(require_staff)):
    supabase.table("chat_members").delete().eq("id", member_id).execute()
    return {"message": "Deleted"}

# ── Invite ───────────────────────────────────────────────────────────────────
class InviteBody(BaseModel):
    username: str
    role: str = "member"

@router.post("/rooms/{room_id}/invite")
async def invite_user(room_id: str, body: InviteBody, user: dict = Depends(require_staff)):
    """Invite a registered user to a room with a specific role."""
    room = _get_room_or_404(room_id)
    # Check user exists
    found = supabase.table("users").select("id,username,role,email").eq("username", body.username).limit(1).execute()
    if not found.data:
        raise HTTPException(404, f"User '{body.username}' not found")
    target = found.data[0]
    # Check not already a member
    existing = supabase.table("chat_members").select("id").eq("room_id", room_id).eq("username", body.username).execute()
    if existing.data:
        raise HTTPException(409, f"'{body.username}' is already a member of this room")
    # Check not banned
    banned = supabase.table("chat_bans").select("id").eq("room_id", room_id).eq("username", body.username).execute()
    if banned.data:
        raise HTTPException(403, f"'{body.username}' is banned from this room — unban them first")
    # Add to members
    res = supabase.table("chat_members").insert({
        "room_id": room_id,
        "user_id": target["id"],
        "username": body.username,
        "role": body.role,
        "joined_at": _now(),
    }).execute()
    room_name = room.get("name") or "Chat"
    link = _chat_link(room_id)
    text = f"{user.get('username', 'Staff')} invited you to {room_name}. Open chat: {link}"
    fallback_subject = f"You were invited to {room_name}"
    fallback_html = f"""
    <div style="font-family:Inter,Segoe UI,sans-serif;background:#0b0f14;color:#e6edf3;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #243244;border-radius:12px;padding:22px">
        <p style="margin:0 0 8px;color:#22d3ee;font-size:12px;letter-spacing:2px;text-transform:uppercase">Chat invitation</p>
        <h2 style="margin:0 0 12px;font-size:20px">{escape(room_name)}</h2>
        <p style="color:#9ca3af;margin:0 0 18px">{escape(user.get('username', 'Staff'))} invited you to this chat room.</p>
        <a href="{escape(link)}" style="display:inline-block;background:#22d3ee;color:#020617;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px">Open Chat</a>
      </div>
    </div>
    """
    subject, html = render_template("chat_invite", {
        "site_name": "aifazi.net",
        "username": target.get("username") or "there",
        "sender_name": user.get("username", "Staff"),
        "room_name": room_name,
        "chat_url": link,
    })
    subject = subject or fallback_subject
    html = html or fallback_html
    await _notify_chat_user(target, subject, html, text, f"You were invited to {room_name}", link, "chat_invite")
    return res.data[0]

# ── User search ──────────────────────────────────────────────────────────────
@router.get("/users/search")
async def search_users(q: str = Query(..., min_length=1), _: dict = Depends(require_staff)):
    """Search registered users by username or email (for invitation / role assignment)."""
    by_name = supabase.table("users").select("id,username,role,avatar,email").ilike("username", f"%{q}%").limit(20).execute()
    by_email = supabase.table("users").select("id,username,role,avatar,email").ilike("email", f"%{q}%").limit(20).execute()
    seen = set()
    results = []
    for u in (by_email.data or []) + (by_name.data or []):
        if u["username"] not in seen:
            seen.add(u["username"])
            u["email"] = u.get("email", "")
            results.append(u)
    return results[:20]

# ── Room roles CRUD ──────────────────────────────────────────────────────────
class RoleBody(BaseModel):
    name: str
    color: str = "#00ff88"
    permissions: list[str] = []   # e.g. ["send_messages","read_messages","manage_messages","manage_members","manage_roles","voice_speak","voice_screen_share"]

@router.get("/rooms/{room_id}/roles")
async def list_room_roles(room_id: str, _: dict = Depends(require_staff)):
    """List custom roles for a room."""
    res = supabase.table("chat_room_roles").select("*").eq("room_id", room_id).order("created_at").execute()
    return res.data or []

@router.post("/rooms/{room_id}/roles")
async def create_room_role(room_id: str, body: RoleBody, _: dict = Depends(require_staff)):
    """Create a custom role in a room."""
    res = supabase.table("chat_room_roles").insert({
        "room_id": room_id,
        "name": body.name,
        "color": body.color,
        "permissions": body.permissions,
        "created_at": _now(),
    }).execute()
    return res.data[0]

@router.put("/rooms/{room_id}/roles/{role_id}")
async def update_room_role(room_id: str, role_id: str, body: RoleBody, _: dict = Depends(require_staff)):
    """Update a custom role's name, color, or permissions."""
    res = supabase.table("chat_room_roles").update({
        "name": body.name,
        "color": body.color,
        "permissions": body.permissions,
    }).eq("id", role_id).eq("room_id", room_id).execute()
    if not res.data:
        raise HTTPException(404, "Role not found")
    return res.data[0]

@router.delete("/rooms/{room_id}/roles/{role_id}")
async def delete_room_role(room_id: str, role_id: str, _: dict = Depends(require_staff)):
    """Delete a custom role. Members with this role revert to 'member'."""
    # Revert members with this role back to 'member'
    supabase.table("chat_members").update({"role": "member"}).eq("room_id", room_id).eq("role", role_id).execute()
    supabase.table("chat_room_roles").delete().eq("id", role_id).eq("room_id", room_id).execute()
    return {"message": "Role deleted"}

@router.patch("/rooms/{room_id}/members/{username}/role")
async def set_member_role(room_id: str, username: str, body: RoleBody, _: dict = Depends(require_staff)):
    """Change a member's role in a room."""
    res = supabase.table("chat_members").update({"role": body.name}).eq("room_id", room_id).eq("username", username).execute()
    if not res.data:
        # Maybe they're in allowed_users but not chat_members yet — add them
        supabase.table("chat_members").insert({"room_id": room_id, "username": username, "role": body.name, "joined_at": _now()}).execute()
        return {"username": username, "role": body.name}
    return res.data[0]
