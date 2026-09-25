"""fivem_status_api.py — Server status / players / stats / cron routes.

Thin wrappers over routers/fivem.py handlers (same pattern as
fivem_whitelist_api.py). Included first from fivem.py.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from dependencies import require_admin, require_staff

router = APIRouter()


@router.post("/status")
async def update_server_status(payload: dict, request: Request):
    from routers.fivem import StatusUpdate
    from routers.fivem import update_server_status as _mono

    return await _mono(StatusUpdate(**(payload or {})), request)


@router.get("/status")
async def get_server_status():
    from routers.fivem import get_server_status as _mono

    return await _mono()


@router.get("/status/overview")
async def get_public_status_overview(hours: int = 24):
    from routers.fivem import get_public_status_overview as _mono

    return await _mono(hours)


@router.post("/status/refresh")
async def refresh_status_timestamp(user: dict = Depends(require_staff)):
    from routers.fivem import refresh_status_timestamp as _mono

    return await _mono(user)


@router.patch("/dev-override")
async def set_dev_override(payload: dict, _: dict = Depends(require_admin)):
    from routers.fivem import DevOverride
    from routers.fivem import set_dev_override as _mono

    return await _mono(DevOverride(**(payload or {})), _)


@router.get("/history")
async def get_status_history(hours: int = 24, _: dict = Depends(require_staff)):
    from routers.fivem import get_status_history as _mono

    return await _mono(hours, _)


@router.post("/players")
async def update_players(request: Request, background_tasks: BackgroundTasks):
    from routers.fivem import update_players as _mono

    return await _mono(request, background_tasks)


@router.get("/players")
async def get_players(_: dict = Depends(require_staff)):
    from routers.fivem import get_players as _mono

    return await _mono(_)


@router.post("/cron/cleanup")
async def cron_cleanup(request: Request):
    from routers.fivem import cron_cleanup as _mono

    return await _mono(request)


@router.get("/stats")
async def fivem_stats(_: dict = Depends(require_staff)):
    from routers.fivem import fivem_stats as _mono

    return await _mono(_)


@router.get("/players/records")
async def list_player_records(
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    _: dict = Depends(require_staff),
):
    from routers.fivem import list_player_records as _mono

    return await _mono(q, limit, offset, _)


@router.get("/players/records/{license_key}")
async def get_player_record(license_key: str, _: dict = Depends(require_staff)):
    from routers.fivem import get_player_record as _mono

    return await _mono(license_key, _)


@router.get("/players/sessions")
async def list_player_sessions(
    license_key: str = "",
    limit: int = 50,
    offset: int = 0,
    _: dict = Depends(require_staff),
):
    from routers.fivem import list_player_sessions as _mono

    return await _mono(license_key, limit, offset, _)


@router.post("/players/join")
async def record_player_join(payload: dict, request: Request):
    from routers.fivem import PlayerJoinBody
    from routers.fivem import record_player_join as _mono

    return await _mono(PlayerJoinBody(**(payload or {})), request)


@router.post("/players/leave")
async def record_player_leave(payload: dict, request: Request):
    from routers.fivem import PlayerLeaveBody
    from routers.fivem import record_player_leave as _mono

    return await _mono(PlayerLeaveBody(**(payload or {})), request)


@router.post("/players/heartbeat-sync")
async def heartbeat_sync_players(payload: dict, request: Request):
    from routers.fivem import PlayerHeartbeatBody
    from routers.fivem import heartbeat_sync_players as _mono

    return await _mono(PlayerHeartbeatBody(**(payload or {})), request)
