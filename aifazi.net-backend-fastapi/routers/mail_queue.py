"""routers/mail_queue.py
Central mail queue hub — tracks every outgoing email from the entire site.
Mount at /api/admin/mail/queue in main.py
"""
import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from database import safe_search_term, supabase
from dependencies import require_staff
from utils.email import send_email
from utils.email_queue import dispatch_pending

logger = logging.getLogger(__name__)
router = APIRouter()

# C6 — Mail delivery webhook shared secret. Configure the same value in Brevo/Resend
# webhook config (as a custom `X-Webhook-Key` header) OR compute HMAC-SHA256 over the
# raw request body and send it in `X-Webhook-Signature`. If unset, the inbound webhook
# fails closed with 403 — preventing anyone inside the trust boundary from spoofing
# delivery events to rewrite mail_queue rows by provider_msg_id.
MAIL_WEBHOOK_SECRET = os.getenv("MAIL_WEBHOOK_SECRET", "")
if not MAIL_WEBHOOK_SECRET:
    logger.warning(
        "MAIL_WEBHOOK_SECRET is not set; /webhook/inbound will reject all delivery events. "
        "Configure it in Brevo/Resend webhook settings to enable inbound tracking."
    )

# Phase 1 — Vercel cron uses Authorization: Bearer <CRON_SECRET> to poll
# /process-pending. Reuse the same secret already configured for /api/cron/cleanup
# so we don't need a new env var.
CRON_SECRET = os.getenv("CRON_SECRET", "")


def _cron_or_staff_auth(request: Request) -> dict:
    """Dual auth for /process-pending. Accepts EITHER:
      • `Authorization: Bearer <CRON_SECRET>`  (Vercel cron)
      • a valid staff JWT                        (manual admin trigger from the UI)
    Returns a minimal dict. Raises 401 if neither matches. Matches the original
    `Depends(require_staff)` auth level (no system.mail permission check — any
    staff role is enough, just as it was before Phase 1).
    """
    auth = request.headers.get("authorization", "")
    if CRON_SECRET and auth.startswith("Bearer "):
        candidate = auth[7:].strip()
        if hmac.compare_digest(candidate, CRON_SECRET):
            return {"role": "system", "username": "cron"}

    # Staff path — decode the JWT and resolve staff access from the DB.
    from fastapi import HTTPException
    from fastapi.security import HTTPBearer

    from dependencies import get_current_user
    from permissions import resolve_staff_access
    bearer_dep = HTTPBearer(auto_error=False)
    creds = bearer_dep(request)
    if creds is None or not creds.credentials:
        raise HTTPException(401, "Unauthorized (requires CRON_SECRET bearer or staff JWT)")
    user = get_current_user(creds=creds)
    access = resolve_staff_access(user)
    if not access:
        raise HTTPException(403, "Staff only")
    merged = {**user, **{k: v for k, v in access.items() if k != "staff_row"}}
    return merged


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
    term = safe_search_term(term)
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
    status: str | None = None,
    search: str | None = None,
    sort:   str = "newest",
    date_from: str | None = None,
    date_to:   str | None = None,
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
async def bulk_action(body: BulkActionBody, _: dict = Depends(require_staff)):
    if body.action not in ("resend", "cancel"):
        raise HTTPException(400, "Invalid action. Use 'resend' or 'cancel'.")
    if not body.ids:
        raise HTTPException(400, "No IDs provided")

    items = supabase.table("mail_queue").select("id,status,to_email,subject,html,text,purpose,recipient_name").in_("id", body.ids).execute()
    if not items.data:
        raise HTTPException(404, "No matching queue items found")

    done = 0
    sent = 0
    failed = 0
    for item in items.data:
        if body.action == "cancel":
            if item["status"] in ("sent", "delivered", "cancelled"):
                continue
            supabase.table("mail_queue").update({"status": "cancelled"}).eq("id", item["id"]).execute()
            done += 1
        elif body.action == "resend":
            if item["status"] == "cancelled":
                continue
            # Re-pend the SAME row so dispatch_pending retries it. The old code
            # marked it 'resent' (a terminal state nothing ever reclaims) AND
            # queued a duplicate new row — the original sat orphaned forever and
            # a failed resend was never retried.
            supabase.table("mail_queue").update({
                "status": "pending",
                "error_msg": None,
                "retry_count": 0,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", item["id"]).execute()
            done += 1

    return {
        "message": f"{body.action.upper()} processed for {done} email(s)",
        "done": done,
        "sent": sent,
        "failed": failed,
    }


# ── POST /{queue_id}/resend — individual resend ─────────────

@router.post("/{queue_id}/resend")
async def resend_item(queue_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("mail_queue").select("*").eq("id", queue_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Queue item not found")
    item = res.data[0]
    if item.get("status") in ("sent", "delivered"):
        raise HTTPException(400, "Email already sent successfully")
    if item.get("status") == "cancelled":
        raise HTTPException(400, "Cannot resend a cancelled email")
    # Re-pend the SAME row, then send inline against it — send_email(queue_id=...)
    # updates the existing row (sending→sent/failed), so we never leave an
    # orphaned 'resent' row or duplicate it.
    supabase.table("mail_queue").update({
        "status": "pending",
        "error_msg": None,
        "retry_count": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", queue_id).execute()
    result = await send_email(
        item["to_email"],
        item.get("subject", ""),
        item.get("html", ""),
        item.get("text", ""),
        item.get("purpose", "resend"),
        item.get("recipient_name", ""),
        queue_id=queue_id,
    )
    if not result.get("ok"):
        raise HTTPException(502, f"Resend failed: {result.get('error', 'unknown error')}")
    return {"message": "Resent successfully"}


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
    timestamp: str | None = None
    details:   dict | None = None


@router.post("/webhook/inbound")
async def delivery_webhook(request: Request):
    """Receives delivery webhooks from Brevo/Resend/SMTP.

    C6 — verifies a shared-secret HMAC before applying any state change. Previously
    the route was reachable by anything inside the INTERNAL_API_SECRET trust boundary
    (Next.js proxies, anyone with the env) and an attacker could forge delivered/
    bounced events to rewrite mail_queue rows by provider_msg_id — suppressing bounce
    notifications or status-flipping legitimate emails.

    The caller must supply ONE of:
      • X-Webhook-Key: <MAIL_WEBHOOK_SECRET>           (simple shared-secret)
      • X-Webhook-Signature: <hex HMAC-SHA256(body)>    (Brevo custom / Resend svix-style
                                                        signed with the same secret)
    """
    if not MAIL_WEBHOOK_SECRET:
        raise HTTPException(403, "Mail delivery webhook is not configured.")

    raw = await request.body()
    presented_key    = request.headers.get("X-Webhook-Key", "")
    presented_sig    = request.headers.get("X-Webhook-Signature", "")

    key_ok = hmac.compare_digest(presented_key, MAIL_WEBHOOK_SECRET) if presented_key else False
    sig_ok = False
    if presented_sig:
        # Accept `sha256=<hex>` (GitHub-style) and bare `<hex>` formats.
        presented_sig_clean = presented_sig.split("=", 1)[-1].strip().lower()
        expected = hmac.new(MAIL_WEBHOOK_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        sig_ok = hmac.compare_digest(presented_sig_clean, expected)
    if not (key_ok or sig_ok):
        raise HTTPException(403, "Invalid or missing webhook signature.")

    # Signature checked — parse the body now.
    try:
        import json
        body = WebhookEvent(**json.loads(raw.decode("utf-8")))
    except Exception as exc:
        raise HTTPException(400, f"Invalid webhook body: {exc}")

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
async def process_pending(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    authed: dict = Depends(_cron_or_staff_auth),
):
    """Phase 1 — claim `pending` rows older than 2 minutes and send them.

    Called by:
      • Vercel cron (every 2 min) — passes `Authorization: Bearer <CRON_SECRET>`
      • Admin UI button — passes a staff JWT (requires system.mail access)

    The claim is atomic: the underlying UPDATE predicates on `status='pending'`,
    so two concurrent cron invocations can never double-send the same row. Sends
    happen inline within the request lifecycle (no BackgroundTasks — those are
    unreliable on Vercel serverless because the Lambda freezes after response).
    """
    result = await dispatch_pending(limit=limit)
    msg = (
        f"Processed {result['claimed']} item(s): "
        f"{result.get('sent', 0)} sent, {result.get('failed', 0)} failed"
    )
    if result.get("config_error"):
        msg += f" — config error: {result['config_error']}"
    return {
        "message": msg,
        "processed": result.get("claimed", 0),
        "sent": result.get("sent", 0),
        "failed": result.get("failed", 0),
    }


# ── DELETE /purge — purge old records ───────────────────────

@router.delete("/purge")
async def purge_old(
    days: int = Query(30, ge=1),
    status: str | None = None,
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
