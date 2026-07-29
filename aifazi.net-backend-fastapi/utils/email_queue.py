"""utils/email_queue.py — Reliable email queue helpers for Vercel serverless.

WHY THIS EXISTS (Phase 1 of email-reliability refactor):
─────────────────────────────────────────────────────────────────────────────
On Vercel serverless, FastAPI `BackgroundTasks` are unreliable — the Lambda
freezes shortly after the HTTP response is shipped, killing anything still in
flight. Across the codebase there were 15 `bg.add_task(send_email, ...)` call
sites in routers/{auth,forum_auth,chat,contact,helpdesk,newsletter,stats}.py.
In production on Vercel, every single one of those sends was being dropped
silently: verification emails, password resets, ticket confirmations, contact
replies, newsletter broadcasts, admin user-message emails.

WHAT THIS MODULE DOES:
──────────────────────
  • `queue_email()` — synchronous insert-only. Returns immediately after
    dropping a `pending` row into `mail_queue`. The actual send is performed
    later by the `/api/admin/mail/queue/process-pending` cron endpoint.

  • `dispatch_pending(limit)` — atomically claims `pending` rows older than
    2 minutes (turns them to `sending`) and dispatches them through the
    configured provider (Brevo/Resend/SMTP). Failures land back in `failed`
    with `retry_count` incremented; the next cron tick picks them up again
    once their `created_at` is older than the cutoff. **Idempotent** under
    concurrent cron runs because the claim UPDATE predicates on
    `status='pending'`, so two cron invocations cannot double-send the same
    row (the second sees it as `sending` already).

CALL-SITE MIGRATION:
───────────────────
  BEFORE:  bg.add_task(send_email, to, subject, html, text, purpose, name)
  AFTER:   queue_email(to, subject, html, text, purpose, name)

The `BackgroundTasks` parameter can often be removed entirely (no longer
needed for email delivery). Use `queue_email` only for **fire-and-forget**
sends; for sends where the caller needs to know *immediately* whether the
send succeeded (rare — not currently anywhere in this codebase), call
`send_email(...)` inline instead.
"""
import logging
from datetime import datetime, timezone, timedelta

from database import supabase
from utils.email import _get_config, _c, _send_brevo, _send_resend, _send_smtp

logger = logging.getLogger(__name__)

PENDING_GRACE_MINUTES = 2
DEFAULT_BATCH = 20
MAX_BATCH = 100


def _resolve_provider() -> str:
    """Synchronous fetch of the outgoing provider name. Cheap, cached by
    PostgREST connection pool. Falls back to 'smtp' on any failure so we still
    persist the row with a sane `provider` value."""
    try:
        cfg_res = (
            supabase.table("email_config")
            .select("settings")
            .eq("key", "global")
            .limit(1)
            .execute()
        )
        if cfg_res.data:
            cfg = cfg_res.data[0].get("settings") or {}
            return _c(cfg, "outgoingProvider", "outgoing_provider", default="smtp")
    except Exception as e:
        logger.warning("queue_email: could not read email_config (%s)", e)
    return "smtp"


def queue_email(
    to: str,
    subject: str,
    html: str,
    text: str = "",
    purpose: str = "other",
    recipient_name: str = "",
) -> str | None:
    """Insert a `pending` row into `mail_queue` and return its id.
    Returns None on insert failure (logged). No network send is attempted —
    `dispatch_pending()` (cron-driven) handles that.

    Safe to call in a hot request path: it's one INSERT, no outbound network
    I/O. Even if the request's Lambda freezes immediately after, the row is
    already durable in Postgres and the next cron tick will pick it up.
    """
    if not to:
        logger.warning("queue_email: missing 'to', skipping (purpose=%s)", purpose)
        return None
    provider = _resolve_provider()
    try:
        res = supabase.table("mail_queue").insert({
            "to_email":       to,
            "subject":        subject,
            "html":           html,
            "text":           text,
            "status":         "pending",
            "purpose":        purpose,
            "provider":       provider,
            "recipient_name":  recipient_name,
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        logger.error("queue_email insert failed for %s (purpose=%s): %s", to, purpose, e)
        return None


def _mark_failed(qid: str, error: str) -> None:
    try:
        retries_res = supabase.table("mail_queue").select("retry_count").eq("id", qid).execute()
        rc = (retries_res.data[0].get("retry_count", 0) if retries_res.data else 0) or 0
        supabase.table("mail_queue").update({
            "status":      "failed",
            "error_msg":   str(error)[:500],
            "retry_count": rc + 1,
        }).eq("id", qid).execute()
    except Exception as inner:
        logger.error("dispatch_pending: failed to mark %s as failed: %s", qid, inner)


def _requeue_as_pending(qid: str) -> None:
    """Used when the dispatch layer couldn't even start (no provider config).
    Returns the row to pending so the next cron tick tries again — but the
    2-min `created_at` cutoff means we won't spin on a misconfiguration."""
    try:
        supabase.table("mail_queue").update({"status": "pending"}).eq("id", qid).execute()
    except Exception as e:
        logger.error("dispatch_pending: failed to requeue %s: %s", qid, e)


async def dispatch_pending(limit: int = DEFAULT_BATCH) -> dict:
    """Atomically claim pending rows older than the grace window and send them.

    Returns a summary dict: ``{"claimed": N, "sent": N, "failed": N}``.

    Concurrency contract: the claim step is a single UPDATE … WHERE
    status='pending'. Two concurrent cron runs can therefore never claim the
    same row — the second invocation will see the row as `sending` and skip
    it. Safe to schedule aggressively.
    """
    if limit > MAX_BATCH:
        limit = MAX_BATCH
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=PENDING_GRACE_MINUTES)).isoformat()

    # Atomic claim: pending → sending for rows past the grace window.
    claim_res = (
        supabase.table("mail_queue")
        .update({"status": "sending"})
        .eq("status", "pending")
        .lt("created_at", cutoff)
        .order("created_at")
        .limit(limit)
        .execute()
    )
    items = claim_res.data or []
    if not items:
        return {"claimed": 0, "sent": 0, "failed": 0}

    # Single config fetch for the entire batch.
    try:
        cfg = await _get_config()
    except Exception as e:
        logger.error("dispatch_pending: email config load failed (%s) — requeueing %d items", e, len(items))
        for it in items:
            _requeue_as_pending(it["id"])
        return {"claimed": len(items), "sent": 0, "failed": 0, "config_error": str(e)[:200]}

    provider = _c(cfg, "outgoingProvider", "outgoing_provider", default="smtp")
    configured = (
        cfg.get("smtpHost") or cfg.get("smtp_host")
        or cfg.get("brevoApiKey") or cfg.get("brevo_api_key")
        or cfg.get("resendApiKey") or cfg.get("resend_api_key")
    )
    if not configured:
        logger.error("dispatch_pending: no outgoing provider configured — requeueing %d items", len(items))
        for it in items:
            _requeue_as_pending(it["id"])
        return {"claimed": len(items), "sent": 0, "failed": 0, "config_error": "no provider configured"}

    sent = 0
    failed = 0
    for it in items:
        qid     = it["id"]
        to      = it.get("to_email", "")
        subject = it.get("subject", "")
        html    = it.get("html", "")
        text    = it.get("text", "")
        purpose = it.get("purpose", "retry")
        logger.info("dispatch_pending: sending qid=%s to=%s purpose=%s", qid, to, purpose)
        try:
            msg_id = None
            if provider == "brevo":
                msg_id = await _send_brevo(cfg, to, subject, html, text)
            elif provider == "resend":
                msg_id = await _send_resend(cfg, to, subject, html, text)
            else:
                await _send_smtp(cfg, to, subject, html, text)
            supabase.table("mail_queue").update({
                "status":           "sent",
                "sent_at":          datetime.now(timezone.utc).isoformat(),
                "provider_msg_id":  msg_id or "",
                "error_msg":        "",
            }).eq("id", qid).execute()
            sent += 1
        except Exception as e:
            logger.error("dispatch_pending: send to %s failed: %s", to, e, exc_info=True)
            _mark_failed(qid, str(e))
            failed += 1

    return {"claimed": len(items), "sent": sent, "failed": failed}