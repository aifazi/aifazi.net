"""
routers/forum.py — Threads, replies, reactions, likes, categories
FIX #5: Added None guards in pin_thread / lock_thread before accessing thread fields.
"""
import os
import uuid
import math
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from dependencies import get_current_user
from database import supabase
import bcrypt as _bcrypt

router = APIRouter()
ACCOUNT_LOCKED_MESSAGE = "Account locked. Contact support if you believe this is a mistake."

def _hash_password(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')

def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False

def require_forum_user(user: dict = Depends(get_current_user)) -> dict:
    if not user:
        raise HTTPException(401, "Login required")
    if not user.get("id") and not user.get("username"):
        raise HTTPException(401, "Login required")
    banned = bool(user.get("banned"))
    ban_reason = user.get("ban_reason") or ""
    uid = user.get("id") or user.get("sub")
    if uid:
        try:
            row = supabase.table("users").select("banned,ban_reason").eq("id", uid).limit(1).execute()
            if row.data:
                banned = bool(row.data[0].get("banned"))
                ban_reason = row.data[0].get("ban_reason") or ""
        except Exception:
            pass
    if banned:
        detail = ACCOUNT_LOCKED_MESSAGE
        if ban_reason:
            detail = f"{detail} Reason: {ban_reason}"
        raise HTTPException(423, detail)
    return user

def _user_id(user: dict) -> str | None:
    return user.get("id") or user.get("sub") or None

def _require_user_id(user: dict) -> str:
    uid = _user_id(user)
    if not uid:
        raise HTTPException(401, "Login required")
    return uid

class ThreadBody(BaseModel):
    title: str
    content: str
    category_id: str
    tags: list[str] = []
    attachments: list[dict] = []

class ReplyBody(BaseModel):
    content: str
    attachments: list[dict] = []

def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = "".join(c if c.isalnum() else "-" for c in slug)
    slug = "-".join(filter(None, slug.split("-")))
    return slug or "untitled"

def _generate_unique_slug(name: str) -> str:
    base = _slugify(name)
    slug = base
    for i in range(1, 100):
        existing = supabase.table("forum_categories").select("id").eq("slug", slug).limit(1).execute()
        if not existing.data:
            return slug
        slug = f"{base}-{i}"
    return f"{base}-{uuid.uuid4().hex[:6]}"

def _category_payload(body: dict) -> dict:
    allowed = {"name", "description", "icon", "color", "display_order", "locked", "thread_count", "post_roles", "view_roles", "reply_roles", "attach_roles", "mod_roles"}
    payload = {k: v for k, v in (body or {}).items() if k in allowed}
    if "order" in (body or {}) and "display_order" not in payload:
        payload["display_order"] = body.get("order") or 0
    if "threadCount" in (body or {}) and "thread_count" not in payload:
        payload["thread_count"] = body.get("threadCount") or 0
    if payload.get("name"):
        payload["slug"] = _generate_unique_slug(payload["name"])
    return payload

# ── Categories ──────────────────────────────────────────────────────────────────
@router.get("/categories")
async def get_categories():
    from utils.cache import get as cache_get, set as cache_set
    cached = cache_get("forum_categories")
    if cached is not None:
        return cached
    res = supabase.table("forum_categories").select("*").order("display_order").execute()
    result = [
        {
            "_id": row["id"], "id": row["id"],
            "name": row.get("name",""),
            "description": row.get("description",""),
            "icon": row.get("icon","💬"),
            "color": row.get("color","var(--cyan)"),
            "slug": row.get("slug",""),
            "order": row.get("display_order",0) or row.get("order",0),
            "locked": row.get("locked",False),
            "threadCount": row.get("thread_count",0) or row.get("threadCount",0),
            "post_roles": row.get("post_roles") or [],
            "view_roles": row.get("view_roles") or [],
            "reply_roles": row.get("reply_roles") or [],
            "attach_roles": row.get("attach_roles") or [],
            "mod_roles": row.get("mod_roles") or ["moderator", "admin"],
        }
        for row in (res.data or [])
    ]
    cache_set("forum_categories", result, ttl=60)
    return result

@router.post("/categories")
async def create_category(body: dict, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    from utils.cache import delete as cache_delete
    payload = _category_payload(body)
    if not (payload.get("name") or "").strip():
        raise HTTPException(400, "Category name is required")
    res = supabase.table("forum_categories").insert(payload).execute()
    cache_delete("forum_categories")
    return res.data[0]

@router.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: dict, user: dict = Depends(require_forum_user)):
    from utils.cache import delete as cache_delete
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    payload = _category_payload(body)
    res = supabase.table("forum_categories").update(payload).eq("id", cat_id).execute()
    cache_delete("forum_categories")
    return res.data[0]

@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(require_forum_user)):
    from utils.cache import delete as cache_delete
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    supabase.table("forum_categories").delete().eq("id", cat_id).execute()
    cache_delete("forum_categories")
    return {"message": "Deleted"}

# ── Threads ─────────────────────────────────────────────────────────────────────
@router.get("/threads")
async def list_threads(
    category_id: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=50),
    search: str | None = None,
    sort: str = "new",
):
    """List threads with sorting + pagination metadata.

    sort: new (created_at desc), top (most likes), hot (recent activity),
    old (created_at asc). Pinned threads always float to the top.
    """
    if sort not in ("new", "top", "hot", "old"):
        sort = "new"
    q = supabase.table("forum_threads").select(
        "id,title,category_id,author_id,author_name,tags,pinned,locked,views,reply_count,likes,last_reply_at,created_at"
    )
    count_q = supabase.table("forum_threads").select("id", count="exact")
    if category_id:
        q = q.eq("category_id", category_id)
        count_q = count_q.eq("category_id", category_id)
    if search:
        q = q.ilike("title", f"%{search}%")
        count_q = count_q.ilike("title", f"%{search}%")
    offset = (page - 1) * limit

    if sort == "top":
        q = q.order("pinned", desc=True).order("likes", desc=True).order("created_at", desc=True)
    elif sort == "old":
        q = q.order("pinned", desc=True).order("created_at")
    elif sort == "hot":
        q = q.order("pinned", desc=True).order("last_reply_at", desc=True)
    else:
        q = q.order("pinned", desc=True).order("created_at", desc=True)

    count_res = count_q.execute()
    total = count_res.count if hasattr(count_res, "count") else 0
    res = q.range(offset, offset + limit - 1).execute()
    rows = res.data or []
    # Fetch category names/colors/icons/slugs
    cat_ids = list({r["category_id"] for r in rows if r.get("category_id")})
    cat_map = {}
    if cat_ids:
        c = supabase.table("forum_categories").select("id,name,icon,color,slug").in_("id", cat_ids).execute()
        cat_map = {
            row["id"]: {
                "_id": row["id"], "name": row.get("name","Unknown"),
                "icon": row.get("icon","💬"), "color": row.get("color","var(--cyan)"),
                "slug": row.get("slug",""),
            } for row in (c.data or [])
        }
    # Fetch author avatars/usernames for a richer row
    author_ids = list({r["author_id"] for r in rows if r.get("author_id")})
    author_map = {}
    if author_ids:
        a = supabase.table("users").select("id,username,avatar,role").in_("id", author_ids).execute()
        author_map = {
            u["id"]: {"username": u.get("username","Unknown"), "avatar": u.get("avatar",""), "role": u.get("role","user")}
            for u in (a.data or [])
        }
    threads = [
        {
            "_id": r["id"], "id": r["id"],
            "title": r.get("title",""),
            "pinned": r.get("pinned",False),
            "locked": r.get("locked",False),
            "views": r.get("views",0),
            "replyCount": r.get("reply_count",0),
            "likes": (r.get("likes") or []).__len__(),
            "createdAt": r.get("created_at",""),
            "lastReplyAt": r.get("last_reply_at",""),
            "author": author_map.get(r.get("author_id"), {"username": r.get("author_name","Unknown"), "avatar": "", "role": "user"}),
            "category": cat_map.get(r.get("category_id"), {"_id": r.get("category_id"), "name": "Unknown", "icon": "💬", "color": "var(--cyan)", "slug": ""}),
        }
        for r in rows
    ]
    return {"threads": threads, "total": total, "pages": max(1, math.ceil(total / limit)) if total else 1, "page": page}

@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    res = supabase.table("forum_threads").select("*").eq("id", thread_id).limit(1).execute()
    thread = res.data[0] if (res.data or []) else None
    if not thread:
        raise HTTPException(404, "Thread not found")
    supabase.table("forum_threads").update({"views": (thread["views"] or 0) + 1}).eq("id", thread_id).execute()
    replies_res = supabase.table("forum_replies").select("*").eq("thread_id", thread_id).order("created_at").limit(500).execute()
    replies = replies_res.data or []

    author_ids = set()
    if thread.get("author_id"):
        author_ids.add(thread["author_id"])
    for r in replies:
        if r.get("author_id"):
            author_ids.add(r["author_id"])
    author_ids.discard(None)
    profiles = {}
    if author_ids:
        ids = list(author_ids)
        p_res = supabase.table("users").select("id,username,role,avatar").in_("id", ids).execute()
        profiles = {row["id"]: {"username": row.get("username","Unknown"), "role": row.get("role","user"), "avatar": row.get("avatar",""), "_id": row["id"]} for row in (p_res.data or [])}

    def _transform_author(item):
        aid = item.get("author_id")
        profile = profiles.get(aid) or {"username": item.get("author_name","Unknown"), "role": "user", "avatar": "", "_id": aid}
        return {
            "username": profile.get("username","Unknown"),
            "role": profile.get("role","user"),
            "avatar": profile.get("avatar",""),
            "_id": aid,
        }

    transformed_thread = {**thread, "_id": thread.get("id"), "createdAt": thread.get("created_at",""), "author": _transform_author(thread)}
    transformed_replies = [
        {**r, "_id": r.get("id"), "createdAt": r.get("created_at",""), "author": _transform_author(r)}
        for r in replies
    ]
    return {"thread": transformed_thread, "replies": transformed_replies}

@router.post("/threads")
async def create_thread(body: ThreadBody, user: dict = Depends(require_forum_user)):
    uid = _require_user_id(user)
    cat = supabase.table("forum_categories").select("post_roles,locked").eq("id", body.category_id).single().execute()
    if not cat.data:
        raise HTTPException(400, "Category not found")
    if cat.data.get("locked"):
        raise HTTPException(403, "Category is locked")
    post_roles = cat.data.get("post_roles") or []
    if post_roles and user.get("role") not in post_roles:
        raise HTTPException(403, f"You don't have permission to post in this category. Required role: {', '.join(post_roles)}")
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("forum_threads").insert({
        "title": body.title, "content": body.content,
        "category_id": body.category_id, "author_id": uid,
        "author_name": user["username"], "tags": body.tags,
        "attachments": body.attachments,
        "created_at": now, "updated_at": now, "last_reply_at": now,
    }).execute()
    u = supabase.table("users").select("thread_count").eq("id", uid).single().execute()
    if u.data:
        supabase.table("users").update({"thread_count": (u.data["thread_count"] or 0)+1}).eq("id", uid).execute()
    c = supabase.table("forum_categories").select("thread_count").eq("id", body.category_id).single().execute()
    if c.data:
        supabase.table("forum_categories").update({"thread_count": (c.data["thread_count"] or 0)+1}).eq("id", body.category_id).execute()
    return res.data[0]

@router.put("/threads/{thread_id}")
async def update_thread(thread_id: str, body: ThreadBody, user: dict = Depends(require_forum_user)):
    thread = supabase.table("forum_threads").select("author_id").eq("id", thread_id).single().execute().data
    if not thread:
        raise HTTPException(404, "Not found")
    uid = _user_id(user)
    if thread["author_id"] != uid and user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Not your thread")
    res = supabase.table("forum_threads").update({
        "title": body.title, "content": body.content,
        "tags": body.tags, "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", thread_id).execute()
    return res.data[0]

@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user: dict = Depends(require_forum_user)):
    thread = supabase.table("forum_threads").select("author_id,category_id").eq("id", thread_id).single().execute().data
    if not thread:
        raise HTTPException(404, "Not found")
    uid = _user_id(user)
    if thread["author_id"] != uid and user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Not your thread")
    supabase.table("forum_threads").delete().eq("id", thread_id).execute()
    return {"message": "Deleted"}

# ── Thread: pin/lock (mod only) ── FIX #5: None guards ─────────────────────────
@router.patch("/threads/{thread_id}/pin")
async def pin_thread(thread_id: str, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    t = supabase.table("forum_threads").select("pinned").eq("id", thread_id).single().execute().data
    if not t:
        raise HTTPException(404, "Thread not found")
    supabase.table("forum_threads").update({"pinned": not t["pinned"]}).eq("id", thread_id).execute()
    return {"pinned": not t["pinned"]}

@router.patch("/threads/{thread_id}/lock")
async def lock_thread(thread_id: str, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    t = supabase.table("forum_threads").select("locked").eq("id", thread_id).single().execute().data
    if not t:
        raise HTTPException(404, "Thread not found")
    supabase.table("forum_threads").update({"locked": not t["locked"]}).eq("id", thread_id).execute()
    return {"locked": not t["locked"]}

# ── Thread: like ────────────────────────────────────────────────────────────────
@router.post("/threads/{thread_id}/like")
async def toggle_like(thread_id: str, user: dict = Depends(require_forum_user)):
    t = supabase.table("forum_threads").select("likes").eq("id", thread_id).single().execute().data
    if not t:
        raise HTTPException(404, "Not found")
    likes = t.get("likes") or []
    uid = _require_user_id(user)
    if uid in likes:
        likes.remove(uid)
    else:
        likes.append(uid)
    supabase.table("forum_threads").update({"likes": likes}).eq("id", thread_id).execute()
    return {"likes": len(likes), "liked": uid in likes}

# ── Replies ─────────────────────────────────────────────────────────────────────
@router.get("/threads/{thread_id}/replies")
async def list_replies(thread_id: str, page: int = 1, limit: int = 50):
    offset = (page - 1) * limit
    res = supabase.table("forum_replies").select("*").eq("thread_id", thread_id).order("created_at").range(offset, offset+limit-1).execute()
    return res.data or []

@router.post("/threads/{thread_id}/replies")
async def create_reply(thread_id: str, body: ReplyBody, user: dict = Depends(require_forum_user)):
    uid = _require_user_id(user)
    t_res = supabase.table("forum_threads").select("locked,reply_count,author_id,category_id").eq("id", thread_id).limit(1).execute()
    t = t_res.data[0] if t_res.data else None
    if not t:
        raise HTTPException(404, "Thread not found")
    if t["locked"] and user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Thread is locked")
    if t.get("category_id"):
        cat = supabase.table("forum_categories").select("post_roles,reply_roles,locked").eq("id", t["category_id"]).single().execute().data
        if cat:
            if cat.get("locked") and user.get("role") not in ("admin","moderator"):
                raise HTTPException(403, "Category is locked")
            allowed_roles = cat.get("reply_roles") or cat.get("post_roles") or []
            if allowed_roles and user.get("role") not in allowed_roles:
                raise HTTPException(403, "You don't have permission to reply in this category")
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("forum_replies").insert({
        "thread_id": thread_id, "author_id": uid,
        "author_name": user["username"], "content": body.content,
        "attachments": body.attachments, "created_at": now,
    }).execute()
    supabase.table("forum_threads").update({
        "last_reply_at": now, "last_reply_by": uid,
        "reply_count": (t["reply_count"] or 0) + 1,
    }).eq("id", thread_id).execute()
    u = supabase.table("users").select("reply_count").eq("id", uid).execute()
    if u.data:
        supabase.table("users").update({"reply_count": (u.data[0]["reply_count"] or 0)+1}).eq("id", uid).execute()
    return res.data[0]

class ReplyBodyAlias(ReplyBody):
    thread: str

@router.post("/replies")
async def create_reply_alias(body: ReplyBodyAlias, user: dict = Depends(require_forum_user)):
    return await create_reply(body.thread, ReplyBody(content=body.content, attachments=body.attachments), user)

@router.put("/replies/{reply_id}")
async def update_reply(reply_id: str, body: ReplyBody, user: dict = Depends(require_forum_user)):
    r = supabase.table("forum_replies").select("author_id").eq("id", reply_id).single().execute().data
    if not r:
        raise HTTPException(404, "Not found")
    uid = _user_id(user)
    if r["author_id"] != uid and user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Not your reply")
    res = supabase.table("forum_replies").update({
        "content": body.content, "edited": True,
        "edited_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", reply_id).execute()
    return res.data[0]

@router.delete("/replies/{reply_id}")
async def delete_reply(reply_id: str, user: dict = Depends(require_forum_user)):
    r = supabase.table("forum_replies").select("author_id,thread_id").eq("id", reply_id).single().execute().data
    if not r:
        raise HTTPException(404, "Not found")
    uid = _user_id(user)
    if r["author_id"] != uid and user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Not your reply")
    supabase.table("forum_replies").delete().eq("id", reply_id).execute()
    t = supabase.table("forum_threads").select("reply_count").eq("id", r["thread_id"]).single().execute().data
    if t:
        supabase.table("forum_threads").update({"reply_count": max(0, (t["reply_count"] or 1)-1)}).eq("id", r["thread_id"]).execute()
    return {"message": "Deleted"}

# ── Forum users (admin/mod view) ────────────────────────────────────────────────
@router.get("/users")
async def list_forum_users(user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    res = supabase.table("users").select(
        "id,username,email,role,banned,ban_reason,thread_count,reply_count,last_seen,created_at,avatar,bio"
    ).order("created_at", desc=True).limit(1000).execute()
    return [
        {
            "_id": u["id"], "id": u["id"],
            "username": u["username"],
            "email": u.get("email",""),
            "role": u.get("role","user"),
            "banned": u.get("banned",False),
            "banReason": u.get("ban_reason",""),
            "avatar": u.get("avatar",""),
            "bio": u.get("bio",""),
            "threadCount": u.get("thread_count",0),
            "replyCount": u.get("reply_count",0),
            "createdAt": u.get("created_at",""),
            "lastSeen": u.get("last_seen",""),
        }
        for u in (res.data or [])
    ]

# ── Admin stats ─────────────────────────────────────────────────────────────────
@router.get("/admin/stats")
async def forum_admin_stats(user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")

    import asyncio

    async def count(table):
        r = supabase.table(table).select("*", count="exact", head=True).execute()
        return r.count if hasattr(r, 'count') else 0

    async def recent_users():
        r = supabase.table("users") \
            .select("id,username,email,role,banned,ban_reason,created_at") \
            .order("created_at", desc=True).limit(10).execute()
        return [
            { "_id": u["id"], "username": u["username"], "email": u.get("email",""),
              "role": u.get("role","user"), "banned": u.get("banned",False), "createdAt": u.get("created_at","") }
            for u in (r.data or [])
        ]

    async def recent_threads():
        r = supabase.table("forum_threads") \
            .select("id,title,author_id,category_id,created_at") \
            .order("created_at", desc=True).limit(10).execute()
        threads = r.data or []
        author_ids = list({t["author_id"] for t in threads if t.get("author_id")})
        category_ids = list({t["category_id"] for t in threads if t.get("category_id")})

        authors = {}
        if author_ids:
            a = supabase.table("users").select("id,username").in_("id", author_ids).execute()
            authors = {u["id"]: u["username"] for u in (a.data or [])}

        categories = {}
        if category_ids:
            c = supabase.table("forum_categories").select("id,name").in_("id", category_ids).execute()
            categories = {u["id"]: u["name"] for u in (c.data or [])}

        return [
            {
                "_id": t["id"],
                "title": t.get("title",""),
                "createdAt": t.get("created_at",""),
                "author": { "username": authors.get(t.get("author_id",""), "Unknown") },
                "category": { "name": categories.get(t.get("category_id",""), "Unknown") },
            }
            for t in threads
        ]

    users_c, threads_c, replies_c, categories_c = await asyncio.gather(
        count("users"), count("forum_threads"),
        count("forum_replies"), count("forum_categories"),
    )
    rusers, rthreads = await asyncio.gather(recent_users(), recent_threads())

    return {
        "users": users_c, "threads": threads_c,
        "replies": replies_c, "categories": categories_c,
        "recentUsers": rusers, "recentThreads": rthreads,
    }

# ── Per-user activity endpoints (used by ForumProfile activity tab) ──────────
@router.get("/users/{user_id}/threads")
async def user_threads(user_id: str, limit: int = 10):
    if not _is_uuid(user_id):
        return []
    res = supabase.table("forum_threads").select("id,title,created_at,likes,views,category_id") \
        .eq("author_id", user_id).order("created_at", desc=True).limit(limit).execute()
    return res.data or []

@router.get("/users/{user_id}/replies")
async def user_replies(user_id: str, limit: int = 10):
    if not _is_uuid(user_id):
        return []
    res = supabase.table("forum_replies").select("id,content,created_at,thread_id") \
        .eq("author_id", user_id).order("created_at", desc=True).limit(limit).execute()
    return res.data or []

@router.patch("/users/{user_id}/ban")
async def ban_user(user_id: str, body: dict, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    if not _is_uuid(user_id):
        raise HTTPException(400, "Invalid user id")
    target = supabase.table("users").select("id,role,username").eq("id", user_id).single().execute().data
    if not target:
        raise HTTPException(404, "User not found")
    # C3 — moderators may not ban admins, and nobody may ban themselves
    if target.get("role") == "admin":
        raise HTTPException(403, "Admins cannot be banned")
    if user_id == _user_id(user):
        raise HTTPException(403, "You cannot ban yourself")
    supabase.table("users").update({
        "banned": body.get("banned", True),
        "ban_reason": body.get("reason",""),
    }).eq("id", user_id).execute()
    return {"message": "Updated"}

# ── Admin user management ─────────────────────────────────────────────────────
@router.get("/admin/users/{user_id}")
async def get_forum_user_admin(user_id: str, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    res = supabase.table("users").select(
        "id,username,email,role,banned,ban_reason,thread_count,reply_count,last_seen,created_at,avatar,bio"
    ).eq("id", user_id).single().execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    u = res.data
    return {"user": {
        "_id": u["id"], "username": u["username"], "email": u["email"],
        "bio": u.get("bio",""), "avatar": u.get("avatar",""),
        "role": u.get("role","user"), "banned": u.get("banned",False),
        "banReason": u.get("ban_reason",""), "createdAt": u.get("created_at",""),
        "threadCount": u.get("thread_count",0), "replyCount": u.get("reply_count",0),
        "lastSeen": u.get("last_seen",""),
    }}

@router.put("/admin/users/{user_id}")
async def update_forum_user(user_id: str, body: dict, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    if not _is_uuid(user_id):
        raise HTTPException(400, "Invalid user id")
    target = supabase.table("users").select("id,role,username").eq("id", user_id).single().execute().data
    if not target:
        raise HTTPException(404, "User not found")
    target_role = target.get("role") or "user"
    my_role = user.get("role") or "user"

    # C2 — only admins may change roles, and no self-demotion/self-promotion.
    # Password resets are admin-only: a moderator resetting a member's password
    # silently lets them log in as that member (account takeover).
    allowed_fields = {"username","email","bio","avatar","banned","banReason"}
    if my_role != "admin":
        if "role" in body:
            raise HTTPException(403, "Only admins can change roles")
        if user_id == _user_id(user):
            raise HTTPException(403, "You cannot modify your own account")
    if "role" in body:
        if user_id == _user_id(user):
            raise HTTPException(403, "You cannot change your own role")
        new_role = body["role"]
        if new_role not in ("user","moderator","admin"):
            raise HTTPException(400, "Invalid role")
        # prevent an admin from being demoted by a moderator (already blocked above)
        if target_role == "admin" and my_role != "admin":
            raise HTTPException(403, "Only admins can modify other admins")
        allowed_fields.add("role")
    if my_role == "admin":
        allowed_fields.add("newPassword")

    update = {}
    for k in allowed_fields:
        if k in body:
            if k == "banReason":
                update["ban_reason"] = body[k]
            elif k == "newPassword":
                # C2 — never store plaintext; hash into password_hash
                update["password_hash"] = _hash_password(body[k])
            else:
                update[k] = body[k]
    if update:
        supabase.table("users").update(update).eq("id", user_id).execute()
    return {"message": "Updated"}

@router.delete("/admin/users/{user_id}")
async def delete_forum_user(user_id: str, user: dict = Depends(require_forum_user)):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    if not _is_uuid(user_id):
        raise HTTPException(400, "Invalid user id")
    target = supabase.table("users").select("id,role,username").eq("id", user_id).single().execute().data
    if not target:
        raise HTTPException(404, "User not found")
    # C3 — only admins may delete admins, and nobody may delete themselves
    if target.get("role") == "admin" and user.get("role") != "admin":
        raise HTTPException(403, "Only admins can delete admins")
    if user_id == _user_id(user):
        raise HTTPException(403, "You cannot delete your own account")
    supabase.table("users").delete().eq("id", user_id).execute()
    supabase.table("forum_threads").delete().eq("author_id", user_id).execute()
    supabase.table("forum_replies").delete().eq("author_id", user_id).execute()
    return {"message": "Deleted"}

# ── List all replies (admin) ──────────────────────────────────────────────────
@router.get("/replies")
async def list_replies_admin(
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=50),
    user: dict = Depends(require_forum_user),
):
    if user.get("role") not in ("admin","moderator"):
        raise HTTPException(403, "Moderator+ only")
    offset = (page - 1) * limit
    q = supabase.table("forum_replies").select(
        "id,content,created_at,edited,edited_at,author_id,thread_id"
    ).order("created_at", desc=True)
    if search:
        q = q.ilike("content", f"%{search}%")
    total_q = supabase.table("forum_replies").select("*", count="exact", head=True)
    if search:
        total_q = total_q.ilike("content", f"%{search}%")
    total_res = total_q.execute()
    total = total_res.count if hasattr(total_res, 'count') else 0
    res = q.range(offset, offset + limit - 1).execute()
    rows = res.data or []

    # Fetch author & thread data
    author_ids = list({r["author_id"] for r in rows if r.get("author_id")})
    thread_ids = list({r["thread_id"] for r in rows if r.get("thread_id")})
    authors = {}
    if author_ids:
        a = supabase.table("users").select("id,username,banned").in_("id", author_ids).execute()
        authors = {u["id"]: u for u in (a.data or [])}
    threads = {}
    if thread_ids:
        t = supabase.table("forum_threads").select("id,title").in_("id", thread_ids).execute()
        threads = {th["id"]: th["title"] for th in (t.data or [])}

    replies = [{
        "_id": r["id"],
        "content": r.get("content",""),
        "createdAt": r.get("created_at",""),
        "edited": r.get("edited",False),
        "author": {
            "_id": r.get("author_id"),
            "username": authors[r["author_id"]]["username"] if r.get("author_id") in authors else "Unknown",
            "banned": authors[r["author_id"]]["banned"] if r.get("author_id") in authors else False,
        },
        "thread": {
            "_id": r.get("thread_id"),
            "title": threads.get(r.get("thread_id",""), "Unknown"),
        },
    } for r in rows]

    return {"replies": replies, "total": total}

class ReactBody(BaseModel):
    emoji: str

@router.post("/threads/{thread_id}/react")
async def react_thread(thread_id: str, body: ReactBody, user: dict = Depends(require_forum_user)):
    uid = _require_user_id(user)
    if not body.emoji or len(body.emoji) > 8:
        raise HTTPException(400, "Invalid emoji")
    t = supabase.table("forum_threads").select("reactions").eq("id", thread_id).single().execute().data
    if not t:
        raise HTTPException(404, "Thread not found")
    reactions = t.get("reactions") or {}
    users = reactions.get(body.emoji, [])
    if uid in users:
        users.remove(uid)
    else:
        users.append(uid)
    if not users:
        reactions.pop(body.emoji, None)
    else:
        reactions[body.emoji] = users
    supabase.table("forum_threads").update({"reactions": reactions}).eq("id", thread_id).execute()
    summary = {e: len(v) for e, v in reactions.items()}
    my_reactions = [e for e, v in reactions.items() if uid in v]
    return {"reactions": summary, "myReactions": my_reactions}

@router.post("/threads/{thread_id}/subscribe")
async def subscribe_thread(thread_id: str, user: dict = Depends(require_forum_user)):
    uid = _require_user_id(user)
    t = supabase.table("forum_threads").select("subscribers").eq("id", thread_id).single().execute().data
    if not t:
        raise HTTPException(404, "Thread not found")
    subs = t.get("subscribers") or []
    if uid in subs:
        subs.remove(uid)
        subscribed = False
    else:
        subs.append(uid)
        subscribed = True
    supabase.table("forum_threads").update({"subscribers": subs}).eq("id", thread_id).execute()
    return {"subscribed": subscribed}

@router.post("/replies/{reply_id}/like")
async def like_reply(reply_id: str, user: dict = Depends(require_forum_user)):
    uid = _require_user_id(user)
    r = supabase.table("forum_replies").select("likes").eq("id", reply_id).single().execute().data
    if not r:
        raise HTTPException(404, "Reply not found")
    likes = r.get("likes") or []
    if uid in likes:
        likes.remove(uid)
    else:
        likes.append(uid)
    supabase.table("forum_replies").update({"likes": likes}).eq("id", reply_id).execute()
    return {"likes": len(likes), "liked": uid in likes}

@router.post("/replies/{reply_id}/react")
async def react_reply(reply_id: str, body: ReactBody, user: dict = Depends(require_forum_user)):
    """Emoji reactions on replies — mirrors the thread reaction behaviour."""
    uid = _require_user_id(user)
    if not body.emoji or len(body.emoji) > 8:
        raise HTTPException(400, "Invalid emoji")
    r = supabase.table("forum_replies").select("reactions").eq("id", reply_id).single().execute().data
    if not r:
        raise HTTPException(404, "Reply not found")
    reactions = r.get("reactions") or {}
    users = reactions.get(body.emoji, [])
    if uid in users:
        users.remove(uid)
    else:
        users.append(uid)
    if not users:
        reactions.pop(body.emoji, None)
    else:
        reactions[body.emoji] = users
    supabase.table("forum_replies").update({"reactions": reactions}).eq("id", reply_id).execute()
    summary = {e: len(v) for e, v in reactions.items()}
    my_reactions = [e for e, v in reactions.items() if uid in v]
    return {"reactions": summary, "myReactions": my_reactions}
