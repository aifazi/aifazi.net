# Vercel Cron Job endpoint — replaces APScheduler for scheduled cleanup tasks.
# Called daily at 03:00 UTC by Vercel (see vercel.json "crons").
# FIX #8: Logs a warning at startup if CRON_SECRET is missing in production.
# H6: Constant-time comparison for the cron secret (previously used `!=`).
# P2: Also drains the mail_queue (Hobby plan allows a single daily cron, so the
#     daily cleanup tick doubles as the mail dispatcher).
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from database import supabase
from dependencies import require_admin
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
    return await run_cleanup()


# Job definitions owned by this module: the single daily Vercel tick plus the
# sub-jobs run_cleanup records heartbeats for (see run_cleanup below).
JOBS: list[dict[str, Any]] = [
    {"name": "cron-cleanup", "source": "cron.py", "schedule": "daily 03:00 UTC (Vercel cron)", "interval_seconds": 86400},
    {"name": "monitor", "source": "cron.py", "schedule": "daily (inside cleanup tick)", "interval_seconds": 86400},
    {"name": "error-digest", "source": "cron.py", "schedule": "daily (inside cleanup tick)", "interval_seconds": 86400},
    {"name": "backup", "source": "backup.py", "schedule": "on-demand export", "interval_seconds": None},
]


def _parse_ts(ts) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(ts))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


@router.get("/api/admin/jobs")
async def admin_jobs(user: dict = Depends(require_admin)):
    """Cron overseer: aggregate cron.py job definitions, cron-type custom
    monitor checks, and the backup last_run. Read-only."""
    now = datetime.now(timezone.utc)
    defs = [dict(j) for j in JOBS]

    try:
        from routers.monitor import _get_custom_monitors
        customs = [m for m in _get_custom_monitors(enabled_only=False)
                   if (m.get("type") == "cron")]
    except Exception as e:
        logger.warning("admin_jobs: custom monitors unavailable: %s", e)
        customs = []
    for m in customs:
        try:
            interval = max(1, int(m.get("interval_seconds") or 60))
        except (TypeError, ValueError):
            interval = 60
        defs.append({"name": str(m.get("target") or "unknown"), "source": "monitor-checks",
                     "schedule": f"every {interval}s", "interval_seconds": interval})

    # backup.py keeps no schedule/last_run itself — use the latest audited
    # backup export as its last_run (audit_logs may be on either schema).
    backup_last = None
    for col in ("action", "event"):
        try:
            res = supabase.table("audit_logs").select("created_at") \
                .like(col, "backup_export%").order("created_at", desc=True).limit(1).execute()
            if res.data:
                backup_last = res.data[0].get("created_at")
            break
        except Exception:
            continue

    beats: dict = {}
    try:
        names = sorted({d["name"] for d in defs})
        res = supabase.table("job_heartbeats").select("job,last_run_at,last_status") \
            .in_("job", names).execute()
        for row in (res.data or []):
            beats[row.get("job")] = row
    except Exception as e:
        logger.warning("admin_jobs: heartbeats unavailable: %s", e)

    out = []
    for d in defs:
        name = d["name"]
        interval_s = d.get("interval_seconds")
        beat = beats.get(name) or {}
        last_run = beat.get("last_run_at") or (backup_last if name == "backup" else None)
        dt = _parse_ts(last_run) if last_run else None
        next_run = (dt + timedelta(seconds=interval_s)).isoformat() if (dt and interval_s) else None
        late = False
        if interval_s:
            late = True if dt is None else (now - dt).total_seconds() > 2 * interval_s
        out.append({"name": name, "source": d["source"], "schedule": d.get("schedule"),
                    "last_run": dt.isoformat() if dt else None,
                    "last_status": beat.get("last_status"),
                    "next_run": next_run, "late": late})
    return out


async def run_cleanup() -> dict:
    """Daily cleanup shared by the Vercel cron endpoint AND the in-process
    APScheduler job (Railway), so both deployments stay in sync."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    from routers.monitor import record_job_heartbeat

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
    logger.warning("cron_cleanup: mail dispatch summary %s", mail)
    record_job_heartbeat(
        "cron-cleanup", "ok",
        f"mail claimed={mail.get('claimed', 0)} sent={mail.get('sent', 0)} failed={mail.get('failed', 0)}",
    )

    # Stock reservation expiry — release holds past their TTL so abandoned
    # checkouts never permanently shrink sellable inventory. The DB also runs a
    # pg_cron sweep every 5 minutes; this daily pass is the Vercel-side safety
    # net (Hobby allows a single cron, so it piggybacks on this one).
    try:
        from routers.store_ecommerce import _cleanup_pending_orders
        stock = await _cleanup_pending_orders()
        logger.info("cron_cleanup: stock expiry %s", stock)
    except Exception as e:
        logger.warning("cron_cleanup: stock reservation expiry failed: %s", e)

    # Baseline uptime check — on Hobby the cron only runs daily; frequent checks
    # are driven by the public /api/monitor/ping endpoint (external uptime service).
    monitor_summary = None
    try:
        from routers.monitor import _run_all_checks
        monitor_summary = await _run_all_checks()
        record_job_heartbeat("monitor", "ok", f"{len(monitor_summary)} checks")
    except Exception as e:
        logger.warning("cron_cleanup: monitor run failed: %s", e)
        record_job_heartbeat("monitor", "error", str(e))

    # Sentry-style daily error digest — email a summary of errors seen in the last 24h
    digest_sent = False
    try:
        from routers.monitor import _send_error_digest
        digest_sent = await _send_error_digest()
        record_job_heartbeat("error-digest", "ok", f"sent={digest_sent}")
    except Exception as e:
        logger.warning("cron_cleanup: error digest failed: %s", e)
        record_job_heartbeat("error-digest", "error", str(e))

    return {"status": "ok", "ran_at": datetime.now(timezone.utc).isoformat(),
            "mail": mail, "monitor": monitor_summary, "digest_sent": digest_sent}
