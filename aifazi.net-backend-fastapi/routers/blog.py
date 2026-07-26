"""
routers/blog.py — Blog posts CRUD
FIX #2: Moved /meta/categories and /admin/all ABOVE /{slug} wildcard.
FIX #6: Pagination count now respects published filter.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff, get_current_user
from datetime import datetime, timezone

router = APIRouter()

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

# ── List posts (public: published only; staff: all) ────────────────────────────
@router.get("")
async def list_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(10, le=50),
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    all: bool = False,
):
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
async def get_post(slug: str):
    res = supabase.table("posts").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(404, "Post not found")
    return res.data

# ── Increment views ─────────────────────────────────────────────────────────────
@router.post("/{slug}/view")
async def increment_views(slug: str):
    res = supabase.table("posts").select("id,views").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(404, "Post not found")
    post = res.data
    supabase.table("posts").update({"views": post["views"] + 1}).eq("id", post["id"]).execute()
    return {"views": post["views"] + 1}

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
