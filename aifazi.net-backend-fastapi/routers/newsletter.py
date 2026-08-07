"""routers/newsletter.py
Frontend NewsletterPanel calls:
  GET    /newsletter/subscribers     → list subscribers
  DELETE /newsletter/unsubscribe     { email }  → remove
  POST   /newsletter/subscribe       { email }
  POST   /newsletter/unsubscribe     { email }  (legacy)
  POST   /newsletter/send            { subject, html, text }
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr
from database import supabase
from dependencies import require_staff
from utils.email import render_template
from utils.email_queue import queue_email_bulk
import asyncio
router = APIRouter()

class SubBody(BaseModel):
    email: EmailStr

class CampaignBody(BaseModel):
    subject: str; html: str; text: str = ""

@router.post("/subscribe")
async def subscribe(body: SubBody):
    existing = supabase.table("newsletter_subs").select("id,status").eq("email", body.email).execute()
    if existing.data:
        if existing.data[0]["status"] == "active":
            return {"message": "Already subscribed"}
        supabase.table("newsletter_subs").update({"status": "active"}).eq("email", body.email).execute()
        return {"message": "Resubscribed"}
    supabase.table("newsletter_subs").insert({"email": body.email}).execute()
    return {"message": "Subscribed"}

@router.post("/unsubscribe")
async def unsubscribe_post(body: SubBody):
    supabase.table("newsletter_subs").update({"status": "unsubscribed"}).eq("email", body.email).execute()
    return {"message": "Unsubscribed"}

@router.delete("/unsubscribe")
async def unsubscribe_delete(request: Request, _: dict = Depends(require_staff)):
    body = await request.json()
    email = body.get("email", "")
    if not email:
        raise HTTPException(400, "Email required")
    supabase.table("newsletter_subs").delete().eq("email", email).execute()
    return {"message": "Removed"}

# Frontend calls /newsletter/subscribers (admin list)
@router.get("/subscribers")
async def list_subs_admin(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), _: dict = Depends(require_staff)):
    res = supabase.table("newsletter_subs").select("*", count="exact").order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
    return {"items": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}

# Public endpoint alias
@router.get("")
async def list_subs_public(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), _: dict = Depends(require_staff)):
    res = supabase.table("newsletter_subs").select("*", count="exact").order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
    return {"items": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}

@router.post("/send")
async def send_campaign(body: CampaignBody, _: dict = Depends(require_staff)):
    # Render the template ONCE (it doesn't vary per recipient), then run the
    # insert-only fan-out in a worker thread so a large list never blocks the
    # event loop (previously: render + DB insert per subscriber, synchronously).
    def _render():
        subject, html = render_template("newsletter_broadcast", {
            "site_name": "aifazi.net",
            "subject": body.subject,
            "body": body.html,
            "unsubscribe_link": "https://aifazi.net/newsletter/unsubscribe",
        })
        return subject or body.subject, html or body.html
    subject, html = await asyncio.to_thread(_render)
    count = await asyncio.to_thread(_queue_to_active, subject, html, body.text, "newsletter_broadcast")
    return {"message": f"Queued {count} newsletter emails (delivered via next process-pending run)"}


def _queue_to_active(subject: str, html: str, text: str = "", purpose: str = "newsletter_broadcast", limit: int = 5000) -> int:
    """Sync fan-out to every active subscriber via the insert-only mail queue.
    Call from asyncio.to_thread — thousands of inserts must not run on the event
    loop. Returns the number queued."""
    res = supabase.table("newsletter_subs").select("email").eq("status", "active").limit(limit).execute()
    emails = [r["email"] for r in (res.data or [])]
    for email in emails:
        queue_email_bulk(email, subject, html, text, purpose)
    return len(emails)


async def send_newsletter_for_post(post: dict):
    """Called by scheduler when a post is auto-published. Runs the whole fan-out
    off the event loop (template render + thousands of queue inserts)."""
    def _work():
        post_url = f"https://aifazi.net/blog/{post['slug']}"
        subject, html = render_template("newsletter_post", {
            "site_name": "aifazi.net",
            "post_title": post["title"],
            "excerpt": post.get("excerpt", ""),
            "post_url": post_url,
            "unsubscribe_link": "https://aifazi.net/newsletter/unsubscribe",
        })
        fallback = f"<h2>{post['title']}</h2><p>{post.get('excerpt','')}</p><a href='{post_url}'>Read more</a>"
        _queue_to_active(
            subject or f"New post: {post['title']}",
            html or fallback,
            "",
            "newsletter_post",
        )
    await asyncio.to_thread(_work)
