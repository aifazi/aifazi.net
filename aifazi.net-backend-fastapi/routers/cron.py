# Vercel Cron Job endpoint — replaces APScheduler for scheduled cleanup tasks.
# Called daily at 03:00 UTC by Vercel (see vercel.json "crons").
# FIX #8: Logs a warning at startup if CRON_SECRET is missing in production.
# H6: Constant-time comparison for the cron secret (previously used `!=`).
# P2: Also drains the mail_queue (Hobby plan allows a single daily cron, so the
#     daily cleanup tick doubles as the mail dispatcher).
import os, hmac, logging
from fastapi import APIRouter, Request, HTTPException
from database import supabase
from datetime import datetime, timedelta, timezone
from utils.email_queue import dispatch_pending

router = APIRouter()
logger = logging.getLogger(__name__)

CRON_SECRET = os.getenv("CRON_SECRET", "")

if not CRON_SECRET:
    logger.warning(
        "CRON_SECRET is not set. The /api/cron/cleanup endpoint will return 503 "
        "until the secret is configured."
    )


def _auth(request: Request):
    """Vercel passes Authorization: Bearer <CRON_SECRET> on cron calls.

    H6 — uses `hmac.compare_digest` rather than `!=` so a remote timing-attack can't
    recover the CRON_SECRET one byte at a time.
    """
    if not CRON_SECRET:
        raise HTTPException(
            503,
            "CRON_SECRET is not configured. "
            "Add CRON_SECRET=<random-hex> to your Vercel environment variables "
            "(Settings → Environment Variables) and redeploy."
        )
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {CRON_SECRET}"
    if not hmac.compare_digest(auth, expected):
        raise HTTPException(401, "Unauthorized")


@router.get("/api/cron/cleanup")
async def cron_cleanup(request: Request):
    _auth(request)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    supabase.table("users") \
        .update({"verify_token": None, "verify_expires": None}) \
        .lt("verify_expires", cutoff) \
        .neq("verify_token", None) \
        .execute()

    supabase.table("users") \
        .update({"reset_token": None, "reset_expires": None}) \
        .lt("reset_expires", cutoff) \
        .neq("reset_token", None) \
        .execute()

    # P2: drain the mail queue so queued emails are actually delivered in production.
    mail = await dispatch_pending()
    logger.info("cron_cleanup: mail dispatch summary %s", mail)

    # Baseline uptime check — on Hobby the cron only runs daily; frequent checks
    # are driven by the public /api/monitor/ping endpoint (external uptime service).
    monitor_summary = None
    try:
        from routers.monitor import _run_all_checks
        monitor_summary = await _run_all_checks()
    except Exception as e:
        logger.warning("cron_cleanup: monitor run failed: %s", e)

    return {"status": "ok", "ran_at": datetime.now(timezone.utc).isoformat(), "mail": mail, "monitor": monitor_summary}
