"""routers/sitemap.py — XML sitemap generator + robots.txt.

Cleanup-3: added the missing HTTPException import (the never-triggered DB-not-
configured branch previously crashed with `NameError` instead of returning 503),
and added a /robots.txt handler so the route isn't a silent 404 (the frontend
overrides this for `app.aifazi.net` host via app/robots.ts, but the backend
still serves it for direct api.aifazi.net visits and the sitemap.py router is
already mounted at root prefix in main.py).
"""
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from database import supabase
router = APIRouter()
SITE_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")

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

@router.get("/robots.txt")
async def robots():
    """Crawler directives. The frontend's app/robots.ts already emits rules for
    the host of web visits; this backend-side handler covers direct api.aifazi.net
    visits (which the SecurityMiddleware keeps adding an `X-Robots-Tag: noindex`
    header to via vercel.json, so we double-up with the in-body directive)."""
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        f"Sitemap: {SITE_URL}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain")
