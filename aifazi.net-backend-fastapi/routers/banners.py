"""routers/banners.py
Frontend AnnouncementsPanel calls:
  GET    /admin/banners/all          → all banners (staff)
  GET    /admin/banners              → active only, not expired, past scheduled (public)
  POST   /admin/banners              → create
  PATCH  /admin/banners/:id          → partial update (e.g. toggle active)
  PUT    /admin/banners/:id          → full update
  DELETE /admin/banners/:id          → delete

Required SQL migration (run once in Supabase SQL editor):
  ALTER TABLE banners ADD COLUMN IF NOT EXISTS link_label  TEXT        DEFAULT '';
  ALTER TABLE banners ADD COLUMN IF NOT EXISTS pinned      BOOLEAN     DEFAULT false;
  ALTER TABLE banners ADD COLUMN IF NOT EXISTS style       TEXT        DEFAULT 'banner';
  ALTER TABLE banners ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
  ALTER TABLE banners ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

  -- Enable Realtime so browser tabs update without reload:
  ALTER TABLE banners REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE banners;
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from database import supabase
from dependencies import require_staff
from utils.cache import delete as cache_delete
from utils.cache import get as cache_get
from utils.cache import set as cache_set

logger = logging.getLogger(__name__)

router = APIRouter()


def _map_fields(body: dict) -> dict:
    """Map frontend camelCase → DB snake_case; filter to allowed columns."""
    return {
        k: v for k, v in {
            "message":      body.get("message", ""),
            "type":         body.get("type", "info"),
            "link":         body.get("link", ""),
            "link_label":   body.get("linkLabel") or body.get("link_label", ""),
            "active":       body.get("active", True),
            "pinned":       body.get("pinned", False),
            "style":        body.get("style", "banner"),
            "scheduled_at": body.get("scheduledAt") or body.get("scheduled_at") or None,
            "expires_at":   body.get("expiresAt")   or body.get("expires_at")   or None,
        }.items() if v is not None or k in ("scheduled_at", "expires_at")
    }


def _parse_dt(value):
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _expire_due_banners(now_dt: datetime) -> int:
    """Persist auto-expired banners so admin state matches public visibility."""
    now = now_dt.isoformat()
    try:
        due = (
            supabase.table("banners")
            .select("id")
            .eq("active", True)
            .lte("expires_at", now)
            .execute()
        )
    except Exception as exc:
        logger.warning("banners: failed to check expired rows (%s)", exc)
        return 0

    ids = [row.get("id") for row in (due.data or []) if row.get("id")]
    if not ids:
        return 0

    try:
        supabase.table("banners").update({"active": False}).in_("id", ids).execute()
    except Exception as exc:
        logger.warning("banners: failed to expire batch (%s)", exc)

    return len(ids)


def _is_visible(b: dict, now_dt: datetime) -> bool:
    """Return True if banner should be shown to the public right now."""
    if not b.get("active"):
        return False
    ea = _parse_dt(b.get("expires_at"))
    if ea and ea <= now_dt:
        return False          # expired
    sa = _parse_dt(b.get("scheduled_at"))
    if sa and sa > now_dt:
        return False          # not yet scheduled
    return True


@router.get("")
async def list_banners():
    """Public endpoint — returns only banners visible right now.
    Fixes NODE-14: wraps DB call in try/except so a Supabase 502 (cold-start
    or transient outage) returns [] instead of an unhandled exception crash.
    """
    now_dt = datetime.now(timezone.utc)
    await _expire_due_banners(now_dt)
    cached = cache_get("banners_public")
    if cached is not None:
        return cached
    try:
        res = supabase.table("banners").select("*").eq("active", True).execute()
    except Exception as exc:
        logger.warning("banners: Supabase unavailable (%s) — returning []", exc)
        return []
    # Cleanup-3 — the early `return` above made cache_set unreachable, so every
    # public banners request hit Supabase directly. Compute first, cache, then return.
    result = [b for b in (res.data or []) if _is_visible(b, now_dt)]
    cache_set("banners_public", result, ttl=30)
    return result


@router.get("/all")
async def list_all(_: dict = Depends(require_staff)):
    """Admin: all banners regardless of active state.
    Fixes NODE-14: same 502-safe wrapper.
    """
    await _expire_due_banners(datetime.now(timezone.utc))
    try:
        res = supabase.table("banners").select("*").order("created_at", desc=True).execute()
    except Exception as exc:
        logger.warning("banners/all: Supabase unavailable (%s) — returning []", exc)
        return []
    return res.data or []


@router.post("")
async def create_banner(request: Request, _: dict = Depends(require_staff)):
    body = await request.json()
    if not body.get("message", "").strip():
        raise HTTPException(400, "message required")
    payload = _map_fields(body)
    res = supabase.table("banners").insert(payload).execute()
    cache_delete("banners_public")
    return res.data[0]


@router.put("/{banner_id}")
async def update_banner(banner_id: str, request: Request, _: dict = Depends(require_staff)):
    body = await request.json()
    if not body.get("message", "").strip():
        raise HTTPException(400, "message required")
    payload = _map_fields(body)
    res = supabase.table("banners").update(payload).eq("id", banner_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    cache_delete("banners_public")
    return res.data[0]


@router.patch("/{banner_id}")
async def patch_banner(banner_id: str, request: Request, _: dict = Depends(require_staff)):
    body = await request.json()
    if not body:
        raise HTTPException(400, "No fields to update")
    res = supabase.table("banners").update(body).eq("id", banner_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    cache_delete("banners_public")
    return res.data[0]


@router.delete("/{banner_id}")
async def delete_banner(banner_id: str, _: dict = Depends(require_staff)):
    supabase.table("banners").delete().eq("id", banner_id).execute()
    cache_delete("banners_public")
    return {"message": "Deleted"}
