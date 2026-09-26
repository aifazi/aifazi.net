"""fivem_whitelist_api.py — Whitelist / application-action routes.

Thin wrappers over routers/fivem.py handlers (same pattern as
fivem_bans_api.py / auth_staff.py). Included first from fivem.py.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from dependencies import get_current_user, require_admin, require_staff

router = APIRouter()


@router.get("/whitelist/my-application")
async def my_whitelist_application(user: dict = Depends(get_current_user)):
    from routers.fivem import my_whitelist_application as _mono

    return await _mono(user)


@router.post("/whitelist/apply")
async def apply_whitelist(payload: dict, user: dict = Depends(get_current_user)):
    from routers.fivem_models import WhitelistApply
    from routers.fivem import apply_whitelist as _mono

    return await _mono(WhitelistApply(**(payload or {})), user)


@router.get("/whitelist/check/{identifier}")
async def check_whitelist(request: Request, identifier: str):
    from routers.fivem import check_whitelist as _mono

    return await _mono(request, identifier)


@router.get("/whitelist/search")
async def search_whitelist(
    q: str = "",
    status: str | None = None,
    limit: int = 50,
    _: dict = Depends(require_staff),
):
    from routers.fivem import search_whitelist as _mono

    return await _mono(q, status, limit, _)


@router.get("/whitelist")
async def list_whitelist(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    since_seconds: int | None = None,
    _: dict = Depends(require_staff),
):
    from routers.fivem import list_whitelist as _mono

    return await _mono(status, limit, offset, since_seconds, _)


@router.get("/whitelist/history")
async def whitelist_history(limit: int = 100, _: dict = Depends(require_staff)):
    from routers.fivem import whitelist_history as _mono

    return await _mono(limit, _)


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


@router.get("/whitelist/{app_id}")
async def get_whitelist_app(app_id: str, _: dict = Depends(require_staff)):
    from routers.fivem import get_whitelist_app as _mono

    return await _mono(app_id, _)


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


@router.delete("/whitelist/{app_id}")
async def delete_whitelist_app(app_id: str, _: dict = Depends(require_admin)):
    from routers.fivem import delete_whitelist_app as _mono

    return await _mono(app_id, _)


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
