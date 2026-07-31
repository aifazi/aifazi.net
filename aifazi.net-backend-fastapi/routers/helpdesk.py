"""
routers/helpdesk.py — Ticket CRUD + threaded messages + admin settings
"""
import secrets, string
from datetime import datetime, timezone, timedelta
from html import escape as _html_escape
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from database import supabase
from dependencies import bearer, decode_token, require_staff
from utils.email import send_email, render_template
from utils.email_queue import queue_email

router = APIRouter()

SITE_URL = __import__('os').environ.get("FRONTEND_URL", "https://aifazi.net").rstrip("/")

def _esc(s: str) -> str:
    """HTML-escape user-controlled strings to prevent email HTML injection."""
    return _html_escape(str(s or ""), quote=True)


def _email_layout(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>body{{margin:0;padding:0;background:#f1f5f9;font-family:'Courier New',monospace;}}
    .card{{max-width:520px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;}}
    .hdr{{background:#f8fafc;padding:24px 32px;border-bottom:1px solid #e2e8f0;}}
    .logo{{font-size:11px;letter-spacing:4px;color:#16a34a;font-weight:700;}}
    .bdy{{padding:36px 32px;color:#1e293b;}}
    .ftr{{padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8;letter-spacing:2px;}}
    </style></head><body>
    <div class="card"><div class="hdr"><span class="logo">AIFAZI.NET</span></div>
    <div class="bdy">{body_html}</div>
    <div class="ftr">IF YOU DIDN'T REQUEST THIS, IGNORE THIS EMAIL</div>
    </div></body></html>"""


def _new_account_email_html(username: str, password: str, login_url: str) -> str:
    body = f"""
    <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;">Your aifazi.net account</h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">
      A support ticket was submitted with your email. We've automatically created an account
      so you can track your tickets and get updates.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#64748b;font-size:11px;letter-spacing:2px;">USERNAME</td>
           <td style="padding:8px 0;font-weight:700;">{_esc(username)}</td></tr>
    </table>
    <a href="{_esc(login_url)}" style="display:inline-block;background:#00ff88;color:#000;font-size:12px;
       font-weight:700;letter-spacing:3px;padding:14px 32px;text-decoration:none;">
      SET YOUR PASSWORD &amp; LOGIN →
    </a>
    <p style="color:#94a3b8;font-size:11px;margin:20px 0 0;">Click the button above to set your password and log in. This link expires in 24 hours.</p>"""
    return _email_layout("Your aifazi.net account", body)


def _new_account_verification_html(username: str, verify_url: str, forgot_url: str) -> str:
    """C7 — replacement for `_new_account_email_html` that doesn't ship a plaintext password.
    Account is created with `email_verified=False` plus a 24h verify_token; the user must
    complete email verification AND set a password via the forgot-password flow."""
    body = f"""
    <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;">Your aifazi.net account</h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">
      A support ticket was submitted with your email. We've created an account
      for you so you can track your tickets and receive updates.
    </p>
    <p style="color:#475569;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Two quick steps to finish setting up:
    </p>
    <ol>
      <li style="margin-bottom:10px;">
        <strong>Verify your email:</strong>
        <a href="{_esc(verify_url)}" style="display:inline-block;background:#00ff88;color:#000;font-size:12px;
           font-weight:700;letter-spacing:3px;padding:10px 22px;text-decoration:none;margin-left:6px;">
          VERIFY →
        </a>
        <span style="font-size:11px;color:#94a3b8;">(expires in 24 hours)</span>
      </li>
      <li style="margin-bottom:10px;">
        <strong>Set a password:</strong> visit the
        <a href="{_esc(forgot_url)}" style="color:#2563eb;text-decoration:underline;">forgot password</a>
        page and request a reset link — it will be sent to this inbox.
      </li>
    </ol>
    <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin-top:24px;">
      Your username: <strong style="color:#1e293b;font-family:'Courier New',monospace;">{_esc(username)}</strong>
    </p>"""
    return _email_layout("Verify your aifazi.net account", body)


def _ticket_confirmation_html(
    name: str, ticket_id: str, subject: str,
    category: str, priority: str, description: str, track_url: str,
    settings: dict | None = None,
) -> str:
    config = settings or {}
    priorities = {p["value"]: p for p in (config.get("priorities") or [])}
    p_info = priorities.get(priority, {})
    pcolour = p_info.get("color", "#94a3b8")
    eta = p_info.get("eta", "as soon as possible")
    desc_preview = (description[:200] + "...") if len(description) > 200 else description
    body = f"""
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#0f172a;">
      We've received your ticket
    </h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      Hi <strong>{_esc(name)}</strong>, your support request has been logged and our team
      will get back to you <strong>{eta}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:10px;letter-spacing:2px;font-family:'Courier New',monospace;width:110px;">TICKET ID</td>
          <td style="padding:6px 0;font-family:'Courier New',monospace;font-weight:700;color:#0f172a;">{_esc(ticket_id)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:10px;letter-spacing:2px;font-family:'Courier New',monospace;">SUBJECT</td>
          <td style="padding:6px 0;font-weight:600;color:#0f172a;">{_esc(subject)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:10px;letter-spacing:2px;font-family:'Courier New',monospace;">CATEGORY</td>
          <td style="padding:6px 0;color:#0f172a;text-transform:capitalize;">{_esc(category)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:10px;letter-spacing:2px;font-family:'Courier New',monospace;">PRIORITY</td>
          <td style="padding:6px 0;">
            <span style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;padding:3px 10px;background:{pcolour}18;border:1px solid {pcolour}55;color:{pcolour};border-radius:4px;">{_esc(priority.upper())}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:10px;letter-spacing:2px;font-family:'Courier New',monospace;vertical-align:top;">YOUR MESSAGE</td>
          <td style="padding:6px 0;color:#475569;font-size:13px;line-height:1.6;">{_esc(desc_preview)}</td>
        </tr>
      </table>
    </div>
    <a href="{_esc(track_url)}" style="display:inline-block;background:#0f172a;color:#fff;font-size:11px;font-weight:700;letter-spacing:3px;padding:14px 28px;text-decoration:none;border-radius:4px;font-family:'Courier New',monospace;">
      TRACK YOUR TICKET →
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.7;">
      You'll receive another email when a staff member responds.<br/>
      Reply to this email or use the link above to check your ticket status at any time.
    </p>"""
    return _email_layout(f"Ticket #{ticket_id} received", body)


def _ticket_confirmation_text(name: str, ticket_id: str, subject: str, priority: str, track_url: str) -> str:
    return (
        f"Hi {name},\n\n"
        f"Your support ticket has been received.\n\n"
        f"Ticket ID : #{ticket_id}\n"
        f"Subject   : {subject}\n"
        f"Priority  : {priority.upper()}\n\n"
        f"Track your ticket: {track_url}\n\n"
        f"You'll be notified by email when a staff member responds.\n\n"
        f"-- aifazi.net support"
    )


def _new_reply_email_html(ticket_id: str, subject: str, author_name: str, message: str, track_url: str) -> str:
    body = f"""
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#0f172a;">New reply on your ticket</h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      <strong>{_esc(author_name)}</strong> has replied to ticket <strong>#{_esc(ticket_id)}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:10px;color:#64748b;letter-spacing:2px;margin-bottom:8px;">SUBJECT: {_esc(subject)}</div>
      <div style="color:#1e293b;font-size:14px;line-height:1.7;white-space:pre-wrap;">{_esc(message)}</div>
    </div>
    <a href="{_esc(track_url)}" style="display:inline-block;background:#0f172a;color:#fff;font-size:11px;font-weight:700;letter-spacing:3px;padding:14px 28px;text-decoration:none;border-radius:4px;">
      VIEW TICKET →
    </a>"""
    return _email_layout(f"Reply on #{ticket_id}", body)


# ── Models ──────────────────────────────────────────────────

class TicketBody(BaseModel):
    name: str
    email: EmailStr
    subject: str
    description: str
    category: str = "general"
    priority: str = "medium"
    user_id: str | None = None


class MessageBody(BaseModel):
    message: str
    author_type: str = "user"
    author_name: str | None = None


class AdminUpdateBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    response: Optional[str] = None
    responded_by: Optional[str] = None
    internal_note: Optional[str] = None
    message: Optional[str] = None


class SettingsBody(BaseModel):
    config: dict


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


def _priority_value(value: str | None) -> str | None:
    if not value:
        return None
    mapping = {
        "p1": "critical", "critical": "critical",
        "p2": "high", "high": "high",
        "p3": "medium", "medium": "medium",
        "p4": "low", "low": "low",
    }
    return mapping.get(str(value).strip().lower())


def _user_owns_ticket(ticket: dict, user: dict | None) -> bool:
    """HIGH audit fix — ownership was conjunctive (`user_id AND ticket_email`), so once a
    user legally changed their email, the email column on old tickets stopped matching
    and they could no longer view their own past tickets. Prefer user_id match (stable
    across email changes); fall back to email only when user_id is missing.
    """
    if not user:
        return False
    user_id      = str(user.get("id") or "")
    user_email   = (user.get("email") or "").strip().lower()
    ticket_user_id = str(ticket.get("user_id") or "")
    ticket_email   = (ticket.get("email") or "").strip().lower()
    if ticket_user_id and user_id:
        return ticket_user_id == user_id
    if ticket_email and user_email:
        return ticket_email == user_email
    return False


def _ticket_email_matches(ticket: dict, email: str | None) -> bool:
    if not email:
        return False
    return (ticket.get("email") or "").strip().lower() == email.strip().lower()


def _gen_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _sanitize_username(name: str) -> str:
    import re
    slug = re.sub(r'[^a-zA-Z0-9_]', '_', name.strip().lower())[:30] or "user"
    base = slug
    for _ in range(5):
        res = supabase.table("users").select("id").eq("username", slug).execute()
        if not res.data:
            return slug
        slug = base[:25] + secrets.token_hex(2)
    return base + secrets.token_hex(3)


async def _auto_create_forum_account(name: str, email: str) -> str | None:
    """C7 — auto-create an account for a guest helpdesk ticket submission.

    Previous behaviour:
      * `email_verified=True` granted upfront — an attacker could submit a ticket with
        the victim's email and get a verified `victim@example.com` account on the
        site, with the random plaintext password emailed to the victim's inbox. They
        could intercept / shared mailbox before the victim ever registered.

    New behaviour:
      * `email_verified=False` with a 24h verify token.
      * No password set (password_hash="") and NO plaintext password emailed anywhere.
      * User must (1) click the verify link and (2) complete forgot-password flow to
        set a password — both gated to their inbox.
    """
    existing = supabase.table("users").select("id").eq("email", email).execute()
    if existing.data:
        return existing.data[0]["id"]
    username = _sanitize_username(name)
    now = datetime.now(timezone.utc).isoformat()
    verify_token = secrets.token_urlsafe(32)
    verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    try:
        res = supabase.table("users").insert({
            "username": username, "email": email, "password_hash": "",
            "email_verified": False, "role": "member",
            "verify_token": verify_token, "verify_expires": verify_expires,
            "created_at": now, "last_seen": now,
        }).execute()
        new_id = res.data[0]["id"] if res.data else None
    except Exception:
        return None

    verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
    forgot_url = f"{SITE_URL}/forum/forgot-password"
    subject, html = render_template("helpdesk_account_created", {
        "site_name":   "aifazi.net",
        "username":    username,
        "verify_url":  verify_url,
        "login_url":   forgot_url,
    })
    fallback_html = _new_account_verification_html(username, verify_url, forgot_url)
    fallback_text = (
        f"Hi {username},\n\n"
        f"A support ticket at aifazi.net was submitted with your email. We've created an\n"
        f"account so you can track the ticket and receive replies.\n\n"
        f"1) Verify your email:  {verify_url}\n"
        f"2) Set a password:     {forgot_url}\n\n"
        f"Your username: {username}\n\n"
        f"— aifazi.net support"
    )
    queue_email(
        email,
        subject or "Verify your aifazi.net account",
        html or fallback_html,
        fallback_text,
        "helpdesk_account_created",
        username,
    )
    return new_id


def _get_settings() -> dict:
    res = supabase.table("helpdesk_settings").select("config").eq("id", "default").limit(1).execute()
    if res.data:
        return res.data[0].get("config", {})
    return {}


# ── Public: submit ticket ──────────────────────────────────
@router.post("/tickets")
async def submit_ticket(body: TicketBody, user: dict | None = Depends(_optional_user)):
    now = datetime.now(timezone.utc).isoformat()
    linked_user_id = user.get("id") if user else None
    if user and user.get("email"):
        body.email = user["email"]
    if user and user.get("username"):
        body.name = user["username"]
    account_created = False
    if not linked_user_id:
        linked_user_id = await _auto_create_forum_account(body.name, body.email)
        account_created = True

    settings = _get_settings()
    default_cat = settings.get("default_category", "general")
    default_pri = settings.get("default_priority", "medium")

    base_payload = {
        "name":         body.name,
        "email":        body.email,
        "subject":      body.subject,
        "description":  body.description,
        "category":     body.category or default_cat,
        "priority":     _priority_value(body.priority) or default_pri,
        "status":       "open",
        "message_count": 1,
        "created_at":   now,
        "updated_at":   now,
    }

    res = None
    for include_user_id in (True, False):
        payload = {**base_payload}
        if include_user_id:
            payload["user_id"] = linked_user_id
        try:
            res = supabase.table("helpdesk_tickets").insert(payload).execute()
            break
        except Exception as exc:
            err = str(exc)
            if include_user_id and ("PGRST204" in err or "user_id" in err):
                continue
            raise HTTPException(500, f"Failed to create ticket: {err}")

    if not res or not res.data:
        raise HTTPException(500, "Failed to create ticket")

    ticket = res.data[0]
    ticket_id = ticket.get("id", "")
    tid = ticket.get("ticket_id") or ticket_id
    track_url = f"{SITE_URL}/helpdesk"

    # Create first message in the thread
    try:
        supabase.table("helpdesk_messages").insert({
            "ticket_id":   ticket_id,
            "author_type": "user",
            "author_name": body.name,
            "author_id":   linked_user_id,
            "message":     body.description,
            "created_at":  now,
        }).execute()
    except Exception:
        pass

    # Auto-respond if enabled
    auto_msg = settings.get("auto_respond_message", "")
    if settings.get("auto_respond_enabled", True) and auto_msg:
        try:
            supabase.table("helpdesk_messages").insert({
                "ticket_id":   ticket_id,
                "author_type": "system",
                "author_name": "System",
                "message":     auto_msg,
                "created_at":  (datetime.now(timezone.utc)).isoformat(),
            }).execute()
            supabase.table("helpdesk_tickets").update({"message_count": 2}).eq("id", ticket_id).execute()
        except Exception:
            pass

    # Send confirmation email
    tpl_subject, tpl_html = render_template("ticket_confirmation", {
        "site_name":   "aifazi.net",
        "name":        body.name,
        "ticket_id":   tid,
        "subject":     body.subject,
        "category":    body.category,
        "priority":    body.priority,
        "description": body.description,
        "track_url":   track_url,
    })
    conf_subject = tpl_subject or f"[aifazi.net] Ticket #{tid} received -- {body.subject}"
    conf_html = tpl_html or _ticket_confirmation_html(
        body.name, tid, body.subject, body.category, body.priority,
        body.description, track_url, settings,
    )
    conf_text = _ticket_confirmation_text(body.name, tid, body.subject, body.priority, track_url)
    queue_email(body.email, conf_subject, conf_html, conf_text, "ticket_confirmation")

    return {
        "message":         "Ticket submitted",
        "ticket_id":       tid,
        "id":              ticket_id,
        "account_created": account_created,
    }


# ── Public: look up tickets by email ───────────────────────
@router.get("/tickets/lookup")
async def lookup_tickets(
    email: str = Query(...),
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    user: dict = Depends(_optional_user),
):
    if not user:
        raise HTTPException(401, "Authentication required")
    user_email = (user.get("email") or "").strip().lower()
    if not user_email or user_email != email.strip().lower():
        raise HTTPException(403, "You can only look up your own tickets")
    pri = _priority_value(priority)
    res = supabase.table("helpdesk_tickets").select(
        "id,ticket_id,subject,status,priority,category,created_at,updated_at,response,responded_at,message_count,user_id,email"
    ).eq("email", user_email)
    if status and status != "all":
        res = res.eq("status", status)
    if pri:
        res = res.eq("priority", pri)
    if category and category != "all":
        res = res.eq("category", category)
    res = res.order("created_at", desc=True).limit(50).execute()
    tickets = [t for t in (res.data or []) if _user_owns_ticket(t, user)]
    for ticket in tickets:
        ticket.pop("email", None)
        ticket.pop("user_id", None)
    return tickets


@router.get("/tickets/mine")
async def my_tickets(
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    user: dict = Depends(_optional_user),
):
    if not user:
        raise HTTPException(401, "Authentication required")
    user_id = user.get("id")
    email = (user.get("email") or "").strip()
    if not user_id and not email:
        return []

    select_cols = "id,ticket_id,subject,status,priority,category,created_at,updated_at,response,responded_at,message_count,user_id,email"
    pri = _priority_value(priority)

    def apply_filters(query):
        if status and status != "all":
            query = query.eq("status", status)
        if pri:
            query = query.eq("priority", pri)
        if category and category != "all":
            query = query.eq("category", category)
        return query.order("created_at", desc=True).limit(100)

    seen: dict[str, dict] = {}
    if user_id:
        res = apply_filters(
            supabase.table("helpdesk_tickets").select(select_cols).eq("user_id", user_id)
        ).execute()
        for t in res.data or []:
            if t["id"] not in seen and _user_owns_ticket(t, user):
                seen[t["id"]] = t
    if email:
        res = apply_filters(
            supabase.table("helpdesk_tickets").select(select_cols).eq("email", email)
        ).execute()
        for t in res.data or []:
            if t["id"] not in seen and _user_owns_ticket(t, user):
                seen[t["id"]] = t

    tickets = sorted(
        seen.values(),
        key=lambda ticket: ticket.get("created_at") or "",
        reverse=True,
    )[:100]
    for ticket in tickets:
        ticket.pop("email", None)
        ticket.pop("user_id", None)
    return tickets


# ── Public: get ticket detail with messages ────────────────
@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, user: dict | None = Depends(_optional_user)):
    if not user:
        raise HTTPException(401, "Authentication required")
    res = supabase.table("helpdesk_tickets").select(
        "id,ticket_id,subject,status,priority,category,name,email,user_id,description,created_at,updated_at,response,responded_at,responded_by,message_count,resolved_at,closed_at"
    ).eq("id", ticket_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Ticket not found")
    ticket = res.data[0]
    if not _user_owns_ticket(ticket, user):
        raise HTTPException(403, "You can only view your own tickets")
    msgs = supabase.table("helpdesk_messages").select(
        "id,author_type,author_name,message,created_at"
    ).eq("ticket_id", ticket_id).order("created_at").execute()
    ticket["messages"] = msgs.data or []
    ticket.pop("email", None)
    ticket.pop("user_id", None)
    return ticket


# ── Public: add message to ticket ──────────────────────────
@router.post("/tickets/{ticket_id}/messages")
async def add_message(ticket_id: str, body: MessageBody, user: dict | None = Depends(_optional_user)):
    if not user:
        raise HTTPException(401, "Authentication required")
    ticket_res = supabase.table("helpdesk_tickets").select("id,email,user_id,name,status").eq("id", ticket_id).limit(1).execute()
    if not ticket_res.data:
        raise HTTPException(404, "Ticket not found")
    ticket = ticket_res.data[0]
    if not _user_owns_ticket(ticket, user):
        raise HTTPException(403, "You can only reply to your own tickets")
    if ticket.get("status") in ("resolved", "closed"):
        raise HTTPException(400, "Cannot reply to a resolved or closed ticket")

    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "ticket_id":   ticket_id,
        "author_type": "user",
        "author_name": body.author_name or ticket.get("name", "User"),
        "message":     body.message,
        "created_at":  now,
    }

    supabase.table("helpdesk_messages").insert(msg).execute()

    # Update message_count and set status back to open if user replies
    supabase.table("helpdesk_tickets").update({
        "updated_at": now,
        "message_count": supabase.table("helpdesk_messages").select("id", count="exact").eq("ticket_id", ticket_id).execute().count or 0,
    }).eq("id", ticket_id).execute()

    return {"message": "Reply added"}


# ── Public: stats ──────────────────────────────────────────
@router.get("/stats")
async def public_stats():
    try:
        all_res = supabase.table("helpdesk_tickets").select("status,priority", count="exact").execute()
        open_res = supabase.table("helpdesk_tickets").select("id", count="exact").eq("status", "open").execute()
        resolved_res = supabase.table("helpdesk_tickets").select("id", count="exact").in_("status", ("resolved", "closed")).execute()
        in_progress_res = supabase.table("helpdesk_tickets").select("id", count="exact").eq("status", "in-progress").execute()
        return {
            "total":         all_res.count or 0,
            "openTickets":   open_res.count or 0,
            "resolvedToday": resolved_res.count or 0,
            "inProgress":    in_progress_res.count or 0,
        }
    except Exception:
        return {"total": 0, "openTickets": 0, "resolvedToday": 0, "inProgress": 0}


# ── Public: track by ticket_id (legacy) ────────────────────
@router.get("/track/{ticket_id}")
async def track_ticket(ticket_id: str):
    res = supabase.table("helpdesk_tickets").select(
        "ticket_id,subject,status,priority,response,responded_at,created_at"
    ).eq("ticket_id", ticket_id).execute()
    if not res.data:
        raise HTTPException(404, "Ticket not found")
    return res.data[0]


# ── Admin: get settings ────────────────────────────────────
@router.get("/admin/settings")
async def get_settings(_: dict = Depends(require_staff)):
    return _get_settings()


# ── Admin: update settings ─────────────────────────────────
@router.put("/admin/settings")
async def update_settings(body: SettingsBody, user: dict = Depends(require_staff)):
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("helpdesk_settings").update({
        "config": body.config,
        "updated_at": now,
        "updated_by": user.get("username", "admin"),
    }).eq("id", "default").execute()
    if not res.data:
        raise HTTPException(404, "Settings not found")
    return res.data[0].get("config", {})


# ── Admin: list tickets ────────────────────────────────────
@router.get("/admin/tickets")
async def list_tickets(
    status:   str | None = None,
    priority: str | None = None,
    search:   str | None = None,
    page:     int = Query(1, ge=1),
    limit:    int = Query(50, ge=1, le=200),
    _: dict = Depends(require_staff),
):
    q = supabase.table("helpdesk_tickets").select("*", count="exact")
    if status:
        q = q.eq("status", status)
    if priority:
        q = q.eq("priority", priority)
    if search:
        q = q.or_(f"name.ilike.%{search}%,email.ilike.%{search}%,subject.ilike.%{search}%,ticket_id.ilike.%{search}%")
    offset = (page - 1) * limit
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"tickets": res.data or [], "total": res.count or 0, "page": page, "limit": limit}


# ── Admin: get ticket detail with messages ─────────────────
@router.get("/admin/tickets/{ticket_id}")
async def admin_get_ticket(ticket_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("helpdesk_tickets").select("*").eq("id", ticket_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Ticket not found")
    ticket = res.data[0]
    msgs = supabase.table("helpdesk_messages").select(
        "id,author_type,author_name,author_id,message,created_at"
    ).eq("ticket_id", ticket_id).order("created_at").execute()
    ticket["messages"] = msgs.data or []
    return ticket


# ── Admin: add message to ticket ───────────────────────────
@router.post("/admin/tickets/{ticket_id}/messages")
async def admin_add_message(
    ticket_id: str,
    body: MessageBody,
    user: dict = Depends(require_staff),
):
    ticket_res = supabase.table("helpdesk_tickets").select("id,email").eq("id", ticket_id).limit(1).execute()
    if not ticket_res.data:
        raise HTTPException(404, "Ticket not found")
    ticket = ticket_res.data[0]
    now = datetime.now(timezone.utc).isoformat()
    staff_type = body.author_type if body.author_type in ("staff", "system") else "staff"
    msg = {
        "ticket_id":   ticket_id,
        "author_type": staff_type,
        "author_name": body.author_name or user.get("username", "Staff"),
        "author_id":   user.get("id"),
        "message":     body.message,
        "created_at":  now,
    }
    supabase.table("helpdesk_messages").insert(msg).execute()

    # Update message_count and set responded_at
    count_res = supabase.table("helpdesk_messages").select("id", count="exact").eq("ticket_id", ticket_id).execute()
    supabase.table("helpdesk_tickets").update({
        "updated_at":  now,
        "responded_at": now,
        "responded_by": user.get("username", "Staff"),
        "message_count": count_res.count or 0,
    }).eq("id", ticket_id).execute()

    # Email notification to ticket owner
    track_url = f"{SITE_URL}/helpdesk"
    fallback_subject = f"[aifazi.net] New reply on ticket #{ticket.get('ticket_id', ticket_id)}"
    fallback_html = _new_reply_email_html(
        ticket.get("ticket_id", ticket_id), ticket.get("subject", ""),
        user.get("username", "Staff"), body.message, track_url,
    )
    bg_text = f"New reply from {user.get('username', 'Staff')} on ticket #{ticket.get('ticket_id', ticket_id)}:\n\n{body.message}\n\nView: {track_url}"
    bg_subject, bg_html = render_template("ticket_reply", {
        "site_name": "aifazi.net",
        "ticket_id": ticket.get("ticket_id", ticket_id),
        "subject": ticket.get("subject", ""),
        "staff_name": user.get("username", "Staff"),
        "reply_message": body.message,
        "track_url": track_url,
    })
    queue_email(ticket.get("email", ""), bg_subject or fallback_subject, bg_html or fallback_html, bg_text, "ticket_reply")

    return {"message": "Reply added"}


# ── Admin: stats ───────────────────────────────────────────
@router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_staff)):
    try:
        total_res = supabase.table("helpdesk_tickets").select("id", count="exact").execute()
        open_res = supabase.table("helpdesk_tickets").select("id", count="exact").eq("status", "open").execute()
        resolved_res = supabase.table("helpdesk_tickets").select("id", count="exact").in_("status", ("resolved", "closed")).execute()
        in_progress_res = supabase.table("helpdesk_tickets").select("id", count="exact").eq("status", "in-progress").execute()
        critical_res = supabase.table("helpdesk_tickets").select("id", count="exact").eq("priority", "critical").execute()
        return {
            "total":         total_res.count or 0,
            "openTickets":   open_res.count or 0,
            "resolvedToday": resolved_res.count or 0,
            "inProgress":    in_progress_res.count or 0,
            "critical":      critical_res.count or 0,
        }
    except Exception:
        return {"total": 0, "openTickets": 0, "resolvedToday": 0, "inProgress": 0, "critical": 0}


# ── Admin: update ticket ───────────────────────────────────
@router.put("/admin/tickets/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    body: AdminUpdateBody,
    user: dict = Depends(require_staff),
):
    now = datetime.now(timezone.utc).isoformat()
    updates: dict = {"updated_at": now}

    if body.status is not None:
        valid = ("open", "in-progress", "pending", "resolved", "closed")
        if body.status not in valid:
            raise HTTPException(400, f"Invalid status. Must be one of: {valid}")
        updates["status"] = body.status
        if body.status == "resolved":
            updates["resolved_at"] = now
        if body.status == "closed":
            updates["closed_at"] = now

    if body.priority is not None:
        updates["priority"] = body.priority

    if body.response is not None:
        updates["response"] = body.response
        updates["responded_at"] = now
        updates["responded_by"] = body.responded_by or user.get("username", "admin")

    if body.internal_note is not None:
        updates["internal_note"] = body.internal_note

    if body.message is not None:
        supabase.table("helpdesk_messages").insert({
            "ticket_id":   ticket_id,
            "author_type": "staff",
            "author_name": user.get("username", "Staff"),
            "author_id":   user.get("id"),
            "message":     body.message,
            "created_at":  now,
        }).execute()
        count_res = supabase.table("helpdesk_messages").select("id", count="exact").eq("ticket_id", ticket_id).execute()
        updates["message_count"] = count_res.count or 0
        updates["responded_at"] = now
        updates["responded_by"] = user.get("username", "admin")

    res = supabase.table("helpdesk_tickets").update(updates).eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(404, "Ticket not found")

    return res.data[0]


# ── Admin: delete ticket ───────────────────────────────────
@router.delete("/admin/tickets/{ticket_id}")
async def delete_ticket(ticket_id: str, _: dict = Depends(require_staff)):
    supabase.table("helpdesk_tickets").delete().eq("id", ticket_id).execute()
    return {"message": "Deleted"}
