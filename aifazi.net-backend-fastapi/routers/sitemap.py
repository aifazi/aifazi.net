"""routers/sitemap.py — XML sitemap generator"""
import os
from fastapi import APIRouter
from fastapi.responses import Response
from database import supabase
router = APIRouter()
SITE_URL = os.getenv("FRONTEND_URL", "https://aifazi.net")

@router.get("/sitemap.xml")
async def sitemap():
    if not supabase:
        raise HTTPException(503, "Database not configured")
    posts = supabase.table("posts").select("slug,updated_at").eq("published", True).limit(10000).execute().data or []
    threads = supabase.table("forum_threads").select("id,updated_at").limit(10000).execute().data or []
    urls = [f"<url><loc>{SITE_URL}/</loc><changefreq>weekly</changefreq></url>",
            f"<url><loc>{SITE_URL}/blog</loc><changefreq>daily</changefreq></url>",
            f"<url><loc>{SITE_URL}/forum</loc><changefreq>hourly</changefreq></url>",
            f"<url><loc>{SITE_URL}/contact</loc></url>",
            f"<url><loc>{SITE_URL}/helpdesk</loc></url>",]
    for p in posts:
        urls.append(f"<url><loc>{SITE_URL}/blog/{p['slug']}</loc><lastmod>{(p.get('updated_at') or '')[:10]}</lastmod></url>")
    for t in threads:
        urls.append(f"<url><loc>{SITE_URL}/forum/thread/{t['id']}</loc></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls)
    xml += "\n</urlset>"
    return Response(content=xml, media_type="application/xml")
