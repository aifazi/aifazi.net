"""fivem_bans_api.py — Ban routes (CRUD implementations live here).

txAdmin push helpers (`_push_ban_to_txadmin` / create / unban) remain in
routers/fivem.py until those are split too.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from database import supabase
from dependencies import require_admin, require_staff
from routers.fivem_models import BanCreate, BanSyncAck, BanUpdate, _check_token
from utils.fivem_bans import _ban_duration_txadmin, _ban_expire_epoch
from utils.fivem_ids import _first_identifier, _normalize_identifier_list, _primary_ban_identifier

router = APIRouter()


@router.get("/bans")
async def list_bans(active: bool | None = None, limit: int = 50, offset: int = 0,
                    _: dict = Depends(require_staff)):
    q = supabase.table("fivem_bans").select("*", count="exact")
    if active is not None:
        q = q.eq("active", active)
    res = q.order("banned_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"bans": res.data or [], "total": res.count or 0}


@router.get("/bans/pending-sync")
async def pending_ban_sync(request: Request, limit: int = 25):
    _check_token(request)
    res = (supabase.table("fivem_bans").select("*")
           .eq("active", True)
           .eq("txadmin_synced", False)
           .order("banned_at", desc=False)
           .limit(limit)
           .execute())
    rows: list[dict] = []
    for ban in res.data or []:
        ids = _normalize_identifier_list(ban.get("all_ids"))
        ident = (ban.get("identifier") or "").strip()
        if ident and ident not in ids:
            ids.insert(0, ident)
        rows.append({
            "id": ban.get("id"),
            "identifier": ident or _primary_ban_identifier(ids),
            "identifiers": ids,
            "license": _first_identifier(ids, ("license:", "license2:")),
            "discord": _first_identifier(ids, ("discord:",)),
            "player_name": ban.get("player_name") or "Unknown",
            "reason": ban.get("reason") or "Banned",
            "duration": _ban_duration_txadmin(ban),
            "banned_by": ban.get("banned_by") or "website",
            "expires_at": ban.get("expires_at"),
            "expire": _ban_expire_epoch(ban.get("expires_at")),
        })
    return rows


@router.get("/bans/pending-unban")
async def pending_unban_sync(request: Request, limit: int = 25):
    _check_token(request)
    res = (supabase.table("fivem_bans").select("*")
           .eq("active", False)
           .eq("txadmin_synced", False)
           .in_("source", ("qbx_unban_pending", "txadmin_unban_pending", "txadmin_revoke_failed"))
           .order("unbanned_at", desc=False)
           .limit(limit)
           .execute())
    rows: list[dict] = []
    for ban in res.data or []:
        ids = _normalize_identifier_list(ban.get("all_ids"))
        ident = (ban.get("identifier") or "").strip()
        if ident and ident not in ids:
            ids.insert(0, ident)
        rows.append({
            "id": ban.get("id"),
            "identifier": ident or _primary_ban_identifier(ids),
            "identifiers": ids,
            "license": _first_identifier(ids, ("license:", "license2:")),
            "discord": _first_identifier(ids, ("discord:",)),
        })
    return rows


@router.post("/bans/mark-synced")
async def mark_ban_synced(body: BanSyncAck, request: Request):
    _check_token(request)
    ban_res = supabase.table("fivem_bans").select("id,active,source").eq("id", body.ban_id).execute()
    if not ban_res.data:
        raise HTTPException(404, "Ban not found")
    ban = ban_res.data[0]
    active = bool(ban.get("active"))
    updates = {
        "txadmin_synced": body.ok,
        "source": "qbx_core" if body.ok and active else "qbx_core_unbanned" if body.ok else ban.get("source") or "qbx_sync_failed",
    }
    supabase.table("fivem_bans").update(updates).eq("id", body.ban_id).execute()
    return {"ok": True, "synced": body.ok}


@router.patch("/bans/{ban_id}")
async def update_ban(ban_id: str, body: BanUpdate, _: dict = Depends(require_staff)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = supabase.table("fivem_bans").update(updates).eq("id", ban_id).execute()
    return {"message": "Ban updated.", "ban": (res.data or [{}])[0]}


@router.delete("/bans/{ban_id}")
async def delete_ban(ban_id: str, _: dict = Depends(require_admin)):
    supabase.table("fivem_bans").delete().eq("id", ban_id).execute()
    return {"message": "Ban removed."}


# ── Heavy create/unban still live in fivem.py (txAdmin + email + audit) ──────
@router.post("/bans")
async def create_ban(payload: dict, background_tasks: BackgroundTasks, user: dict = Depends(require_staff)):
    from routers.fivem import create_ban as _mono

    return await _mono(BanCreate(**(payload or {})), background_tasks, user)


@router.post("/bans/{ban_id}/unban")
async def unban_player(ban_id: str, background_tasks: BackgroundTasks, user: dict = Depends(require_staff)):
    from routers.fivem import unban_player as _mono

    return await _mono(ban_id, background_tasks, user)
