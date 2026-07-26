"""routers/mail_queue.py
Central mail queue hub — tracks every outgoing email from the entire site.
Mount at /api/admin/mail/queue in main.py
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff
from utils.email import send_email

logger = logging.getLogger(__name__)
router = APIRouter()


# ── helpers ──────────────────────────────────────────────────

def _row_to_email(r: dict) -> dict:
    return {
        "id":       r.get("id"),
        "to":       r.get("to_email", ""),
        "name":     r.get("recipient_name", ""),
        "subject":  r.get("subject", ""),
        "type":     r.get("purpose", ""),
        "status":   r.get("status", ""),
        "provider": r.get("provider", ""),
        "sentAt":   r.get("sent_at"),
        "createdAt":r.get("created_at"),
        "error":    r.get("error_msg", ""),
        "attempts": r.get("retry_count", 0) or 0,
        "html":     r.get("html", ""),
        "text":     r.get("text", ""),
        "providerMsgId": r.get("provider_msg_id", ""),
        "trackingData":  r.get("tracking_data"),
    }


def _apply_search(q, term: str):
    term = term.strip()
    if not term:
        return q
    return q.or_(
        f"to_email.ilike.%{term}%,"
        f"subject.ilike.%{term}%,"
        f"purpose.ilike.%{term}%,"
        f"recipient_name.ilike.%{term}%"
    )


# ── GET / — list with filters ───────────────────────────────

@router.get("")
async def list_queue(
    page:   int = Query(1, ge=1),
    limit:  int = Query(25, ge=1, le=200),
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort:   str = "newest",
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    _: dict = Depends(require_staff),
):
    q = supabase.table("mail_queue").select("*", count="exact")
    if status:
        q = q.eq("status", status)
    if search:
        q = _apply_search(q, search)
    if date_from:
        q = q.gte("created_at", date_from)
    if date_to:
        q = q.lte("created_at", date_to)
    order_dir = "desc" if sort in ("newest", "desc") else "asc"
    offset = (page - 1) * limit
    res = q.order("created_at", desc=order_dir == "desc").range(offset, offset + limit - 1).execute()
    return {
        "emails": [_row_to_email(r) for r in (res.data or [])],
        "total":  res.count or 0,
    }


# ── GET /stats — stats ──────────────────────────────────────

@router.get("/stats")
async def queue_stats(_: dict = Depends(require_staff)):
    total_res     = supabase.table("mail_queue").select("id", count="exact").execute()
    pending_res   = supabase.table("mail_queue").select("id", count="exact").eq("status", "pending").execute()
    sending_res   = supabase.table("mail_queue").select("id", count="exact").eq("status", "sending").execute()
    sent_res      = supabase.table("mail_queue").select("id", count="exact").eq("status", "sent").execute()
    delivered_res = supabase.table("mail_queue").select("id", count="exact").eq("status", "delivered").execute()
    failed_res    = supabase.table("mail_queue").select("id", count="exact").eq("status", "failed").execute()
    cancelled_res = supabase.table("mail_queue").select("id", count="exact").eq("status", "cancelled").execute()
    retrying_res  = supabase.table("mail_queue").select("id", count="exact").eq("status", "retrying").execute()
    today = datetime.now(timezone.utc).date().isoformat()
    today_res = supabase.table("mail_queue").select("id", count="exact").gte("created_at", today).execute()
    return {
        "pending":   pending_res.count or 0,
        "sending":   sending_res.count or 0,
        "sent":      sent_res.count or 0,
        "delivered": delivered_res.count or 0,
        "failed":    failed_res.count or 0,
        "cancelled": cancelled_res.count or 0,
        "retrying":  retrying_res.count or 0,
        "total":     total_res.count or 0,
        "today":     today_res.count or 0,
    }


# ── GET /{queue_id} — single item detail ────────────────────

@router.get("/{queue_id}")
async def get_queue_item(queue_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("mail_queue").select("*").eq("id", queue_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Queue item not found")
    return _row_to_email(res.data[0])


# ── POST /action — bulk actions ─────────────────────────────

class BulkActionBody(BaseModel):
    action: str  # "resend" | "cancel"
    ids: list[str]


@router.post("/action")
async def bulk_action(body: BulkActionBody, bg: BackgroundTasks, _: dict = Depends(require_staff)):
    if body.action not in ("resend", "cancel"):
        raise HTTPException(400, "Invalid action. Use 'resend' or 'cancel'.")
    if not body.ids:
        raise HTTPException(400, "No IDs provided")

    items = supabase.table("mail_queue").select("id,status,to_email,subject,html,text,purpose,recipient_name").in_("id", body.ids).execute()
    if not items.data:
        raise HTTPException(404, "No matching queue items found")

    done = 0
    for item in items.data:
        if body.action == "cancel":
            if item["status"] in ("sent", "delivered", "cancelled"):
                continue
            supabase.table("mail_queue").update({"status": "cancelled"}).eq("id", item["id"]).execute()
            done += 1
        elif body.action == "resend":
            if item["status"] == "cancelled":
                continue
            supabase.table("mail_queue").update({"status": "resent"}).eq("id", item["id"]).execute()
            bg.add_task(
                send_email,
                item["to_email"],
                item.get("subject", ""),
                item.get("html", ""),
                item.get("text", ""),
                item.get("purpose", "resend"),
                item.get("recipient_name", ""),
            )
            done += 1

    return {"message": f"{body.action.upper()} queued for {done} email(s)", "done": done}


# ── POST /{queue_id}/resend — individual resend ─────────────

@router.post("/{queue_id}/resend")
async def resend_item(queue_id: str, bg: BackgroundTasks, _: dict = Depends(require_staff)):
    res = supabase.table("mail_queue").select("*").eq("id", queue_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Queue item not found")
    item = res.data[0]
    if item.get("status") in ("sent", "delivered"):
        raise HTTPException(400, "Email already sent successfully")
    if item.get("status") == "cancelled":
        raise HTTPException(400, "Cannot resend a cancelled email")
    supabase.table("mail_queue").update({"status": "resent"}).eq("id", queue_id).execute()
    bg.add_task(
        send_email,
        item["to_email"],
        item.get("subject", ""),
        item.get("html", ""),
        item.get("text", ""),
        item.get("purpose", "resend"),
        item.get("recipient_name", ""),
    )
    return {"message": "Resend queued"}


# ── DELETE /{queue_id} — cancel individual ──────────────────

@router.delete("/{queue_id}")
async def cancel_item(queue_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("mail_queue").select("status").eq("id", queue_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Queue item not found")
    if res.data[0].get("status") in ("sent", "delivered", "cancelled"):
        raise HTTPException(400, "Cannot cancel this email")
    supabase.table("mail_queue").update({"status": "cancelled"}).eq("id", queue_id).execute()
    return {"message": "Cancelled"}


# ── POST /webhook/inbound — delivery event receiver ─────────

class WebhookEvent(BaseModel):
    event:     str  # "delivered" | "bounced" | "opened" | "clicked" | "complained"
    msg_id:    str
    recipient: str
    timestamp: Optional[str] = None
    details:   Optional[dict] = None


@router.post("/webhook/inbound")
async def delivery_webhook(body: WebhookEvent, request: Request):
    """Receives delivery webhooks from Brevo/Resend/SMTP."""
    status_map = {
        "delivered":  "delivered",
        "bounced":    "failed",
        "opened":     "delivered",
        "clicked":    "delivered",
        "complained": "failed",
    }
    mapped = status_map.get(body.event)
    if not mapped:
        return {"ok": False, "reason": "unknown_event"}

    updates = {"status": mapped}
    if body.timestamp:
        updates["sent_at"] = body.timestamp
    if body.details:
        updates["tracking_data"] = body.details
    if mapped == "delivered" and not body.timestamp:
        updates["sent_at"] = datetime.now(timezone.utc).isoformat()

    supabase.table("mail_queue").update(updates).eq("provider_msg_id", body.msg_id).execute()
    return {"ok": True}


# ── POST /process-pending — retry stale pending items ────────

@router.post("/process-pending")
async def process_pending(bg: BackgroundTasks, _: dict = Depends(require_staff)):
    """Find pending items older than 2 minutes and retry them.
    This handles items stuck in 'pending' because the original
    background task never fired (worker restart, config failure, etc.)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    res = supabase.table("mail_queue") \
        .select("id,to_email,subject,html,text,purpose,recipient_name") \
        .eq("status", "pending") \
        .lt("created_at", cutoff) \
        .order("created_at") \
        .limit(20) \
        .execute()
    if not res.data:
        return {"message": "No stale pending items found", "processed": 0}
    for item in res.data:
        supabase.table("mail_queue").update({"status": "retrying"}).eq("id", item["id"]).execute()
        bg.add_task(
            send_email,
            item["to_email"],
            item.get("subject", ""),
            item.get("html", ""),
            item.get("text", ""),
            item.get("purpose", "retry"),
            item.get("recipient_name", ""),
        )
    return {"message": f"Retrying {len(res.data)} stale item(s)", "processed": len(res.data)}


# ── DELETE /purge — purge old records ───────────────────────

@router.delete("/purge")
async def purge_old(
    days: int = Query(30, ge=1),
    status: Optional[str] = None,
    _: dict = Depends(require_staff),
):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = supabase.table("mail_queue").delete().lt("created_at", cutoff)
    if status:
        q = q.eq("status", status)
    else:
        q = q.in_("status", ["sent", "delivered", "cancelled", "failed"])
    res = q.execute()
    return {"deleted": len(res.data or [])}
