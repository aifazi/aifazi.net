"""routers/newsletter.py
Frontend NewsletterPanel calls:
  GET    /newsletter/subscribers     → list subscribers
  DELETE /newsletter/unsubscribe     { email }  → remove
  POST   /newsletter/subscribe       { email }
  POST   /newsletter/unsubscribe     { email }  (legacy)
  POST   /newsletter/send            { subject, html, text }
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from database import supabase
from dependencies import require_staff
from utils.email import render_template
from utils.email_queue import queue_email_bulk
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
async def list_subs_admin(_: dict = Depends(require_staff)):
    res = supabase.table("newsletter_subs").select("*").order("created_at", desc=True).limit(1000).execute()
    return res.data or []

# Public endpoint alias
@router.get("")
async def list_subs_public(_: dict = Depends(require_staff)):
    res = supabase.table("newsletter_subs").select("*").order("created_at", desc=True).limit(1000).execute()
    return res.data or []

@router.post("/send")
async def send_campaign(body: CampaignBody, _: dict = Depends(require_staff)):
    res = supabase.table("newsletter_subs").select("email").eq("status", "active").limit(5000).execute()
    emails = [r["email"] for r in (res.data or [])]
    for email in emails:
        subject, html = render_template("newsletter_broadcast", {
            "site_name": "aifazi.net",
            "subject": body.subject,
            "body": body.html,
            "unsubscribe_link": "https://aifazi.net/newsletter/unsubscribe",
        })
        queue_email_bulk(email, subject or body.subject, html or body.html, body.text, "newsletter_broadcast")
    return {"message": f"Queued {len(emails)} newsletter emails (delivered via next process-pending run)"}

async def send_newsletter_for_post(post: dict):
    """Called by scheduler when a post is auto-published."""
    res = supabase.table("newsletter_subs").select("email").eq("status", "active").limit(5000).execute()
    for sub in (res.data or []):
        post_url = f"https://aifazi.net/blog/{post['slug']}"
        subject, html = render_template("newsletter_post", {
            "site_name": "aifazi.net",
            "post_title": post["title"],
            "excerpt": post.get("excerpt", ""),
            "post_url": post_url,
            "unsubscribe_link": "https://aifazi.net/newsletter/unsubscribe",
        })
        queue_email_bulk(
            sub["email"],
            subject or f"New post: {post['title']}",
            html or f"<h2>{post['title']}</h2><p>{post.get('excerpt','')}</p><a href='{post_url}'>Read more</a>",
            "",
            "newsletter_post",
        )
