"""
routers/blog.py — Blog posts CRUD + comments + reactions + related posts
FIX #2: Moved /meta/categories and /admin/all ABOVE /{slug} wildcard.
FIX #6: Pagination count now respects published filter.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from database import supabase
from dependencies import bearer, decode_token, get_current_user, require_staff
from utils.link_safety import schedule_scan

router = APIRouter()


def _optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict | None:
    if not creds:
        return None
    try:
        payload = decode_token(creds.credentials)
    except HTTPException:
        return None
    user_id = payload.get("id")
    if user_id:
        try:
            row = supabase.table("users").select("id,username,email,role").eq("id", user_id).limit(1).execute()
            if row.data:
                payload.update(row.data[0])
        except Exception:
            pass
    return payload


def _is_staff(user: dict | None) -> bool:
    return bool(user and (user.get("role") in ("admin", "moderator", "editor")))


def _resolve_post_id(post_id_or_slug: str) -> str | None:
    """Resolve a post id or slug to the post's id (uuid)."""
    if not post_id_or_slug:
        return None
    if len(post_id_or_slug) == 36 and "-" in post_id_or_slug:
        try:
            import uuid as _uuid
            _uuid.UUID(post_id_or_slug)
            res = supabase.table("posts").select("id").eq("id", post_id_or_slug).limit(1).execute()
            if res.data:
                return res.data[0]["id"]
        except ValueError:
            pass
    res = supabase.table("posts").select("id").eq("slug", post_id_or_slug).limit(1).execute()
    if res.data:
        return res.data[0]["id"]
    return None

class PostBody(BaseModel):
    title: str
    slug: str
    excerpt: str = ""
    content: str = ""
    cover_image: str = ""
    video_url: str = ""
    category: str = "General"
    tags: list[str] = []
    published: bool = False
    publish_at: str | None = None
    author_name: str = "Admin"

# ── Get all categories from posts ─────────────── MUST be before /{slug} ──────
@router.get("/meta/categories")
async def get_categories():
    res = supabase.table("posts").select("category").eq("published", True).execute()
    cats = list({p["category"] for p in (res.data or []) if p.get("category")})
    return {"categories": sorted(cats)}

# ── Admin: get ALL posts as flat array ────────── MUST be before /{slug} ──────
@router.get("/admin/all")
async def admin_all_posts(_: dict = Depends(require_staff)):
    res = supabase.table("posts").select(
        "id,title,slug,excerpt,cover_image,category,tags,published,views,created_at,author_name"
    ).order("created_at", desc=True).limit(1000).execute()
    return res.data or []

# ── Comments (public read; auth write) ─────────────────────────────────────────
class CommentBody(BaseModel):
    content: str
    author_name: str = ""

@router.get("/comments/{post_id_or_slug}")
async def list_comments(post_id_or_slug: str):
    post_id = _resolve_post_id(post_id_or_slug)
    if not post_id:
        raise HTTPException(404, "Post not found")
    res = supabase.table("blog_comments") \
        .select("id,content,author_name,author_id,created_at") \
        .eq("post_id", post_id).order("created_at").limit(500).execute()
    author_ids = list({c["author_id"] for c in (res.data or []) if c.get("author_id")})
    profiles = {}
    if author_ids:
        p = supabase.table("users").select("id,username,avatar,role").in_("id", author_ids).execute()
        profiles = {
            u["id"]: {"_id": u["id"], "username": u.get("username","Unknown"), "avatar": u.get("avatar",""), "role": u.get("role","user")}
            for u in (p.data or [])
        }
    return [
        {
            "_id": c["id"], "id": c["id"],
            "content": c.get("content",""),
            "createdAt": c.get("created_at",""),
            "author": profiles.get(c.get("author_id")) or {"username": c.get("author_name","Anonymous"), "avatar": "", "role": "user", "_id": None},
        }
        for c in (res.data or [])
    ]

@router.post("/comments/{post_id_or_slug}")
async def create_comment(post_id_or_slug: str, body: CommentBody, user: dict = Depends(get_current_user)):
    if not body.content or not body.content.strip():
        raise HTTPException(400, "Comment cannot be empty")
    if len(body.content) > 4000:
        raise HTTPException(400, "Comment is too long (max 4000 chars)")
    post_id = _resolve_post_id(post_id_or_slug)
    if not post_id:
        raise HTTPException(404, "Post not found")
    uid = user.get("id") or user.get("sub")
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("blog_comments").insert({
        "post_id": post_id,
        "author_id": uid,
        "author_name": body.author_name or user.get("username", "Anonymous"),
        "content": body.content.strip(),
        "created_at": now,
    }).execute()
    schedule_scan(body.content.strip())
    row = res.data[0]
    return {
        "_id": row["id"], "id": row["id"],
        "content": row["content"],
        "createdAt": row.get("created_at",""),
        "author": {"_id": uid, "username": row.get("author_name","Anonymous"), "avatar": user.get("avatar",""), "role": user.get("role","user")},
    }

@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(get_current_user)):
    cres = supabase.table("blog_comments").select("id,author_id").eq("id", comment_id).limit(1).execute()
    c = cres.data[0] if cres.data else None
    if not c:
        raise HTTPException(404, "Comment not found")
    uid = user.get("id") or user.get("sub")
    if c["author_id"] != uid and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(403, "Not your comment")
    supabase.table("blog_comments").delete().eq("id", comment_id).execute()
    return {"message": "Deleted"}

# ── Reactions (server-persisted) ────────────────────────────────────────────────
class ReactBody(BaseModel):
    emoji: str

@router.post("/{slug}/react")
async def react_post(slug: str, body: ReactBody, user: dict = Depends(get_current_user)):
    if not body.emoji or len(body.emoji) > 8:
        raise HTTPException(400, "Invalid emoji")
    res = supabase.table("posts").select("id,reactions").eq("slug", slug).limit(1).execute()
    post = res.data[0] if res.data else None
    if not post:
        raise HTTPException(404, "Post not found")
    uid = user.get("id") or user.get("sub")
    reactions = post.get("reactions") or {}
    users = reactions.get(body.emoji, [])
    if uid in users:
        users.remove(uid)
    else:
        users.append(uid)
    if not users:
        reactions.pop(body.emoji, None)
    else:
        reactions[body.emoji] = users
    supabase.table("posts").update({"reactions": reactions}).eq("id", post["id"]).execute()
    summary = {e: len(v) for e, v in reactions.items()}
    my_reactions = [e for e, v in reactions.items() if uid in v]
    return {"reactions": summary, "myReactions": my_reactions}

# ── Related posts (same category, newest first) ────────────────────────────────
@router.get("/{slug}/related")
async def related_posts(slug: str, limit: int = 3):
    res = supabase.table("posts").select("id,title,slug,excerpt,cover_image,category,created_at").eq("slug", slug).limit(1).execute()
    post = res.data[0] if res.data else None
    if not post:
        raise HTTPException(404, "Post not found")
    related = supabase.table("posts") \
        .select("id,title,slug,excerpt,cover_image,category,created_at,views") \
        .eq("category", post.get("category","")).eq("published", True).neq("id", post["id"]) \
        .order("created_at", desc=True).limit(limit).execute()
    rows = related.data or []
    if len(rows) < limit:
        extra = supabase.table("posts") \
            .select("id,title,slug,excerpt,cover_image,category,created_at,views") \
            .eq("published", True).neq("id", post["id"]).not_.in_("id", [r["id"] for r in rows] or ["00000000-0000-0000-0000-000000000000"]) \
            .order("created_at", desc=True).limit(limit - len(rows)).execute()
        rows = rows + (extra.data or [])
    return rows

# ── List posts (public: published only; staff: all) ────────────────────────────
@router.get("")
async def list_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(10, le=50),
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    all: bool = False,
    user: dict | None = Depends(_optional_user),
):
    if all and not _is_staff(user):
        raise HTTPException(403, "Only staff may list unpublished posts")

    q = supabase.table("posts").select(
        "id,title,slug,excerpt,cover_image,category,tags,published,views,created_at,author_name"
    )
    count_q = supabase.table("posts").select("id", count="exact")

    if not all:
        q = q.eq("published", True)
        count_q = count_q.eq("published", True)   # FIX #6: apply same filter to count

    if category:
        q = q.eq("category", category)
        count_q = count_q.eq("category", category)

    if search:
        q = q.ilike("title", f"%{search}%")
        count_q = count_q.ilike("title", f"%{search}%")

    offset = (page - 1) * limit
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    posts = res.data or []

    if tag:
        posts = [p for p in posts if tag in (p.get("tags") or [])]

    count_res = count_q.execute()
    return {"posts": posts, "total": count_res.count or 0, "page": page, "limit": limit}

# ── Get post by slug ── AFTER specific routes ───────────────────────────────────
@router.get("/{slug}")
async def get_post(slug: str, user: dict | None = Depends(_optional_user)):
    res = supabase.table("posts").select("*").eq("slug", slug).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Post not found")
    post = res.data[0]
    if not post.get("published") and not _is_staff(user):
        raise HTTPException(404, "Post not found")
    return post

# ── Increment views ─────────────────────────────────────────────────────────────
@router.post("/{slug}/view")
async def increment_views(slug: str):
    res = supabase.table("posts").select("id,views").eq("slug", slug).limit(1).execute()
    post = res.data[0] if res.data else None
    if not post:
        raise HTTPException(404, "Post not found")
    supabase.table("posts").update({"views": (post.get("views") or 0) + 1}).eq("id", post["id"]).execute()
    return {"views": (post.get("views") or 0) + 1}

# ── Create post (staff only) ────────────────────────────────────────────────────
@router.post("")
async def create_post(body: PostBody, user: dict = Depends(require_staff)):
    existing = supabase.table("posts").select("id").eq("slug", body.slug).execute()
    if existing.data:
        raise HTTPException(409, "Slug already in use")
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("posts").insert({
        **body.model_dump(),
        "created_at": now, "updated_at": now,
    }).execute()
    schedule_scan(f"{body.title} {body.content}")
    return res.data[0]

# ── Update post ─────────────────────────────────────────────────────────────────
@router.put("/{post_id}")
async def update_post(post_id: str, body: PostBody, _: dict = Depends(require_staff)):
    updates = {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("posts").update(updates).eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(404, "Post not found")
    return res.data[0]

# ── Delete post ─────────────────────────────────────────────────────────────────
@router.delete("/{post_id}")
async def delete_post(post_id: str, _: dict = Depends(require_staff)):
    supabase.table("posts").delete().eq("id", post_id).execute()
    return {"message": "Post deleted"}
