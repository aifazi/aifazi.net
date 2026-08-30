"""routers/search.py — Full-text search across posts, forum threads, store products"""
from fastapi import APIRouter, Query

from database import safe_search_term, supabase

router = APIRouter()

@router.get("")
async def search(q: str = Query(..., min_length=1)):
    term = f"%{safe_search_term(q)}%"
    posts = supabase.table("posts").select("id,title,slug,excerpt,category,created_at").eq("published",True).ilike("title", term).limit(5).execute().data or []
    threads = supabase.table("forum_threads").select("id,title,category_id,author_name,created_at").ilike("title", term).limit(5).execute().data or []
    products = supabase.table("store_products").select("id,name,slug,price,created_at").eq("active",True).ilike("name", term).limit(5).execute().data or []
    for p in posts:
        p["type"] = "post"; p["url"] = f"/blog/{p['slug']}"
    for t in threads:
        t["type"] = "thread"; t["url"] = f"/forum/thread/{t['id']}"
    for pr in products:
        pr["type"] = "product"; pr["url"] = f"/store/{pr['slug']}"
    return {"results": posts + threads + products, "query": q}
