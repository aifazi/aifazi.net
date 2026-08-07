"""
utils/scheduler.py — APScheduler for auto-publishing posts.
FIX #10: Replaced deprecated asyncio.get_event_loop() with run_coroutine_threadsafe().
"""
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from database import supabase
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# Capture the running event loop once at module import time (set during lifespan startup)
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop):
    """Call this from lifespan startup to register the running loop."""
    global _loop
    _loop = loop


def _log_newsletter_failure(fut: asyncio.Future):
    """The scheduler's newsletter fan-out runs on a thread; surface any failure
    instead of silently dropping the un-awaited Future."""
    try:
        fut.result()
    except Exception as e:
        logger.error("Newsletter send for auto-published post failed: %s", e, exc_info=True)


async def _send_newsletter_for_post(post: dict):
    from routers.newsletter import send_newsletter_for_post
    await send_newsletter_for_post(post)


@scheduler.scheduled_job(IntervalTrigger(minutes=2))
def auto_publish_posts():
    """Find posts with publish_at <= now and published=False, then publish them."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        res = (
            supabase.table("posts")
            .select("*")
            .eq("published", False)
            .lte("publish_at", now)
            .not_.is_("publish_at", "null")
            .execute()
        )
        posts = res.data or []
        for post in posts:
            supabase.table("posts").update({
                "published": True,
                "publish_at": None,
            }).eq("id", post["id"]).execute()
            logger.info(f"📅 Auto-published: \"{post['title']}\"")
            # FIX #10: use run_coroutine_threadsafe instead of deprecated get_event_loop()
            # The Future is NOT awaited by the scheduler, so attach a done-callback
            # that logs failures (they were previously swallowed silently).
            if _loop and _loop.is_running():
                fut = asyncio.run_coroutine_threadsafe(_send_newsletter_for_post(post), _loop)
                fut.add_done_callback(_log_newsletter_failure)
    except Exception as e:
        logger.error(f"Scheduler error: {e}")


# FIX #11 (Railway): In-process daily cleanup so the daily maintenance (token
# purge, mail queue drain, monitor checks, error digest) runs without a Vercel
# cron on persistent deployments. Mirrors the `0 3 * * *` vercel.json schedule.
@scheduler.scheduled_job(CronTrigger(hour=3, minute=0, timezone="UTC"))
async def daily_cleanup():
    try:
        from routers.cron import run_cleanup
        await run_cleanup()
    except Exception as e:
        logger.error(f"Daily cleanup error: {e}")
