"""routers/stats.py — Admin analytics dashboard + collection browser + user/content actions
Structured to match frontend DatabaseGUI shape.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import call_with_retry, supabase
from dependencies import require_admin, require_staff
from utils.email import render_template
from utils.email_queue import queue_email

router = APIRouter()

# H9 — fields that must NEVER be returned to the admin collection browser.
# Even authenticated staff shouldn't see other users' bcrypt hashes (which they
# could crack offline) or TOTP secrets (which subvert 2FA), refresh tokens
# (replay-bearer), or E2EE room keys.
REDACT_FROM_BROWSE = frozenset({
    "password", "password_hash",
    "verifytoken", "verify_token", "verify_expires",
    "resettoken",  "reset_token",  "reset_expires",
    "chattoken",   "chat_token",
    "totp_secret",
    "refresh_token",
    "encryption_key",
    "service_role_key",
    "api_key",
})


def _redact_sensitive(doc: dict) -> dict:
    """Strip sensitive columns from a row that's about to be returned to the
    admin collection browser. Replaces values with a sentinel so the column
    shape is preserved (UI doesn't break) but the secret is wiped.
    """
    if not doc:
        return doc
    for key in list(doc.keys()):
        if key and key.lower() in REDACT_FROM_BROWSE:
            doc[key] = "[REDACTED]" if doc.get(key) else doc.get(key)
    return doc

# ── Table mapping ─────────────────────────────────────────────────────────────
COLL_TABLE = {
    "users":      "users",
    "posts":      "posts",
    "threads":    "forum_threads",
    "replies":    "forum_replies",
    "contacts":   "contacts",
    "messages":   "chat_messages",
    "media":      "media",
    "staff":      "users",
    "newsletter": "newsletter_subs",
}
COLL_SEARCH_FIELD = {
    "users":      "username",
    "posts":      "title",
    "threads":    "title",
    "replies":    "content",
    "contacts":   "email",
    "messages":   "content",
    "media":      "filename",
    "staff":      "username",
    "newsletter": "email",
}

def _normalize(doc: dict) -> dict:
    """Add _id alias so frontend code using doc._id works with Supabase id."""
    if doc and "id" in doc:
        doc["_id"] = doc["id"]
    if doc:
        if "email_verified" in doc and "emailVerified" not in doc:
            doc["emailVerified"] = bool(doc.get("email_verified"))
        if "ban_reason" in doc and "banReason" not in doc:
            doc["banReason"] = doc.get("ban_reason") or ""
        if "created_at" in doc and "createdAt" not in doc:
            doc["createdAt"] = doc.get("created_at")
        if "updated_at" in doc and "updatedAt" not in doc:
            doc["updatedAt"] = doc.get("updated_at")
        if "last_seen" in doc and "lastSeen" not in doc:
            doc["lastSeen"] = doc.get("last_seen")
        if "thread_count" in doc and "threadCount" not in doc:
            doc["threadCount"] = doc.get("thread_count") or 0
        if "reply_count" in doc and "replyCount" not in doc:
            doc["replyCount"] = doc.get("reply_count") or 0
    return doc

def _normalize_list(docs):
    return [_normalize(d) for d in docs]

def _count(table, **filters):
    q = supabase.table(table).select("id", count="exact")
    for k, v in filters.items():
        q = q.eq(k, v)
    r = q.execute()
    return r.count or 0

def _since(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

@router.get("/visitors/live")
async def live_visitors():
    """Live visitor count — returns online users in last 5 minutes.
    Unauthenticated (used by public visitor counter widget)."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        res = supabase.table("visitor_sessions") \
            .select("id", count="exact") \
            .gte("last_seen", since).execute()
        count = res.count or 0
    except Exception:
        count = 0
    return {"online": count, "ts": datetime.now(timezone.utc).isoformat()}


def _stats_impl():
    # ── Counts via DB aggregation ─────────────────────────────────────────────
    posts_count         = supabase.table("posts").select("id", count="exact").execute()
    published_count     = supabase.table("posts").select("id", count="exact").eq("published", True).execute()
    drafts_count        = supabase.table("posts").select("id", count="exact").eq("published", False).execute()
    users_count         = supabase.table("users").select("id", count="exact").execute()
    verified_count      = supabase.table("users").select("id", count="exact").eq("email_verified", True).execute()
    banned_count        = supabase.table("users").select("id", count="exact").eq("banned", True).execute()
    threads_count       = supabase.table("forum_threads").select("id", count="exact").execute()
    replies_count       = supabase.table("forum_replies").select("id", count="exact").execute()
    newsletter_count    = supabase.table("newsletter_subs").select("id", count="exact").execute()
    newsletter_active   = supabase.table("newsletter_subs").select("id", count="exact").eq("status", "active").execute()
    chat_count          = supabase.table("chat_messages").select("id", count="exact").execute()
    contacts_count      = supabase.table("contacts").select("id", count="exact").execute()
    media_count         = supabase.table("media").select("id", count="exact").execute()
    staff_count         = supabase.table("users").select("id", count="exact").execute()
    chat_rooms_count    = _count("chat_rooms")

    # ── Today / This week ─────────────────────────────────────────────────────
    today_str = _since(1)
    week_str  = _since(7)
    today_posts    = supabase.table("posts").select("id", count="exact").gte("created_at", today_str).execute()
    today_users    = supabase.table("users").select("id", count="exact").gte("created_at", today_str).execute()
    today_threads  = supabase.table("forum_threads").select("id", count="exact").gte("created_at", today_str).execute()
    week_posts     = supabase.table("posts").select("id", count="exact").gte("created_at", week_str).execute()
    week_users     = supabase.table("users").select("id", count="exact").gte("created_at", week_str).execute()
    week_threads   = supabase.table("forum_threads").select("id", count="exact").gte("created_at", week_str).execute()

    # ── Top posts (DB-sorted, limited) ────────────────────────────────────────
    top_res = supabase.table("posts").select("id,title,slug,views").order("views", desc=True).limit(5).execute()
    top_posts = [
        _normalize({"id": p.get("id"), "title": p.get("title"), "slug": p.get("slug"), "views": p.get("views", 0)})
        for p in (top_res.data or [])
    ]

    # ── Recent users (DB-sorted, limited) ─────────────────────────────────────
    recent_res = supabase.table("users").select("id,username,email,role,email_verified,created_at").order("created_at", desc=True).limit(5).execute()
    recent_users = _normalize_list([
        {"id": u.get("id"), "username": u.get("username"), "email": u.get("email",""),
         "role": u.get("role","user"), "emailVerified": u.get("email_verified"), "createdAt": u.get("created_at")}
        for u in (recent_res.data or [])
    ])

    # ── Recent contacts ───────────────────────────────────────────────────────
    contacts_res = supabase.table("contacts").select("id,name,email,subject,created_at").order("created_at", desc=True).limit(5).execute()
    recent_contacts = _normalize_list([
        {"id": c.get("id"), "name": c.get("name"), "email": c.get("email"),
         "subject": c.get("subject"), "createdAt": c.get("created_at")}
        for c in (contacts_res.data or [])
    ])

    # ── Total views (one column, no pagination needed) ────────────────────────
    views_res = supabase.table("posts").select("views").execute()
    total_views = sum(p.get("views", 0) for p in (views_res.data or []))

    return {
        "counts": {
            "posts": {
                "total":       posts_count.count or 0,
                "published":   published_count.count or 0,
                "drafts":      drafts_count.count or 0,
                "total_views": total_views,
            },
            "users": {
                "total":    users_count.count or 0,
                "verified": verified_count.count or 0,
                "banned":   banned_count.count or 0,
            },
            "forum": {
                "threads": threads_count.count or 0,
                "replies": replies_count.count or 0,
            },
            "newsletter": {
                "total":  newsletter_count.count or 0,
                "active": newsletter_active.count or 0,
            },
            "chat": {
                "messages": chat_count.count or 0,
                "rooms":    chat_rooms_count,
            },
            "contacts":  contacts_count.count or 0,
            "media":     media_count.count or 0,
            "staff":     staff_count.count or 0,
        },
        "today": {
            "posts":    today_posts.count or 0,
            "users":    today_users.count or 0,
            "threads":  today_threads.count or 0,
            "messages": 0,
        },
        "week": {
            "posts":    week_posts.count or 0,
            "users":    week_users.count or 0,
            "threads":  week_threads.count or 0,
            "messages": 0,
        },
        "topPosts": top_posts,
        "recent": {
            "users":    recent_users,
            "contacts": recent_contacts,
        },
        "categories": [],
    }


@router.get("")
def stats(_: dict = Depends(require_staff)):
    # Retry once after resetting the client: a stale keep-alive connection on a
    # warm serverless invocation surfaces as "RemoteProtocolError: Server
    # disconnected". A fresh client clears it without re-running this heavy
    # dashboard query dozens of times.
    return call_with_retry(_stats_impl)


# ── Collection browser ────────────────────────────────────────────────────────
@router.get("/collection/{coll}")
async def collection_browse(
    coll: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    search: str = "",
    _: dict = Depends(require_staff),
):
    table = COLL_TABLE.get(coll)
    if not table:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {coll}")
    offset = (page - 1) * limit
    # NOTE: kept async-only wrapper for back-compat; body is sync (see stats).
    return await asyncio.to_thread(_collection_browse_sync, coll, page, limit, search)


def _collection_browse_sync(coll: str, page: int, limit: int, search: str) -> dict:
    table = COLL_TABLE.get(coll)
    if not table:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {coll}")
    offset = (page - 1) * limit
    try:
        q = supabase.table(table).select("*", count="exact")
        if search:
            field = COLL_SEARCH_FIELD.get(coll, "id")
            q = q.ilike(field, f"%{search}%")
        q = q.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = q.execute()
        total = res.count or 0
        # H9 — strip password_hash / totp_secret / refresh_token / encryption_key / verify_token
        # via _redact_sensitive BEFORE returning rows to the admin collection browser.
        docs = _normalize_list([_redact_sensitive(d) for d in (res.data or [])])
        pages = max(1, (total + limit - 1) // limit)
        return {"docs": docs, "total": total, "page": page, "pages": pages}
    except Exception as e:
        import logging
        import os
        logging.getLogger(__name__).error("collection_docs error: %s", e, exc_info=True)
        detail = str(e) if os.getenv("ENV", "production") != "production" else "An internal error occurred."
        raise HTTPException(status_code=500, detail=detail)


# ── DB Health ─────────────────────────────────────────────────────────────────
@router.get("/db-health")
def db_health(_: dict = Depends(require_staff)):
    tables = list(COLL_TABLE.values())
    sizes = {}
    for alias, tbl in COLL_TABLE.items():
        try:
            r = supabase.table(tbl).select("id", count="exact").execute()
            sizes[alias] = r.count or 0
        except Exception:
            sizes[alias] = 0
    return {
        "status": "connected",
        "provider": "supabase",
        "collections": sizes,
        "storage": None,
        "indexes": [],
        "slowQueries": [],
    }


# ── User actions ──────────────────────────────────────────────────────────────
class UserActionBody(BaseModel):
    role:    str | None = None
    reason:  str | None = None
    subject: str | None = None
    message: str | None = None

@router.post("/actions/users/{user_id}/verify")
async def user_verify(user_id: str, _: dict = Depends(require_staff)):
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("users").update({
        "email_verified": True,
        "verify_token": None,
        "verify_expires": None,
        "updated_at": now,
    }).eq("id", user_id).execute()
    user = (res.data or [None])[0]
    if not user:
        chk = supabase.table("users").select("*").eq("id", user_id).limit(1).execute()
        user = (chk.data or [None])[0]
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User verified", "user": _normalize(user)}

@router.post("/actions/users/{user_id}/send-verification")
async def user_send_verification(user_id: str, _: dict = Depends(require_staff)):
    return {"message": "Verification email queued (configure SMTP to enable)"}

@router.post("/actions/users/{user_id}/ban")
async def user_ban(user_id: str, body: UserActionBody, _: dict = Depends(require_staff)):
    res = supabase.table("users").update({"banned": True, "ban_reason": body.reason or ""}).eq("id", user_id).execute()
    user = (res.data or [None])[0]
    if not user:
        chk = supabase.table("users").select("*").eq("id", user_id).limit(1).execute()
        user = (chk.data or [None])[0]
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User banned", "user": _normalize(user)}

@router.post("/actions/users/{user_id}/unban")
async def user_unban(user_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("users").update({"banned": False, "ban_reason": None}).eq("id", user_id).execute()
    user = (res.data or [None])[0]
    if not user:
        chk = supabase.table("users").select("*").eq("id", user_id).limit(1).execute()
        user = (chk.data or [None])[0]
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User unbanned", "user": _normalize(user)}

@router.post("/actions/users/{user_id}/role")
async def user_set_role(user_id: str, body: UserActionBody, user: dict = Depends(require_admin)):
    """H10 — only admin can change roles. Self-promotion is explicitly blocked
    (a moderator knowing only this endpoint could otherwise POST their own id
    with role='admin' and gain full superuser in seconds)."""
    if not body.role:
        raise HTTPException(status_code=400, detail="role is required")
    if body.role not in ("user", "member", "moderator", "editor", "chat", "admin"):
        raise HTTPException(status_code=400, detail=f"Unknown role: {body.role}")
    if str(user.get("id")) == str(user_id):
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    supabase.table("users").update({"role": body.role}).eq("id", user_id).execute()
    return {"message": f"Role set to {body.role}"}

@router.post("/actions/users/{user_id}/send-reset")
async def user_send_reset(user_id: str, _: dict = Depends(require_staff)):
    user = supabase.table("users").select("username,email").eq("id", user_id).limit(1).execute()
    if not user.data or not user.data[0].get("email"):
        raise HTTPException(status_code=404, detail="User email not found")
    row = user.data[0]
    login_url = "https://aifazi.net/login"
    subject, html = render_template("password_reset_admin", {
        "site_name": "aifazi.net",
        "username": row.get("username") or "there",
        "login_url": login_url,
    })
    subject = subject or "Password reset requested"
    text = "An admin started a password reset for your account. Open the login page and use Forgot Password to complete the reset."
    html = html or f"<p>Hi {escape(row.get('username') or 'there')},</p><p>An admin started a password reset for your account.</p><p>Open the login page and use <strong>Forgot Password</strong> to complete the reset.</p>"
    await queue_email(row["email"], subject, html, text, "password_reset_admin", row.get("username") or "")
    return {"message": "Password reset email queued"}

@router.post("/actions/users/{user_id}/send-email")
async def user_send_email(user_id: str, body: UserActionBody, _: dict = Depends(require_staff)):
    user = supabase.table("users").select("username,email").eq("id", user_id).limit(1).execute()
    if not user.data or not user.data[0].get("email"):
        raise HTTPException(status_code=404, detail="User email not found")
    if not body.subject or not body.message:
        raise HTTPException(status_code=400, detail="subject and message are required")
    row = user.data[0]
    subject, html = render_template("admin_user_message", {
        "site_name": "aifazi.net",
        "username": row.get("username") or "there",
        "subject": body.subject,
        "message": escape(body.message).replace("\n", "<br>"),
    })
    subject = subject or body.subject
    safe_message = escape(body.message).replace("\n", "<br>")
    html = html or f"<p>Hi {escape(row.get('username') or 'there')},</p><p>{safe_message}</p>"
    await queue_email(row["email"], subject, html, body.message, "admin_user_message", row.get("username") or "")
    return {"message": "Email to user queued"}


# ── Content actions ───────────────────────────────────────────────────────────
@router.post("/actions/posts/{post_id}/toggle-publish")
async def post_toggle_publish(post_id: str, _: dict = Depends(require_staff)):
    cur = supabase.table("posts").select("published").eq("id", post_id).single().execute()
    new_val = not (cur.data or {}).get("published", False)
    supabase.table("posts").update({"published": new_val}).eq("id", post_id).execute()
    return {"message": "Published" if new_val else "Unpublished"}

@router.post("/actions/threads/{thread_id}/toggle-pin")
async def thread_toggle_pin(thread_id: str, _: dict = Depends(require_staff)):
    cur = supabase.table("forum_threads").select("pinned").eq("id", thread_id).single().execute()
    new_val = not (cur.data or {}).get("pinned", False)
    supabase.table("forum_threads").update({"pinned": new_val}).eq("id", thread_id).execute()
    return {"message": "Pinned" if new_val else "Unpinned"}

@router.post("/actions/threads/{thread_id}/toggle-lock")
async def thread_toggle_lock(thread_id: str, _: dict = Depends(require_staff)):
    cur = supabase.table("forum_threads").select("locked").eq("id", thread_id).single().execute()
    new_val = not (cur.data or {}).get("locked", False)
    supabase.table("forum_threads").update({"locked": new_val}).eq("id", thread_id).execute()
    return {"message": "Locked" if new_val else "Unlocked"}

@router.post("/actions/newsletter/{sub_id}/toggle-active")
async def newsletter_toggle(sub_id: str, _: dict = Depends(require_staff)):
    cur = supabase.table("newsletter_subs").select("status").eq("id", sub_id).single().execute()
    cur_status = (cur.data or {}).get("status", "active")
    new_status = "inactive" if cur_status == "active" else "active"
    supabase.table("newsletter_subs").update({"status": new_status}).eq("id", sub_id).execute()
    return {"message": "Activated" if new_status == "active" else "Deactivated"}
