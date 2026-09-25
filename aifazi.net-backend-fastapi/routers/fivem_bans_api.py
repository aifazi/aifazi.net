"""fivem_bans_api.py — Ban routes (thin wrappers over fivem.py handlers).

Included first from routers/fivem.py so these paths are registered once.
Same pattern as auth_staff.py.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel

from dependencies import require_admin, require_staff

router = APIRouter()


class BanSyncAck(BaseModel):
    ban_id: str
    ok: bool = True
    message: str | None = None


@router.get("/bans")
async def list_bans(active: bool | None = None, limit: int = 50, offset: int = 0,
                    _: dict = Depends(require_staff)):
    from routers.fivem import list_bans as _mono

    return await _mono(active, limit, offset, _)


@router.get("/bans/pending-sync")
async def pending_ban_sync(request: Request, limit: int = 25):
    from routers.fivem import pending_ban_sync as _mono

    return await _mono(request, limit)


@router.get("/bans/pending-unban")
async def pending_unban_sync(request: Request, limit: int = 25):
    from routers.fivem import pending_unban_sync as _mono

    return await _mono(request, limit)


@router.post("/bans/mark-synced")
async def mark_ban_synced(body: BanSyncAck, request: Request):
    from routers.fivem import mark_ban_synced as _mono

    return await _mono(body, request)


@router.post("/bans")
async def create_ban(payload: dict, background_tasks: BackgroundTasks, user: dict = Depends(require_staff)):
    from routers.fivem import BanCreate
    from routers.fivem import create_ban as _mono

    return await _mono(BanCreate(**(payload or {})), background_tasks, user)


@router.patch("/bans/{ban_id}")
async def update_ban(ban_id: str, payload: dict, _: dict = Depends(require_staff)):
    from routers.fivem import BanUpdate
    from routers.fivem import update_ban as _mono

    return await _mono(ban_id, BanUpdate(**(payload or {})), _)


@router.delete("/bans/{ban_id}")
async def delete_ban(ban_id: str, _: dict = Depends(require_admin)):
    from routers.fivem import delete_ban as _mono

    return await _mono(ban_id, _)


@router.post("/bans/{ban_id}/unban")
async def unban_player(ban_id: str, background_tasks: BackgroundTasks, user: dict = Depends(require_staff)):
    from routers.fivem import unban_player as _mono

    return await _mono(ban_id, background_tasks, user)
