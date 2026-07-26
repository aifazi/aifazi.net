"""routers/search.py — Full-text search across posts, forum threads"""
from fastapi import APIRouter, Query
from database import supabase
router = APIRouter()

@router.get("")
async def search(q: str = Query(..., min_length=1)):
    term = f"%{q}%"
    posts = supabase.table("posts").select("id,title,slug,excerpt,category,created_at").eq("published",True).ilike("title", term).limit(5).execute().data or []
    threads = supabase.table("forum_threads").select("id,title,category_id,author_name,created_at").ilike("title", term).limit(5).execute().data or []
    for p in posts:
        p["type"] = "post"; p["url"] = f"/blog/{p['slug']}"
    for t in threads:
        t["type"] = "thread"; t["url"] = f"/forum/thread/{t['id']}"
    return {"results": posts + threads, "query": q}
