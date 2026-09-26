"""fivem_bans_api.py — Ban routes (CRUD implementations live here).

txAdmin push helpers (`_push_ban_to_txadmin` / create / unban) remain in
routers/fivem.py until those are split too.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import txadmin_service as txa
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from database import supabase
from dependencies import require_admin, require_staff
from routers.fivem_models import BanCreate, BanSyncAck, BanUpdate, _check_token
from utils.audit import record as _audit
from utils.fivem_bans import (
    _ban_duration_txadmin,
    _ban_expires_at,
    _ban_expire_epoch,
    _parse_datetime,
    _resolve_net_id,
)
from utils.fivem_emails import _send_whitelist_email
from utils.fivem_ids import (
    _find_whitelist_by_identifiers,
    _first_identifier,
    _normalize_identifier_list,
    _primary_ban_identifier,
)
from utils.fivem_shared import now as _now
from utils.fivem_shared import push_realtime as _push_realtime

log = logging.getLogger("fivem.bans")
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



async def _push_ban_to_txadmin(ban_id: str) -> dict:
    """Apply a website ban through txAdmin; marks the row synced on success."""
    try:
        res = supabase.table("fivem_bans").select("*").eq("id", ban_id).execute()
        ban = (res.data or [None])[0]
        if not ban or not ban.get("active"):
            return {"ok": False, "skipped": True}
        ids = _normalize_identifier_list(ban.get("all_ids"))
        ident = (ban.get("identifier") or "").strip()
        if ident and ident not in ids:
            ids.insert(0, ident)
        reason = ban.get("reason") or "Banned via aifazi.net"
        duration = _ban_duration_txadmin(ban)
        action_id: str | None = None
        net_id = _resolve_net_id(ids)
        if net_id:
            ok, result = await txa.ban_online_player(int(net_id), reason, duration)
            action_id = result if ok else None
        else:
            ok, result = await txa.ban_by_identifiers(ids, ban.get("player_name") or "Unknown", reason, duration)
            action_id = result if ok else None
        if ok:
            supabase.table("fivem_bans").update({
                "txadmin_synced": True,
                "source": "txadmin",
                "txadmin_action_id": action_id,
            }).eq("id", ban_id).execute()
            await _push_realtime("player_banned_synced", {
                "ban_id": ban_id,
                "identifier": ident or (ids[0] if ids else None),
            })
            return {"ok": True}
        supabase.table("fivem_bans").update({
            "txadmin_synced": False,
            "source": "txadmin_failed",
            "txadmin_action_id": None,
        }).eq("id", ban_id).execute()
        await _push_realtime("player_ban_sync_failed", {
            "ban_id": ban_id,
            "error": str(action_id)[:200],
        })
        return {"ok": False, "error": action_id}
    except Exception as exc:
        log.warning("txAdmin ban push failed for %s: %s", ban_id, exc)
        return {"ok": False, "error": str(exc)}


async def _push_unban_to_txadmin(ban_id: str) -> dict:
    """Revoke a txAdmin ban by its stored actionId; marks the row synced on success."""
    try:
        res = supabase.table("fivem_bans").select("*").eq("id", ban_id).execute()
        ban = (res.data or [None])[0]
        if not ban or ban.get("active"):
            return {"ok": False, "skipped": True}
        action_id = (ban.get("txadmin_action_id") or "").strip()
        if not action_id:
            supabase.table("fivem_bans").update({
                "txadmin_synced": False,
                "source": "txadmin_revoke_failed",
            }).eq("id", ban_id).execute()
            return {"ok": False, "error": "no_action_id"}
        ok, msg = await txa.revoke_ban(action_id)
        if ok:
            supabase.table("fivem_bans").update({
                "txadmin_synced": True,
                "source": "txadmin_revoked",
            }).eq("id", ban_id).execute()
            await _push_realtime("player_unbanned_synced", {"ban_id": ban_id})
            return {"ok": True}
        supabase.table("fivem_bans").update({
            "txadmin_synced": False,
            "source": "txadmin_revoke_failed",
        }).eq("id", ban_id).execute()
        await _push_realtime("player_unban_sync_failed", {
            "ban_id": ban_id,
            "error": str(msg)[:200],
        })
        return {"ok": False, "error": msg}
    except Exception as exc:
        log.warning("txAdmin unban push failed for %s: %s", ban_id, exc)
        return {"ok": False, "error": str(exc)}


async def create_ban(
    body: BanCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    """
    Create a website ban and queue it for the FiveM/qbx_core resource to sync.
    """
    username = user.get("username", "admin")

    ids = _normalize_identifier_list(body.identifiers)
    if body.identifier and body.identifier.strip() not in ids:
        ids.append(body.identifier.strip())
    if not ids:
        raise HTTPException(400, "At least one identifier is required")

    primary_id = _primary_ban_identifier(ids)
    if not primary_id:
        raise HTTPException(400, "At least one identifier is required")

    try:
        expires_at = _ban_expires_at(body.duration, body.expires_at)
    except ValueError:
        raise HTTPException(400, "Invalid ban expiry time")
    if (body.duration or "").strip().lower() == "custom" and not expires_at:
        raise HTTPException(400, "Custom duration requires an expiry time")
    parsed_expiry = _parse_datetime(expires_at)
    if parsed_expiry and parsed_expiry <= datetime.now(timezone.utc):
        raise HTTPException(400, "Ban expiry must be in the future")

    for ident in ids:
        existing = (supabase.table("fivem_bans").select("id")
                    .eq("identifier", ident).eq("active", True).execute())
        if existing.data:
            raise HTTPException(409, "Player already has an active ban")

    ban_row = {
        "identifier":  primary_id,
        "all_ids":     ids,
        "player_name": body.player_name,
        "reason":      body.reason,
        "duration":    body.duration,
        "expires_at":  expires_at,
        "banned_by":   username,
        "banned_at":   _now(),
        "active":      True,
        "source":      "website",
        "txadmin_synced": False,
        "txadmin_action_id": None,
    }
    res = supabase.table("fivem_bans").insert(ban_row).execute()
    ban = (res.data or [{}])[0]
    ban_id = ban.get("id")

    background_tasks.add_task(_push_ban_to_txadmin, ban_id)

    await _push_realtime("player_banned_website", {
        "ban_id":      ban_id,
        "identifier":  primary_id,
        "player_name": body.player_name,
        "reason":      body.reason,
        "duration":    body.duration,
        "banned_by":   username,
        "core_sync":   False,
    })

    matched_app = _find_whitelist_by_identifiers(ids)
    if matched_app:
        await _send_whitelist_email(matched_app, "banned", body.reason, {
            "expires_at": expires_at,
            "duration": body.duration,
        })

    return {"message": "Player banned â€” queued for server sync.", "ban": ban}


async def unban_player(
    ban_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    """
    Lift a ban on the website and revoke it via txAdmin in the background.
    """
    ban_res = supabase.table("fivem_bans").select("*").eq("id", ban_id).execute()
    if not ban_res.data: raise HTTPException(404, "Ban not found")
    ban = ban_res.data[0]
    username = user.get("username", "admin")

    # Update DB immediately
    supabase.table("fivem_bans").update({
        "active":       False,
        "unbanned_by":  username,
        "unbanned_at":  _now(),
        "source":       "txadmin_unban_pending",
        "txadmin_synced": False,
    }).eq("id", ban_id).execute()

    background_tasks.add_task(_push_unban_to_txadmin, ban_id)

    await _push_realtime("player_unbanned_website", {
        "ban_id":     ban_id,
        "identifier": ban.get("identifier"),
        "unbanned_by": username,
        "core_sync": False,
    })

    ids = _normalize_identifier_list(ban.get("all_ids"))
    ident = (ban.get("identifier") or "").strip()
    if ident and ident not in ids:
        ids.insert(0, ident)
    matched_app = _find_whitelist_by_identifiers(ids)
    if matched_app:
        await _send_whitelist_email(matched_app, "unbanned")

    return {"message": "Player unbanned â€” queued for server sync.", "ban": ban}
