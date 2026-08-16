"""routers/content.py — Editable content blocks for frontend"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from database import supabase
from dependencies import require_staff
from utils.cache import get as cache_get
from utils.cache import set as cache_set
from utils.cache import delete as cache_delete
from utils import audit

router = APIRouter()
logger = logging.getLogger("content")

MAX_REVISIONS_PER_KEY = 50

def _unwrap(val):
    """Unwrap double-nested {"value": x} that occurs when the DB stores
    the full PUT body (which includes the 'value' key) instead of just the value."""
    if isinstance(val, dict) and list(val.keys()) == ["value"]:
        return val["value"]
    return val

def _client_ip(request: Request) -> str:
    try:
        return (request.client.host if request.client else "") or ""
    except Exception:
        return ""

def _insert_revision(key: str, value, editor: str):
    """Best-effort snapshot of the PREVIOUS value before an overwrite.
    Never raises — if the content_revisions table doesn't exist yet (migration
    pending) we just skip versioning; the live value still saves fine."""
    if supabase is None:
        return
    try:
        supabase.table("content_revisions").insert({
            "key": key,
            "value": value,
            "editor": editor or "",
        }).execute()
        # Prune to the newest MAX_REVISIONS_PER_KEY rows per key
        try:
            rows = supabase.table("content_revisions").select("id").eq("key", key).order("created_at", desc=True).limit(1000).execute()
            ids = [r["id"] for r in (rows.data or [])]
            if len(ids) > MAX_REVISIONS_PER_KEY:
                supabase.table("content_revisions").delete().eq("key", key).in_("id", ids[MAX_REVISIONS_PER_KEY:]).execute()
        except Exception as exc:
            logger.warning("content prune revisions failed: %s", exc)
    except Exception as exc:
        logger.warning("content revision insert skipped (table missing?): %s", exc)

@router.get("")
async def get_all():
    cached = cache_get("content_blocks")
    if cached is not None:
        return cached
    res = supabase.table("content_blocks").select("*").limit(500).execute()
    result = {r["key"]: _unwrap(r["value"]) for r in (res.data or [])}
    cache_set("content_blocks", result, ttl=30)
    return result

@router.get("/{key}")
async def get_block(key: str):
    # Supabase `.single()` returns 406 when a row is missing. Page config blocks
    # are optional, so missing content must be a harmless empty object.
    res = supabase.table("content_blocks").select("value").eq("key", key).limit(1).execute()
    row = res.data[0] if res.data else None
    return _unwrap(row["value"]) if row else {}

@router.put("/{key}")
async def upsert_block(key: str, body: dict, request: Request, staff: dict = Depends(require_staff)):
    # Unwrap before saving so we never double-nest again
    value = _unwrap(body)
    actor = staff.get("username") or "system"

    # Version history: snapshot the previous value before overwriting it.
    old = None
    try:
        res = supabase.table("content_blocks").select("value").eq("key", key).limit(1).execute()
        row = res.data[0] if res.data else None
        if row:
            old = _unwrap(row["value"])
    except Exception:
        pass

    res = supabase.table("content_blocks").upsert({"key": key, "value": value}, on_conflict="key").execute()
    cache_delete("content_blocks")

    if old is not None and old != value:
        _insert_revision(key, old, actor)

    audit.record(actor, "content.update", key, {"value_type": "string" if isinstance(value, str) else type(value).__name__}, _client_ip(request))
    return res.data[0]

@router.delete("/{key}")
async def delete_block(key: str, request: Request, staff: dict = Depends(require_staff)):
    supabase.table("content_blocks").delete().eq("key", key).execute()
    cache_delete("content_blocks")
    audit.record(staff.get("username") or "system", "content.delete", key, {}, _client_ip(request))
    return {"message": "Deleted"}

@router.get("/{key}/revisions")
async def list_revisions(key: str, _: dict = Depends(require_staff)):
    """Version history for a content block (newest first)."""
    try:
        rows = supabase.table("content_revisions").select("id,key,value,editor,created_at").eq("key", key).order("created_at", desc=True).limit(MAX_REVISIONS_PER_KEY).execute()
    except Exception as exc:
        logger.warning("content revisions list failed: %s", exc)
        rows = type("R", (), {"data": []})()
    return rows.data or []

@router.post("/{key}/restore")
async def restore_revision(key: str, body: dict, request: Request, staff: dict = Depends(require_staff)):
    """Restore a saved revision onto the live content_blocks value."""
    revision_id = (body or {}).get("revision_id")
    if not revision_id:
        raise HTTPException(status_code=400, detail="revision_id required")
    try:
        res = supabase.table("content_revisions").select("id,key,value").eq("key", key).eq("id", revision_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Revisions unavailable: {exc}")
    row = res.data[0] if res.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Revision not found")

    value = _unwrap(row["value"])
    supabase.table("content_blocks").upsert({"key": key, "value": value}, on_conflict="key").execute()
    cache_delete("content_blocks")
    audit.record(staff.get("username") or "system", "content.restore", key, {"revision_id": revision_id}, _client_ip(request))
    return {"key": key, "value": value}