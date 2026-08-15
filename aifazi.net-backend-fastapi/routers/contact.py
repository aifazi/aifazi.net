"""routers/contact.py"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from database import supabase
from dependencies import require_staff
from utils.email import _esc, render_template
from utils.email_queue import queue_email

router = APIRouter()

class ContactBody(BaseModel):
    name: str; email: EmailStr; subject: str = ""; message: str

class ReplyBody(BaseModel):
    # Accept both 'reply' (legacy) and 'body' (frontend sends this)
    reply: str = ""
    body:  str = ""
    subject: str = ""

    def get_body(self) -> str:
        return self.reply or self.body

def _html(text: str) -> str:
    """Convert plain-text with newlines to HTML paragraphs (escaped)."""
    paras = [p.strip() for p in text.split('\n') if p.strip()]
    return "".join(f"<p style='margin:0 0 12px;line-height:1.7;'>{_esc(p)}</p>" for p in paras)

@router.post("")
async def submit(body: ContactBody):
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("contacts").insert({
        "name": body.name, "email": body.email,
        "subject": body.subject, "message": body.message, "created_at": now,
    }).execute()
    subject, html = render_template("contact_confirm", {
        "site_name": "aifazi.net",
        "name": body.name,
        "subject": body.subject or "Your message",
        "message": body.message,
    })
    await queue_email(body.email,
                      subject or f"Re: {body.subject or 'Your message'}",
                      html or f"<p>Thanks {_esc(body.name)}, we received your message and will get back to you shortly.</p>",
                      purpose="contact_confirm")
    from utils.admin_notify import notify_admin
    notify_admin('📧', 'New Contact Message', f"{body.name or 'Someone'} — {body.subject or body.message[:60]}")
    return {"message": "Message sent", "id": res.data[0]["id"]}


@router.get("")
async def list_contacts(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), _: dict = Depends(require_staff)):
    res = supabase.table("contacts").select("*", count="exact").order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
    return {"items": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


@router.post("/{contact_id}/reply")
async def reply(contact_id: str, body: ReplyBody, _: dict = Depends(require_staff)):
    reply_text = body.get_body()
    if not reply_text:
        raise HTTPException(400, "Reply body is required")
    # Use .limit(1) instead of .single() — avoids APIError when 0 rows found
    res = supabase.table("contacts").select("*").eq("id", contact_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Contact not found")
    c = res.data[0]
    now = datetime.now(timezone.utc).isoformat()
    subject = body.subject or f"Re: {c.get('subject') or 'Your message'}"
    supabase.table("contacts").update({"replied": True, "replied_at": now}).eq("id", contact_id).execute()
    tpl_subject, tpl_html = render_template("contact_reply", {
        "site_name": "aifazi.net",
        "name": c.get("name") or "there",
        "reply_message": reply_text,
        "original_message": c.get("message") or "",
    })
    await queue_email(c["email"], tpl_subject or subject, tpl_html or _html(reply_text), purpose="contact_reply")
    return {"message": "Reply sent"}

@router.delete("/{contact_id}")
async def delete_contact(contact_id: str, _: dict = Depends(require_staff)):
    supabase.table("contacts").delete().eq("id", contact_id).execute()
    return {"message": "Deleted"}
