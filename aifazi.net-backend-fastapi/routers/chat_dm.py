"""
routers/chat_dm.py — User-to-user 1:1 direct messages (self-serve, E2E-at-rest).

Model
-----
  dm_threads   : a 1:1 conversation between two users. party_a/party_b are the
                 canonical sorted lowercased usernames, so the pair is unique.
                 Each thread holds its own AES-256 key (base64 32 bytes, same
                 transport as chat room keys) used by the client for AES-GCM.
  dm_messages  : messages inside a thread; shapes mirror chat_messages
                 (content, type, file_name, file_size, reply_to, reactions,
                 edited) so clients can reuse a single message renderer.

Security: threads are PRIVATE — every handler resolves the thread and verifies
the caller is one of the two parties before reading/writing anything.
"""
import secrets
import base64
import threading
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from database import supabase
from dependencies import get_current_user
from routers.chat import _EMOJI_RE

router = APIRouter()

# ── In-memory per-user throttle (mirrors chat.py) ────────────────────────────
_DM_WINDOW = 20.0
_DM_MAX = 8
_dm_send_times: dict[str, list[float]] = {}
_dm_send_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _check_dm_throttle(user: dict) -> None:
    if user.get("role") in ("admin", "moderator"):
        return
    now = time.monotonic()
    uname = (user.get("username") or "").lower()
    with _dm_send_lock:
        times = [t for t in _dm_send_times.setdefault(uname, []) if now - t < _DM_WINDOW]
        if len(times) >= _DM_MAX:
            _dm_send_times[uname] = times
            raise HTTPException(429, "You're sending messages too fast. Slow down.")
        times.append(now)
        _dm_send_times[uname] = times


# ── Pair canonicalization + thread lookup ─────────────────────────────────────

def _canonical(a: str, b: str) -> tuple[str, str]:
    a, b = (a or "").strip().lower(), (b or "").strip().lower()
    return (a, b) if a < b else (b, a)


def _get_user(username: str) -> dict:
    res = (
        supabase.table("users")
        .select("id,username,avatar,role")
        .ilike("username", (username or "").strip())
        .limit(1)
        .execute()
    )
    if not (res.data or []):
        raise HTTPException(404, "User not found")
    return res.data[0]


def _get_or_create_thread_id(a: str, b: str) -> str:
    """Find-or-create the canonical thread for a pair. Returns the thread id."""
    pa, pb = _canonical(a, b)
    existing = (
        supabase.table("dm_threads")
        .select("id")
        .eq("party_a", pa)
        .eq("party_b", pb)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]
    key = base64.b64encode(secrets.token_bytes(32)).decode()
    row = (
        supabase.table("dm_threads")
        .insert({
            "party_a": pa,
            "party_b": pb,
            "encryption_key": key,
        })
        .execute()
    )
    return row.data[0]["id"]


def _get_thread(thread_id: str, user: dict) -> dict:
    """Fetch thread and verify `user` is a participant (403 otherwise)."""
    res = supabase.table("dm_threads").select("*").eq("id", thread_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Thread not found")
    parties = {
        str(res.data.get("party_a") or "").lower(),
        str(res.data.get("party_b") or "").lower(),
    }
    if (user.get("username") or "").lower() not in parties:
        raise HTTPException(403, "You are not part of this conversation")
    return res.data


def _peer_of(thread: dict, user: dict) -> str:
    uname = (user.get("username") or "").lower()
    if (thread.get("party_a") or "") == uname:
        return str(thread.get("party_b") or "")
    return str(thread.get("party_a") or "")


def _bump_thread(thread_id: str) -> None:
    try:
        supabase.table("dm_threads").update({"last_message_at": _now()}).eq("id", thread_id).execute()
    except Exception:
        pass


# ── Models ────────────────────────────────────────────────────────────────────

class StartThreadBody(BaseModel):
    username: str


class DMMessageBody(BaseModel):
    content: str
    type: str = "text"           # text | image | file
    file_name: str = ""
    file_size: str = ""
    reply_to: dict | None = None


class DMEditBody(BaseModel):
    content: str


class DMReactBody(BaseModel):
    emoji: str


# ── Threads ───────────────────────────────────────────────────────────────────

@router.get("/dm/threads")
async def list_threads(user: dict = Depends(get_current_user)):
    """List the caller's DM threads with peer info + last message preview."""
    uname = (user.get("username") or "").lower()
    qa = supabase.table("dm_threads").select("*").eq("party_a", uname).order("last_message_at", desc=True).limit(100).execute()
    qb = supabase.table("dm_threads").select("*").eq("party_b", uname).order("last_message_at", desc=True).limit(100).execute()
    merged: dict[str, dict] = {}
    for t in (qa.data or []) + (qb.data or []):
        tid = t["id"]
        if tid in merged:
            continue
        peer = _peer_of(t, user)
        preview = ""
        lm = supabase.table("dm_messages").select("content,type").eq("thread_id", tid).order("created_at", desc=True).limit(1).execute()
        if lm.data:
            if lm.data[0].get("type") == "image":
                preview = "[image]"
            elif lm.data[0].get("type") == "file":
                preview = "[file]"
            else:
                preview = lm.data[0].get("content") or ""
        merged[tid] = {
            "id": tid,
            "peer": peer,
            "peer_avatar": "",
            "peer_role": "",
            "last_message": preview,
            "last_message_at": t.get("last_message_at"),
            "created_at": t.get("created_at"),
        }
    out = sorted(merged.values(), key=lambda x: (x.get("last_message_at") or ""), reverse=True)
    peers = [t["peer"] for t in out]
    if peers:
        p = supabase.table("users").select("username,avatar,role").in_("username", peers).execute()
        peer_meta: dict[str, dict] = {}
        for u in (p.data or []):
            meta[u["username"]] = u
        for t in out:
            meta = peer_meta.get(t["peer"], {})
            t["peer_avatar"] = meta.get("avatar") or ""
            t["peer_role"] = meta.get("role") or ""
    return out


@router.post("/dm/threads")
async def start_thread(body: StartThreadBody, user: dict = Depends(get_current_user)):
    """Create or fetch the 1:1 thread between the caller and `username`."""
    my_name = (user.get("username") or "").strip()
    target_name = (body.username or "").strip()
    if not target_name:
        raise HTTPException(400, "Username required")
    if my_name.lower() == target_name.lower():
        raise HTTPException(400, "You can't DM yourself")
    target = _get_user(target_name)
    thread_id = _get_or_create_thread_id(my_name, target["username"])
    return {
        "id": thread_id,
        "peer": target["username"],
        "peer_avatar": target.get("avatar") or "",
        "peer_role": target.get("role") or "",
        "encryption_key": _get_thread(thread_id, user).get("encryption_key") or "",
    }


@router.get("/dm/threads/{thread_id}/encryption-key")
async def dm_encryption_key(thread_id: str, user: dict = Depends(get_current_user)):
    thread = _get_thread(thread_id, user)
    return {
        "thread_id": thread["id"],
        "encryption_key": thread.get("encryption_key") or "",
    }


# ── Messages ──────────────────────────────────────────────────────────────────

@router.get("/dm/threads/{thread_id}/messages")
async def get_dm_messages(
    thread_id: str,
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    _get_thread(thread_id, user)
    res = (
        supabase.table("dm_messages")
        .select("*")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(res.data or []))


@router.post("/dm/threads/{thread_id}/messages")
async def send_dm_message(thread_id: str, body: DMMessageBody, user: dict = Depends(get_current_user)):
    _get_thread(thread_id, user)
    _check_dm_throttle(user)
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(400, "Message cannot be empty")
    if len(content) > 4000:
        raise HTTPException(400, "Message too long (max 4000 chars)")
    if body.type not in ("text", "image", "file"):
        raise HTTPException(400, "Invalid message type")
    safe_reply = None
    if body.reply_to and body.reply_to.get("id"):
        safe_reply = {
            "id": str(body.reply_to["id"])[:64],
            "sender": str(body.reply_to.get("sender", ""))[:80],
            "content": str(body.reply_to.get("content", ""))[:200],
        }
    row = (
        supabase.table("dm_messages")
        .insert({
            "thread_id": thread_id,
            "sender": user["username"],
            "content": content,
            "type": body.type,
            "file_name": (body.file_name or "")[:255],
            "file_size": str(body.file_size)[:128],
            "reply_to": safe_reply,
        })
        .execute()
    )
    _bump_thread(thread_id)
    return row.data[0]


@router.patch("/dm/messages/{msg_id}")
async def edit_dm_message(msg_id: str, body: DMEditBody, user: dict = Depends(get_current_user)):
    content = (body.content or "").strip()
    if not content or len(content) > 4000:
        raise HTTPException(400, "Invalid content")
    msg = supabase.table("dm_messages").select("id,sender,thread_id").eq("id", msg_id).single().execute()
    if not msg.data:
        raise HTTPException(404, "Message not found")
    if msg.data["sender"] != user["username"]:
        raise HTTPException(403, "Not your message")
    _get_thread(msg.data["thread_id"], user)
    res = (
        supabase.table("dm_messages")
        .update({"content": content, "edited": True, "edited_at": _now()})
        .eq("id", msg_id)
        .execute()
    )
    _bump_thread(msg.data["thread_id"])
    return res.data[0]


@router.patch("/dm/messages/{msg_id}/react")
async def toggle_dm_reaction(msg_id: str, body: DMReactBody, user: dict = Depends(get_current_user)):
    if not body.emoji or len(body.emoji) > 16 or not _EMOJI_RE.match(body.emoji):
        raise HTTPException(400, "Invalid emoji")
    msg = supabase.table("dm_messages").select("id,thread_id,reactions").eq("id", msg_id).single().execute()
    if not msg.data:
        raise HTTPException(404, "Message not found")
    _get_thread(msg.data["thread_id"], user)
    reactions = msg.data.get("reactions") or {}
    users = [u for u in reactions.get(body.emoji, []) if u]
    uname = user["username"]
    users = [u for u in users if u != uname] if uname in users else users + [uname]
    if users:
        reactions[body.emoji] = users
    else:
        reactions.pop(body.emoji, None)
    supabase.table("dm_messages").update({"reactions": reactions}).eq("id", msg_id).execute()
    return {"reactions": reactions}


@router.delete("/dm/messages/{msg_id}")
async def delete_dm_message(msg_id: str, user: dict = Depends(get_current_user)):
    msg = supabase.table("dm_messages").select("id,sender,thread_id").eq("id", msg_id).single().execute()
    if not msg.data:
        raise HTTPException(404, "Message not found")
    if msg.data["sender"] != user["username"]:
        raise HTTPException(403, "Not your message")
    _get_thread(msg.data["thread_id"], user)
    supabase.table("dm_messages").delete().eq("id", msg_id).execute()
    return {"message": "Deleted"}


# ── User search (authenticated) for starting DMs ──────────────────────────────

@router.get("/dm/users/search")
async def dm_search_users(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    """Search registered users to start a DM — returns username/avatar/role only."""
    res = (
        supabase.table("users")
        .select("id,username,avatar,role")
        .ilike("username", f"%{q}%")
        .limit(12)
        .execute()
    )
    out = []
    seen = set()
    my_name = (user.get("username") or "").lower()
    for u in (res.data or []):
        uname = str(u.get("username") or "")
        if not uname or uname.lower() in seen or uname.lower() == my_name:
            continue
        seen.add(uname.lower())
        out.append({
            "username": uname,
            "avatar": u.get("avatar") or "",
            "role": u.get("role") or "",
        })
    return out