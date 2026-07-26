# Vercel Cron Job endpoint — replaces APScheduler for scheduled cleanup tasks.
# Called daily at 03:00 UTC by Vercel (see vercel.json "crons").
# FIX #8: Logs a warning at startup if CRON_SECRET is missing in production.
import os, logging
from fastapi import APIRouter, Request, HTTPException
from database import supabase
from datetime import datetime, timedelta, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

CRON_SECRET = os.getenv("CRON_SECRET", "")

if not CRON_SECRET:
    logger.warning(
        "CRON_SECRET is not set. The /api/cron/cleanup endpoint will return 503 "
        "until the secret is configured."
    )


def _auth(request: Request):
    """Vercel passes Authorization: Bearer <CRON_SECRET> on cron calls."""
    if not CRON_SECRET:
        raise HTTPException(
            503,
            "CRON_SECRET is not configured. "
            "Add CRON_SECRET=<random-hex> to your Vercel environment variables "
            "(Settings → Environment Variables) and redeploy."
        )
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {CRON_SECRET}":
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

    return {"status": "ok", "ran_at": datetime.now(timezone.utc).isoformat()}
