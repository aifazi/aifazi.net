"""utils/email_queue.py — Reliable email queue helpers for Vercel serverless.

WHY THIS EXISTS (Phase 1 of email-reliability refactor):
─────────────────────────────────────────────────────────────────────────────
On Vercel serverless, FastAPI `BackgroundTasks` are unreliable — the Lambda
freezes shortly after the HTTP response is shipped, killing anything still in
flight. Across the codebase there were 15 `bg.add_task(send_email, ...)` call
sites in routers/{auth,chat,contact,helpdesk,newsletter,stats}.py.
In production on Vercel, every single one of those sends was being dropped
silently: verification emails, password resets, ticket confirmations, contact
replies, newsletter broadcasts, admin user-message emails.

DESIGN (Phase 2 — synchronous sends + self-healing retry):
─────────────────────────────────────────────────────────────────────────────
  • `queue_email()` — async. Inserts a durable `pending` row into `mail_queue`
    FIRST (so the attempt can never be lost), then immediately attempts the
    real provider send inline within the request lifecycle. The row is updated
    to `sent` on success or `failed` (retry_count+1) on failure. Because the
    send is awaited inside the request, the Lambda stays alive until it
    completes — no reliance on background tasks or the daily cron for
    transactional mail.

  • `queue_email_bulk()` — synchronous insert-only variant for large fan-outs
    (newsletter campaigns, 1000s of rows). Returns immediately. Rows are
    drained by `dispatch_pending()` (daily cron + admin "process pending").

  • `dispatch_pending(limit)` — the self-healing dispatcher. It claims:
      1. `pending` rows older than the 2-minute grace window (durability
         backstop — anything inserted but not yet sent),
      2. `sending` rows that went stale (older than STALE_SENDING_MINUTES —
         the Lambda froze mid-send; reclaim and retry),
      3. `failed` rows eligible for retry (retry_count < MAX_RETRIES and past
         the exponential-backoff window).
    Sends each through the configured provider (Brevo/Resend/SMTP). Failures
    land back in `failed` with retry_count incremented; the next tick retries
    once the backoff window expires. **Idempotent** under concurrent cron runs
    because the claim UPDATE predicates on the current status, so two cron
    invocations cannot double-send the same row.

CALL-SITE MIGRATION:
───────────────────
  BEFORE:  bg.add_task(send_email, to, subject, html, text, purpose, name)
  AFTER:   await queue_email(to, subject, html, text, purpose, name)

Use `queue_email` for transactional sends (send immediately inline). Use
`queue_email_bulk` only for large fire-and-forget fan-outs (newsletters).
"""
import logging
from datetime import datetime, timedelta, timezone

from database import supabase
from utils.email import (
    _c,
    _get_config,
    _send_brevo,
    _send_resend,
    _send_smtp,
    send_email,
)

logger = logging.getLogger(__name__)

PENDING_GRACE_MINUTES = 2
STALE_SENDING_MINUTES = 10
MAX_RETRIES = 5
RETRY_BASE_MINUTES = 15
DEFAULT_BATCH = 50
MAX_BATCH = 200


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


def _insert_pending(
    to: str,
    subject: str,
    html: str,
    text: str = "",
    purpose: str = "other",
    recipient_name: str = "",
) -> str | None:
    """Insert a `pending` row and return its id (or None on failure)."""
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
            "recipient_name": recipient_name,
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        logger.error("mail_queue insert failed for %s (purpose=%s): %s", to, purpose, e)
        return None


async def queue_email(
    to: str,
    subject: str,
    html: str,
    text: str = "",
    purpose: str = "other",
    recipient_name: str = "",
) -> dict:
    """Insert a durable `pending` row, then send it immediately (inline await).

    Returns the `send_email` result dict: ``{"ok": True, "msg_id": ...}`` on
    success or ``{"ok": False, "error": ...}`` on failure. On failure the row
    is persisted as `failed` and later retried by `dispatch_pending()`.

    Safe to call in a hot request path: one INSERT plus the awaited provider
    HTTP call. Even if the request's Lambda freezes after, the row is already
    durable in Postgres for the retry/cron backstop.
    """
    if not to:
        logger.warning("queue_email: missing 'to', skipping (purpose=%s)", purpose)
        return {"ok": False, "error": "missing recipient"}

    qid = _insert_pending(to, subject, html, text, purpose, recipient_name)
    if not qid:
        return {"ok": False, "error": "failed to create mail_queue entry"}

    result = await send_email(
        to, subject, html, text, purpose, recipient_name, queue_id=qid,
    )
    if not result.get("ok"):
        logger.error("queue_email: inline send failed for qid=%s to=%s: %s",
                     qid, to, result.get("error"))
    return result


def queue_email_bulk(
    to: str,
    subject: str,
    html: str,
    text: str = "",
    purpose: str = "other",
    recipient_name: str = "",
) -> str | None:
    """Insert-only variant for large fan-outs (newsletters). Returns row id or None."""
    if not to:
        logger.warning("queue_email_bulk: missing 'to', skipping (purpose=%s)", purpose)
        return None
    return _insert_pending(to, subject, html, text, purpose, recipient_name)


def _mark_failed(qid: str, error: str) -> None:
    try:
        retries_res = supabase.table("mail_queue").select("retry_count").eq("id", qid).execute()
        rc = (retries_res.data[0].get("retry_count", 0) if retries_res.data else 0) or 0
        supabase.table("mail_queue").update({
            "status":      "failed",
            "error_msg":   str(error)[:500],
            "retry_count": rc + 1,
            "updated_at":  datetime.now(timezone.utc).isoformat(),
        }).eq("id", qid).execute()
    except Exception as inner:
        logger.error("dispatch_pending: failed to mark %s as failed: %s", qid, inner)


def _requeue_as_pending(qid: str) -> None:
    """Used when the dispatch layer couldn't even start (no provider config).
    Returns the row to pending so the next cron tick tries again — but the
    grace/cutoff windows mean we won't spin on a misconfiguration."""
    try:
        supabase.table("mail_queue").update({
            "status":     "pending",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", qid).execute()
    except Exception as e:
        logger.error("dispatch_pending: failed to requeue %s: %s", qid, e)


def _claim(limit: int) -> list[dict]:
    """Atomically claim rows eligible for dispatch and return them.

    Claims three buckets in one pass:
      1. `pending` rows older than the grace window (never attempted yet).
      2. `sending` rows stuck longer than STALE_SENDING_MINUTES (frozen Lambda).
      3. `failed` rows with retry_count < MAX_RETRIES past exponential backoff.

    Each bucket is a separate atomic UPDATE … WHERE <status>, so concurrent
    cron runs can never double-claim a row (the second sees it as `sending`).
    """
    now = datetime.now(timezone.utc)
    claimed: list[dict] = []

    # Bucket 1: fresh pending past the grace window.
    grace_cutoff = (now - timedelta(minutes=PENDING_GRACE_MINUTES)).isoformat()
    try:
        res = (
            supabase.table("mail_queue")
            .update({"status": "sending", "updated_at": now.isoformat()})
            .eq("status", "pending")
            .lt("created_at", grace_cutoff)
            .order("created_at")
            .limit(limit)
            .execute()
        )
        claimed.extend(res.data or [])
    except Exception as e:
        logger.error("dispatch_pending: bucket 1 claim failed: %s", e)

    # Bucket 2: stale `sending` rows — the Lambda froze mid-send.
    stale_cutoff = (now - timedelta(minutes=STALE_SENDING_MINUTES)).isoformat()
    try:
        res = (
            supabase.table("mail_queue")
            .update({"status": "sending", "updated_at": now.isoformat()})
            .eq("status", "sending")
            .lt("updated_at", stale_cutoff)
            .order("updated_at")
            .limit(limit - len(claimed))
            .execute()
        )
        claimed.extend(res.data or [])
    except Exception as e:
        logger.error("dispatch_pending: bucket 2 claim failed: %s", e)

    # Bucket 3: retryable `failed` rows past exponential backoff.
    if len(claimed) < limit:
        try:
            failed = (
                supabase.table("mail_queue")
                .select("id,retry_count,updated_at")
                .eq("status", "failed")
                .lt("retry_count", MAX_RETRIES)
                .order("updated_at")
                .limit(limit * 4)
                .execute()
            )
            eligible: list[str] = []
            for row in (failed.data or []):
                rc = row.get("retry_count", 0) or 0
                backoff_minutes = RETRY_BASE_MINUTES * (2 ** rc)
                backoff_cutoff = now - timedelta(minutes=backoff_minutes)
                updated = row.get("updated_at")
                if not updated:
                    continue
                try:
                    updated_dt = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
                except Exception:
                    updated_dt = now
                if updated_dt <= backoff_cutoff:
                    eligible.append(row["id"])
                if len(eligible) >= limit - len(claimed):
                    break
            if eligible:
                res = (
                    supabase.table("mail_queue")
                    .update({"status": "sending", "updated_at": now.isoformat()})
                    .in_("id", eligible)
                    .eq("status", "failed")
                    .execute()
                )
                claimed.extend(res.data or [])
        except Exception as e:
            logger.error("dispatch_pending: bucket 3 claim failed: %s", e)

    return claimed[:limit]


async def dispatch_pending(limit: int = DEFAULT_BATCH) -> dict:
    """Claim eligible rows (pending/stale-sending/retryable-failed) and send them.

    Returns a summary dict: ``{"claimed": N, "sent": N, "failed": N}``.

    Concurrency contract: each claim bucket is a single UPDATE … WHERE
    status=..., so two concurrent cron runs can never send the same row.
    Safe to schedule aggressively.
    """
    limit = min(limit, MAX_BATCH)

    items = _claim(limit)
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
                "updated_at":       datetime.now(timezone.utc).isoformat(),
            }).eq("id", qid).execute()
            sent += 1
        except Exception as e:
            logger.error("dispatch_pending: send to %s failed: %s", to, e, exc_info=True)
            _mark_failed(qid, str(e))
            failed += 1

    return {"claimed": len(items), "sent": sent, "failed": failed}
