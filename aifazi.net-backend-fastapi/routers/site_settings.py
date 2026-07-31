"""routers/site_settings.py

All site config is stored in a single JSONB 'settings' column to avoid
having to ALTER the table every time a new setting is added.

Migration (run once in Supabase SQL editor):
    ALTER TABLE site_config
        ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
    INSERT INTO site_config (key, settings)
        VALUES ('global', '{}')
        ON CONFLICT (key) DO NOTHING;
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from database import supabase
from dependencies import require_staff
from utils.audit import record as _audit

router = APIRouter()

def _get_row():
    res = supabase.table("site_config").select("settings").eq("key", "global").execute()
    return res.data[0] if res.data else None

def _is_corrupted(settings: dict) -> bool:
    """Detect character-indexed HTML corruption: {"0":"<","1":"!"...}
    This happens when an HTML string gets stored as JSONB instead of a dict."""
    if not isinstance(settings, dict) or not settings:
        return False
    # If ALL keys are numeric strings, the dict is a character-indexed string — corrupted
    return all(k.isdigit() for k in list(settings.keys())[:10])

@router.get("")
async def get_settings():
    row = _get_row()
    if row is None:
        supabase.table("site_config").insert({"key": "global", "settings": {}}).execute()
        return {}
    settings = row.get("settings") or {}
    # Auto-heal corrupted data — reset to {} and return empty
    if _is_corrupted(settings):
        supabase.table("site_config").update({"settings": {}}).eq("key", "global").execute()
        return {}
    return settings

@router.put("")
async def update_settings(body: dict, request: Request, staff: dict = Depends(require_staff)):
    # Strip non-settings columns so we never try to update 'id' / 'key'
    body.pop("id", None)
    body.pop("key", None)
    body.pop("settings", None)  # prevent double-nesting

    # Reject corrupted payloads before they reach the DB
    if _is_corrupted(body):
        raise HTTPException(400, "Invalid settings payload — character-indexed dict detected")

    row = _get_row()
    if row is None:
        # First save — insert row
        res = supabase.table("site_config").insert({"key": "global", "settings": body}).execute()
    else:
        # Merge with existing settings — skip corrupted existing data
        existing = row.get("settings") or {}
        if _is_corrupted(existing):
            existing = {}
        merged   = {**existing, **body}
        res = supabase.table("site_config").update({"settings": merged}).eq("key", "global").execute()

    if not res.data:
        raise HTTPException(500, "Failed to save settings")
    saved = res.data[0].get("settings") or {}

    actor = staff.get("username", "admin")
    ip    = request.client.host if request.client else ""
    _audit(actor, "settings_update", target="site_config",
           details={"changed_keys": list(body.keys())}, ip=ip)

    return saved

