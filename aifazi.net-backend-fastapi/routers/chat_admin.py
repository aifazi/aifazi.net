"""
routers/chat_admin.py — Staff-only chat management endpoints for the admin portal.

Covers everything the embedded chat UI can't: global channel inventory (with
member counts + access summary), every member/mute/ban/role across all rooms,
DM requests/threads/blocks, and high-level stats. Mounted at /api/chat/admin.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from database import supabase
from dependencies import require_staff
from routers.chat import _room_access
from routers.chat_dm import _get_or_create_thread_id

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _count(table: str, column: str = "id", **filters) -> int:
    try:
        q = supabase.table(table).select(column, count="exact").limit(1)
        for key, val in filters.items():
            q = q.eq(key, val)
        return int(q.execute().count or 0)
    except Exception:
        return 0


def _room_names() -> dict[str, dict]:
    res = supabase.table("chat_rooms").select("id,name,emoji,type").limit(500).execute()
    return {r["id"]: r for r in (res.data or [])}


@router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_staff)):
    rooms = supabase.table("chat_rooms").select("id,type").limit(500).execute().data or []
    by_type = {"text": 0, "voice": 0, "video": 0}
    for r in rooms:
        t = r.get("type") or "text"
        by_type[t] = by_type.get(t, 0) + 1
    dm_req = supabase.table("dm_requests").select("status").limit(5000).execute().data or []
    req_by_status = {}
    for r in dm_req:
        s = r.get("status") or "pending"
        req_by_status[s] = req_by_status.get(s, 0) + 1
    return {
        "rooms": {
            "total": len(rooms),
            "text": by_type.get("text", 0),
            "voice": by_type.get("voice", 0),
            "video": by_type.get("video", 0),
        },
        "members": _count("chat_members"),
        "custom_roles": _count("chat_room_roles"),
        "messages": _count("chat_messages"),
        "mutes": _count("chat_mutes"),
        "bans": _count("chat_bans"),
        "dm": {
            "threads": _count("dm_threads"),
            "messages": _count("dm_messages"),
            "requests": req_by_status.get("total", len(dm_req)),
            "pending": req_by_status.get("pending", 0),
            "accepted": req_by_status.get("accepted", 0),
            "rejected": req_by_status.get("rejected", 0),
            "blocks": _count("dm_blocks"),
        },
    }


@router.get("/admin/rooms")
async def admin_rooms(_: dict = Depends(require_staff)):
    res = (
        supabase.table("chat_rooms")
        .select("id,name,description,color,emoji,is_private,read_only,slow_mode,type,allowed_roles,allowed_users,speak_roles,screen_share_roles,created_at")
        .limit(500)
        .execute()
    )
    rooms = res.data or []
    member_counts = supabase.table("chat_members").select("room_id").limit(10000).execute().data or []
    counts: dict[str, int] = {}
    for m in member_counts:
        rid = m.get("room_id")
        if rid:
            counts[rid] = counts.get(rid, 0) + 1
    for room in rooms:
        room["access"] = _room_access(room)
        room["member_count"] = counts.get(room["id"], 0)
    rooms.sort(key=lambda r: (r.get("type") or "text"))
    return rooms


@router.get("/admin/members")
async def admin_members(_: dict = Depends(require_staff)):
    res = (
        supabase.table("chat_members")
        .select("id,user_id,username,room_id,role,joined_at")
        .limit(10000)
        .execute()
    )
    members = res.data or []
    names = _room_names()
    for m in members:
        room = names.get(m.get("room_id") or "", {})
        m["room_name"] = room.get("name") or ""
        m["room_emoji"] = room.get("emoji") or ""
        m["room_type"] = room.get("type") or ""
    members.sort(key=lambda m: m.get("room_name") or "")
    return members


@router.get("/admin/mutes")
async def admin_mutes(_: dict = Depends(require_staff)):
    res = supabase.table("chat_mutes").select("*").limit(5000).execute()
    rows = res.data or []
    names = _room_names()
    now = _now()
    active = []
    for m in rows:
        room = names.get(m.get("room_id") or "", {})
        expires = m.get("expires_at")
        if expires and expires <= now:
            continue
        m["room_name"] = room.get("name") or ""
        m["room_emoji"] = room.get("emoji") or ""
        m["active"] = not expires
        active.append(m)
    return active


@router.get("/admin/bans")
async def admin_bans(_: dict = Depends(require_staff)):
    res = supabase.table("chat_bans").select("*").limit(5000).execute()
    rows = res.data or []
    names = _room_names()
    for b in rows:
        room = names.get(b.get("room_id") or "", {})
        b["room_name"] = room.get("name") or ""
        b["room_emoji"] = room.get("emoji") or ""
    return rows


@router.get("/admin/roles")
async def admin_roles(_: dict = Depends(require_staff)):
    res = supabase.table("chat_room_roles").select("*").limit(5000).execute()
    rows = res.data or []
    names = _room_names()
    for r in rows:
        room = names.get(r.get("room_id") or "", {})
        r["room_name"] = room.get("name") or ""
        r["room_emoji"] = room.get("emoji") or ""
    return rows


@router.get("/admin/recent-messages")
async def admin_recent_messages(limit: int = Query(30, ge=1, le=200), _: dict = Depends(require_staff)):
    res = (
        supabase.table("chat_messages")
        .select("id,room_id,sender,content,type,file_name,created_at,edited")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    names = _room_names()
    for m in rows:
        room = names.get(m.get("room_id") or "", {})
        m["room_name"] = room.get("name") or ""
        m["room_emoji"] = room.get("emoji") or ""
    return rows


# ── DM administration ──────────────────────────────────────────────────────────

def _user_meta() -> dict[str, dict]:
    res = supabase.table("users").select("username,role,avatar").limit(100000).execute()
    return {u["username"]: u for u in (res.data or [])}


@router.get("/admin/dm/requests")
async def admin_dm_requests(status: str = Query("", pattern="^(pending|accepted|rejected)?$"), _: dict = Depends(require_staff)):
    q = supabase.table("dm_requests").select("*").order("created_at", desc=True).limit(2000)
    if status:
        q = q.eq("status", status)
    rows = q.execute().data or []
    meta = _user_meta()
    for r in rows:
        s = meta.get(r.get("sender") or "", {})
        p = meta.get(r.get("recipient") or "", {})
        r["sender_avatar"] = s.get("avatar") or ""
        r["sender_role"] = s.get("role") or ""
        r["recipient_avatar"] = p.get("avatar") or ""
        r["recipient_role"] = p.get("role") or ""
    return rows


@router.get("/admin/dm/threads")
async def admin_dm_threads(_: dict = Depends(require_staff)):
    res = supabase.table("dm_threads").select("*").order("last_message_at", desc=True).limit(2000).execute()
    threads = res.data or []
    meta = _user_meta()
    for t in threads:
        cnt = supabase.table("dm_messages").select("id", count="exact").eq("thread_id", t["id"]).limit(1).execute()
        t["message_count"] = int(cnt.count or 0)
        a = meta.get(t.get("party_a") or "", {})
        b = meta.get(t.get("party_b") or "", {})
        t["a_avatar"] = a.get("avatar") or ""
        t["b_avatar"] = b.get("avatar") or ""
        t["a_role"] = a.get("role") or ""
        t["b_role"] = b.get("role") or ""
    return threads


@router.get("/admin/dm/blocks")
async def admin_dm_blocks(_: dict = Depends(require_staff)):
    res = supabase.table("dm_blocks").select("*").order("created_at", desc=True).limit(2000).execute()
    return res.data or []


@router.post("/admin/dm/requests/{request_id}/accept")
async def admin_accept_dm_request(request_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("dm_requests").select("*").eq("id", request_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Request not found")
    req = res.data
    if req.get("status") != "pending":
        raise HTTPException(400, "Request already handled")
    supabase.table("dm_requests").update({"status": "accepted"}).eq("id", request_id).execute()
    thread_id = _get_or_create_thread_id(req["sender"], req["recipient"])
    return {"ok": True, "thread_id": thread_id, "sender": req["sender"], "recipient": req["recipient"]}


@router.post("/admin/dm/requests/{request_id}/reject")
async def admin_reject_dm_request(request_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("dm_requests").select("*").eq("id", request_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Request not found")
    supabase.table("dm_requests").update({"status": "rejected"}).eq("id", request_id).execute()
    return {"ok": True}


@router.delete("/admin/dm/requests/{request_id}")
async def admin_delete_dm_request(request_id: str, _: dict = Depends(require_staff)):
    supabase.table("dm_requests").delete().eq("id", request_id).execute()
    return {"ok": True}


@router.delete("/admin/dm/blocks/{block_id}")
async def admin_unblock(block_id: str, _: dict = Depends(require_staff)):
    supabase.table("dm_blocks").delete().eq("id", block_id).execute()
    return {"ok": True}
