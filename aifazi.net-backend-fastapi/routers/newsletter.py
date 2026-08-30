"""routers/newsletter.py
Frontend NewsletterPanel calls:
  GET    /newsletter/subscribers     → list subscribers
  DELETE /newsletter/unsubscribe     { email }  → remove
  POST   /newsletter/subscribe       { email }
  POST   /newsletter/confirm         { token }  → confirm subscription
  POST   /newsletter/unsubscribe     { email }  (legacy)
  POST   /newsletter/send            { subject, html, text }
"""
import asyncio
import hashlib
import hmac
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr

from database import supabase
from dependencies import require_staff
from utils.email import render_template
from utils.email_queue import queue_email_bulk

router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
_SUBSCRIBE_SECRET = os.getenv("NEWSLETTER_SECRET", os.getenv("HMAC_SECRET", "dev-newsletter-secret"))


def _make_confirm_token(email: str) -> str:
    """HMAC-signed token so only our server can generate valid confirm links."""
    return hmac.new(_SUBSCRIBE_SECRET.encode(), email.lower().encode(), hashlib.sha256).hexdigest()


class SubBody(BaseModel):
    email: EmailStr

class ConfirmBody(BaseModel):
    token: str
    email: EmailStr

class CampaignBody(BaseModel):
    subject: str; html: str; text: str = ""

@router.post("/subscribe")
async def subscribe(body: SubBody):
    existing = supabase.table("newsletter_subs").select("id,status").eq("email", body.email).execute()
    if existing.data:
        if existing.data[0]["status"] == "active":
            return {"message": "Already subscribed"}
        if existing.data[0]["status"] == "pending":
            return {"message": "Confirmation email sent. Check your inbox."}
        supabase.table("newsletter_subs").update({"status": "pending"}).eq("email", body.email).execute()
    else:
        supabase.table("newsletter_subs").insert({"email": body.email, "status": "pending"}).execute()

    # Send double opt-in confirmation email
    token = _make_confirm_token(body.email)
    confirm_url = f"{FRONTEND_URL}/newsletter/confirm?token={token}&email={body.email}"
    try:
        subject, html = render_template("newsletter_confirm", {
            "site_name": "aifazi.net",
            "confirm_url": confirm_url,
        })
        from utils.email_queue import queue_email
        queue_email(body.email, subject or "Confirm your subscription", html or f"<p>Click to confirm: <a href='{confirm_url}'>Confirm</a></p>", "newsletter_confirm")
    except Exception:
        pass  # Don't leak whether email sending failed
    return {"message": "Confirmation email sent. Check your inbox."}


@router.post("/confirm")
async def confirm(body: ConfirmBody):
    expected = _make_confirm_token(body.email)
    if not hmac.compare_digest(body.token, expected):
        raise HTTPException(400, "Invalid or expired confirmation token")
    supabase.table("newsletter_subs").update({"status": "active"}).eq("email", body.email).execute()
    return {"message": "Subscription confirmed"}

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
            "unsubscribe_link": f"{FRONTEND_URL}/newsletter/unsubscribe",
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
        post_url = f"{FRONTEND_URL}/blog/{post['slug']}"
        subject, html = render_template("newsletter_post", {
            "site_name": "aifazi.net",
            "post_title": post["title"],
            "excerpt": post.get("excerpt", ""),
            "post_url": post_url,
            "unsubscribe_link": f"{FRONTEND_URL}/newsletter/unsubscribe",
        })
        fallback = f"<h2>{post['title']}</h2><p>{post.get('excerpt','')}</p><a href='{post_url}'>Read more</a>"
        _queue_to_active(
            subject or f"New post: {post['title']}",
            html or fallback,
            "",
            "newsletter_post",
        )
    await asyncio.to_thread(_work)
