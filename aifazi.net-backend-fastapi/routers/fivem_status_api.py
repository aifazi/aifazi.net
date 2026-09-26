"""fivem_status_api.py — Server status / players / stats / cron routes.

Simple CRUD handlers are implemented here. Heartbeat / join-leave / public
overview / stats still delegate to routers/fivem.py (txAdmin + shared
stamp helpers).
"""
from __future__ import annotations

import hmac
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from database import safe_search_term, supabase
from dependencies import require_admin, require_staff
from routers.fivem_models import (
    DevOverride,
    PlayerHeartbeatBody,
    PlayerJoinBody,
    PlayerLeaveBody,
    StatusUpdate,
    _compute_status,
    _last_seen_str,
    _uptime_str,
)

log = logging.getLogger("fivem.status")
router = APIRouter()


@router.get("/status")
async def get_server_status():
    res = supabase.table("fivem_status").select("*").eq("id", "main").execute()
    if not res.data:
        return {
            "status": "offline", "players_online": 0, "max_players": 48,
            "last_seen": None, "last_seen_label": "No heartbeat received",
            "uptime_seconds": 0, "uptime_label": "0m", "resource_count": 0,
            "server_name": "AIFAZI RP", "peak_players": 0,
            "dev_override": None, "display_message": "No heartbeat received", "fake_data": False,
        }
    d = res.data[0]
    ov = d.get("dev_override")
    uptime = d.get("uptime_seconds", 0)

    if ov == "maintenance":
        return {
            "status": "maintenance", "players_online": 0, "max_players": d.get("max_players", 48),
            "display_message": "Server is under maintenance",
            **{k: d.get(k) for k in ("server_name", "peak_players", "resource_count", "updated_at")},
            "dev_override": "maintenance", "uptime_seconds": 0, "uptime_label": "0m",
            "last_seen": d.get("updated_at"), "last_seen_label": "Maintenance Mode", "fake_data": False,
        }

    if ov == "force_online":
        return {
            "status": "online", "players_online": d.get("players_online", 0),
            "max_players": d.get("max_players", 48),
            "display_message": "Force Online override active", "dev_override": "force_online",
            "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime),
            "server_name": d.get("server_name"), "peak_players": d.get("peak_players", 0),
            "resource_count": d.get("resource_count", 0),
            "last_seen": d.get("updated_at"), "last_seen_label": "Force Online (dev)", "fake_data": False,
        }

    status, age = _compute_status(d.get("updated_at"))
    players = d.get("players_online", 0) if status != "offline" else 0
    if status == "online":
        msg = f"Online — {players}/{d.get('max_players', 48)} players"
    elif status == "degraded":
        msg = f"Starting up… (last seen {_last_seen_str(age)})"
    else:
        msg = f"Offline (last seen {_last_seen_str(age)})"

    return {
        "status": status, "players_online": players, "max_players": d.get("max_players", 48),
        "last_seen": d.get("updated_at"), "last_seen_label": _last_seen_str(age),
        "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime),
        "resource_count": d.get("resource_count", 0), "server_name": d.get("server_name", "AIFAZI RP"),
        "peak_players": d.get("peak_players", 0), "dev_override": None,
        "display_message": msg, "fake_data": False,
    }


@router.patch("/dev-override")
async def set_dev_override(body: DevOverride, _: dict = Depends(require_admin)):
    supabase.table("fivem_status").update({"dev_override": body.override}).eq("id", "main").execute()
    return {"ok": True, "override": body.override}


@router.get("/history")
async def get_status_history(hours: int = 24, _: dict = Depends(require_staff)):
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    res = (supabase.table("server_status_history")
           .select("recorded_at,players_online,max_players,uptime_seconds,status")
           .gte("recorded_at", since).order("recorded_at", desc=False).execute())
    return {"history": res.data or [], "hours": hours}


@router.get("/players")
async def get_players(_: dict = Depends(require_staff)):
    res = supabase.table("fivem_players").select("*").eq("id", "main").execute()

    def _recent(ts, w=120):
        try:
            return (datetime.now(timezone.utc) -
                    datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() < w
        except (TypeError, ValueError):
            return False

    if res.data:
        d = res.data[0]
        online = _recent(d.get("updated_at", ""))
        return {"players": d.get("players", []) if online else [], "updated_at": d.get("updated_at"), "online": online}
    return {"players": [], "updated_at": None, "online": False}


@router.post("/cron/cleanup")
async def cron_cleanup(request: Request):
    cron_secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    if not cron_secret:
        raise HTTPException(503, "Cron secret is not configured")
    expected = f"Bearer {cron_secret}"
    if not hmac.compare_digest(auth_header, expected):
        raise HTTPException(403, "Invalid cron secret")

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    try:
        supabase.table("fivem_realtime_events").delete().lt("created_at", cutoff).execute()
        log.info("Cron: cleaned realtime events older than 1h")
    except Exception as e:
        log.warning("Cron cleanup failed: %s", e)

    return {"ok": True, "cutoff": cutoff}


@router.get("/players/records")
async def list_player_records(
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    _: dict = Depends(require_staff),
):
    query = supabase.table("player_records").select("*", count="exact")
    if q and q.strip():
        t = safe_search_term(q.strip())
        query = query.or_(
            f"player_name.ilike.%{t}%,"
            f"license_key.ilike.%{t}%,"
            f"license_hex.ilike.%{t}%,"
            f"license2_hex.ilike.%{t}%,"
            f"discord_id.ilike.%{t}%,"
            f"steam_hex.ilike.%{t}%,"
            f"forum_username.ilike.%{t}%"
        )
    res = query.order("last_seen_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"records": res.data or [], "total": res.count or 0}


@router.get("/players/records/{license_key}")
async def get_player_record(license_key: str, _: dict = Depends(require_staff)):
    res = supabase.table("player_records").select("*").eq("license_key", license_key).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Player record not found")
    return res.data[0]


@router.get("/players/sessions")
async def list_player_sessions(
    license_key: str = "",
    limit: int = 50,
    offset: int = 0,
    _: dict = Depends(require_staff),
):
    query = supabase.table("player_sessions").select("*", count="exact")
    if license_key:
        query = query.eq("license_key", license_key)
    res = query.order("joined_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"sessions": res.data or [], "total": res.count or 0}


# ── Still delegated (need stamp / txAdmin / public sanitizing) ───────────────
@router.post("/status")
async def update_server_status(payload: dict, request: Request):
    from routers.fivem import update_server_status as _mono

    return await _mono(StatusUpdate(**(payload or {})), request)


@router.get("/status/overview")
async def get_public_status_overview(hours: int = 24):
    from routers.fivem import get_public_status_overview as _mono

    return await _mono(hours)


@router.post("/status/refresh")
async def refresh_status_timestamp(user: dict = Depends(require_staff)):
    from routers.fivem import refresh_status_timestamp as _mono

    return await _mono(user)


@router.post("/players")
async def update_players(request: Request, background_tasks: BackgroundTasks):
    from routers.fivem import update_players as _mono

    return await _mono(request, background_tasks)


@router.get("/stats")
async def fivem_stats(_: dict = Depends(require_staff)):
    from routers.fivem import fivem_stats as _mono

    return await _mono(_)


@router.post("/players/join")
async def record_player_join(payload: dict, request: Request):
    from routers.fivem import record_player_join as _mono

    return await _mono(PlayerJoinBody(**(payload or {})), request)


@router.post("/players/leave")
async def record_player_leave(payload: dict, request: Request):
    from routers.fivem import record_player_leave as _mono

    return await _mono(PlayerLeaveBody(**(payload or {})), request)


@router.post("/players/heartbeat-sync")
async def heartbeat_sync_players(payload: dict, request: Request):
    from routers.fivem import heartbeat_sync_players as _mono

    return await _mono(PlayerHeartbeatBody(**(payload or {})), request)
