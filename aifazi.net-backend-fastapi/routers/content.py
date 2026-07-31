"""routers/content.py — Editable content blocks for frontend"""
from fastapi import APIRouter, Depends
from database import supabase
from dependencies import require_staff
from utils.cache import get as cache_get, set as cache_set
router = APIRouter()

def _unwrap(val):
    """Unwrap double-nested {"value": x} that occurs when the DB stores
    the full PUT body (which includes the 'value' key) instead of just the value."""
    if isinstance(val, dict) and list(val.keys()) == ["value"]:
        return val["value"]
    return val

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
async def upsert_block(key: str, body: dict, _: dict = Depends(require_staff)):
    # Unwrap before saving so we never double-nest again
    value = _unwrap(body)
    from utils.cache import delete as cache_delete
    res = supabase.table("content_blocks").upsert({"key": key, "value": value}, on_conflict="key").execute()
    cache_delete("content_blocks")
    return res.data[0]

@router.delete("/{key}")
async def delete_block(key: str, _: dict = Depends(require_staff)):
    from utils.cache import delete as cache_delete
    supabase.table("content_blocks").delete().eq("key", key).execute()
    cache_delete("content_blocks")
    return {"message": "Deleted"}
