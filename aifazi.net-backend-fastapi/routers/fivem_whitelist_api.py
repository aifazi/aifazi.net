"""fivem_whitelist_api.py — Whitelist / application-action routes.

Thin wrappers over routers/fivem.py handlers (same pattern as
fivem_bans_api.py / auth_staff.py). Included first from fivem.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from database import safe_search_term, supabase
from dependencies import get_current_user, require_admin, require_staff
from routers.fivem_models import _check_token
from utils.fivem_shared import active_priority as _active_priority

log = logging.getLogger("fivem.whitelist")
router = APIRouter()

@router.get("/whitelist/check/{identifier}")
async def check_whitelist(request: Request, identifier: str):
    _check_token(request)
    q = supabase.table("fivem_whitelist").select(
        "status,steam_hex,fivem_id,fivem_license,character_name,priority_tier,priority_level,priority_expires_at"
    ).eq("status", "approved")
    if identifier.startswith("license:"):
        q = q.eq("fivem_license", identifier)
    elif identifier.startswith("steam:"):
        q = q.eq("steam_hex", identifier)
    elif identifier.startswith("fivem:"):
        q = q.eq("fivem_id", identifier)
    else:
        q = q.eq("discord_id", identifier)
    res = q.execute()
    if not res.data:
        return {"whitelisted": False}
    app = res.data[0]
    # Do NOT echo the matched row's other identifiers back to an unauthenticated caller.
    return {
        "whitelisted": True,
        "status": app.get("status"),
        "character_name": app.get("character_name"),
        "priority": _active_priority(app),
    }


@router.get("/whitelist/search")
async def search_whitelist(
    q: str = "",
    status: str | None = None,
    limit: int = 50,
    _: dict = Depends(require_staff),
):
    query = supabase.table("fivem_whitelist").select("*", count="exact")
    if status:
        query = query.eq("status", status)

    if q and q.strip():
        t = safe_search_term(q.strip())
        if not t:
            return {"applications": [], "total": 0, "query": q}
        try:
            res = query.or_(
                f"discord_name.ilike.%{t}%,"
                f"discord_id.ilike.%{t}%,"
                f"character_name.ilike.%{t}%,"
                f"fivem_id.ilike.%{t}%,"
                f"fivem_license.ilike.%{t}%,"
                f"steam_hex.ilike.%{t}%,"
                f"email.ilike.%{t}%"
            ).order("applied_at", desc=True).limit(limit).execute()
            return {"applications": res.data or [], "total": res.count or 0, "query": q}
        except Exception as e:
            if "email" in str(e).lower():
                log.warning("email column missing in fivem_whitelist — searching without it")
                query2 = supabase.table("fivem_whitelist").select("*", count="exact")
                if status:
                    query2 = query2.eq("status", status)
                res2 = query2.or_(
                    f"discord_name.ilike.%{t}%,"
                    f"discord_id.ilike.%{t}%,"
                    f"character_name.ilike.%{t}%,"
                    f"fivem_id.ilike.%{t}%,"
                    f"fivem_license.ilike.%{t}%,"
                    f"steam_hex.ilike.%{t}%"
                ).order("applied_at", desc=True).limit(limit).execute()
                return {"applications": res2.data or [], "total": res2.count or 0, "query": q}
            raise

    res = query.order("applied_at", desc=True).limit(limit).execute()
    return {"applications": res.data or [], "total": res.count or 0, "query": q}


@router.get("/whitelist")
async def list_whitelist(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    since_seconds: int | None = None,
    _: dict = Depends(require_staff),
):
    q = supabase.table("fivem_whitelist").select("*", count="exact")
    if status:
        q = q.eq("status", status)
    if since_seconds:
        since_iso = (datetime.now(timezone.utc) - timedelta(seconds=since_seconds)).isoformat()
        q = q.gte("reviewed_at", since_iso)
    res = q.order("applied_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"applications": res.data or [], "total": res.count or 0}


@router.get("/whitelist/history")
async def whitelist_history(limit: int = 100, _: dict = Depends(require_staff)):
    res = (supabase.table("fivem_whitelist")
           .select("id,discord_name,character_name,status,reviewed_by,reviewed_at,"
                   "approved_at,sync_source,txadmin_synced,steam_hex,fivem_license,fivem_id,"
                   "priority_tier,priority_level,priority_expires_at")
           .eq("status", "approved")
           .order("approved_at", desc=True)
           .limit(limit)
           .execute())
    rows = res.data or []
    source_labels = {
        "website_approved": ("Approved on website", "#00D4FF"),
        "website_manual": ("Manual add (website)", "#a78bfa"),
        "txadmin": ("Approved in txAdmin panel", "#facc15"),
        "txadmin_join": ("Auto-approved on join", "#00FF88"),
        "txadmin_removed": ("Removed in txAdmin", "#ff4757"),
        "website": ("Website", "#00D4FF"),
        "pre_v4_migration": ("Pre-v4 migration", "#6b7280"),
    }
    for r in rows:
        src = r.get("sync_source") or "website"
        label, color = source_labels.get(src, (str(src), "#6b7280"))
        r["source_label"] = label
        r["source_color"] = color
    return {"history": rows, "total": len(rows)}


@router.get("/whitelist/{app_id}")
async def get_whitelist_app(app_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
    if not res.data:
        raise HTTPException(404, "Application not found")
    return res.data[0]


@router.delete("/whitelist/{app_id}")
async def delete_whitelist_app(app_id: str, _: dict = Depends(require_admin)):
    supabase.table("fivem_whitelist").delete().eq("id", app_id).execute()
    return {"message": "Application deleted."}



@router.get("/whitelist/my-application")
async def my_whitelist_application(user: dict = Depends(get_current_user)):
    from routers.fivem import my_whitelist_application as _mono

    return await _mono(user)


@router.post("/whitelist/apply")
async def apply_whitelist(payload: dict, user: dict = Depends(get_current_user)):
    from routers.fivem_models import WhitelistApply
    from routers.fivem import apply_whitelist as _mono

    return await _mono(WhitelistApply(**(payload or {})), user)






@router.get("/whitelist/pending-sync")
async def pending_sync(request: Request):
    from routers.fivem import pending_sync as _mono

    return await _mono(request)


@router.post("/sync/refresh")
async def refresh_server_sync(
    payload: dict | None = None,
    user: dict = Depends(require_staff),
):
    from routers.fivem_models import ServerSyncRefresh
    from routers.fivem import refresh_server_sync as _mono

    body = ServerSyncRefresh(**(payload or {})) if payload else None
    return await _mono(body, user)



@router.patch("/whitelist/{app_id}/priority")
async def update_whitelist_priority(
    app_id: str,
    payload: dict,
    user: dict = Depends(require_staff),
):
    from routers.fivem_models import WhitelistPriorityUpdate
    from routers.fivem import update_whitelist_priority as _mono

    return await _mono(app_id, WhitelistPriorityUpdate(**(payload or {})), user)


@router.patch("/whitelist/{app_id}")
async def review_whitelist(
    app_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff),
):
    from routers.fivem_models import WhitelistReview
    from routers.fivem import review_whitelist as _mono

    return await _mono(app_id, WhitelistReview(**(payload or {})), background_tasks, user)



@router.post("/whitelist/manual")
async def manual_add_whitelist(
    payload: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff),
):
    from routers.fivem_models import WhitelistManualAdd
    from routers.fivem import manual_add_whitelist as _mono

    return await _mono(WhitelistManualAdd(**(payload or {})), background_tasks, user)


@router.post("/whitelist/mark-synced")
async def mark_synced(payload: dict, request: Request):
    from routers.fivem_models import MarkSynced
    from routers.fivem import mark_synced as _mono

    return await _mono(MarkSynced(**(payload or {})), request)


@router.get("/application-actions/pending")
async def pending_application_actions(request: Request):
    from routers.fivem import pending_application_actions as _mono

    return await _mono(request)


@router.post("/application-actions/mark-synced")
async def mark_application_action_synced(payload: dict, request: Request):
    from routers.fivem_models import ApplicationActionSyncBody
    from routers.fivem import mark_application_action_synced as _mono

    return await _mono(ApplicationActionSyncBody(**(payload or {})), request)


@router.post("/whitelist/update-identifiers")
async def update_whitelist_identifiers(payload: dict, request: Request):
    from routers.fivem_models import WhitelistIdentifiersBody
    from routers.fivem import update_whitelist_identifiers as _mono

    return await _mono(WhitelistIdentifiersBody(**(payload or {})), request)


@router.post("/whitelist/bulk-approve")
async def bulk_approve_whitelist(
    payload: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff),
):
    from routers.fivem_models import BulkWhitelistApproveBody
    from routers.fivem import bulk_approve_whitelist as _mono

    return await _mono(BulkWhitelistApproveBody(**(payload or {})), background_tasks, user)
