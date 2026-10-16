"""routers/fivem/status.py - extracted from routers/fivem.py."""

from __future__ import annotations

from routers.fivem.shared import _build_player_record_row, _now, _parse_dt, _push_realtime, _stamp_whitelist_activity, _upsert_player_record
from database import supabase
from datetime import datetime, timedelta, timezone
from dependencies import require_staff
from fastapi import BackgroundTasks, Depends, HTTPException, Request
from routers.fivem_models import DEGRADED_THRESHOLD_S, PlayerHeartbeatBody, PlayerJoinBody, PlayerLeaveBody, StatusUpdate, _check_token, _compute_status, _last_seen_str, _uptime_str
from utils.fivem_ids import _player_identifiers, _player_ids_from_fields

# â”€â”€â”€ Bans â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def update_server_status(body: StatusUpdate, request: Request):
    _check_token(request)
    now_iso      = _now()
    # FIX: force_offline shifts updated_at into the past so the threshold
    # triggers "offline" immediately on the public status page
    effective_ts = (
        (datetime.now(timezone.utc) - timedelta(seconds=DEGRADED_THRESHOLD_S + 60)).isoformat()
        if body.force_offline else now_iso
    )
    cur  = supabase.table("fivem_status").select("peak_players").eq("id", "main").execute()
    peak = max((cur.data[0].get("peak_players", 0) if cur.data else 0), body.players_online)

    supabase.table("fivem_status").upsert({
        "id": "main",
        "players_online":  body.players_online,
        "max_players":     body.max_players,
        "server_name":     body.server_name,
        "server_version":  body.server_version,
        "uptime_seconds":  body.uptime_seconds,
        "resource_count":  body.resource_count,
        "peak_players":    peak,
        "updated_at":      effective_ts,
    }).execute()

    # Persist to history (skip offline pings to keep graph clean)
    if not body.force_offline:
        supabase.table("server_status_history").insert({
            "recorded_at":    now_iso,
            "players_online": body.players_online,
            "max_players":    body.max_players,
            "uptime_seconds": body.uptime_seconds,
            "status":         "online",
        }).execute()

    # FIX: if the heartbeat includes a players list, upsert fivem_players too
    if body.players:
        supabase.table("fivem_players").upsert({
            "id":         "main",
            "players":    body.players,
            "updated_at": now_iso,
        }).execute()
        _stamp_whitelist_activity(body.players, now_iso)

    return {"ok": True}
async def get_public_status_overview(hours: int = 24):
    """Public, visitor-safe server overview: status summary + sanitized online
    player list (names/ping only — all identifiers stripped) + history series.
    Feed for the public /fivem/status page."""
    hours = max(1, min(24, int(hours or 24)))

    status_res = supabase.table("fivem_status").select("*").eq("id", "main").execute()
    if not status_res.data:
        status = {
            "status": "offline", "players_online": 0, "max_players": 48,
            "last_seen": None, "last_seen_label": "No heartbeat received",
            "uptime_seconds": 0, "uptime_label": "0m", "resource_count": 0,
            "server_name": "AIFAZI RP", "peak_players": 0, "dev_override": None,
            "display_message": "No heartbeat received",
        }
    else:
        d = status_res.data[0]
        ov = d.get("dev_override")
        uptime = d.get("uptime_seconds", 0)
        if ov == "maintenance":
            status = {"status": "maintenance", "players_online": 0, "max_players": d.get("max_players", 48),
                      "display_message": "Server is under maintenance", "server_name": d.get("server_name"),
                      "peak_players": d.get("peak_players", 0), "resource_count": d.get("resource_count", 0),
                      "uptime_seconds": 0, "uptime_label": "0m", "last_seen": d.get("updated_at"),
                      "last_seen_label": "Maintenance Mode", "dev_override": "maintenance"}
        elif ov == "force_online":
            status = {"status": "online", "players_online": d.get("players_online", 0), "max_players": d.get("max_players", 48),
                      "display_message": "Force Online override active", "dev_override": "force_online",
                      "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime), "server_name": d.get("server_name"),
                      "peak_players": d.get("peak_players", 0), "resource_count": d.get("resource_count", 0),
                      "last_seen": d.get("updated_at"), "last_seen_label": "Force Online (dev)"}
        else:
            status_label, age = _compute_status(d.get("updated_at"))
            online_players = d.get("players_online", 0) if status_label != "offline" else 0
            if status_label == "online":     msg = f"Online — {online_players}/{d.get('max_players',48)} players"
            elif status_label == "degraded": msg = f"Starting up… (last seen {_last_seen_str(age)})"
            else:                            msg = f"Offline (last seen {_last_seen_str(age)})"
            status = {"status": status_label, "players_online": online_players, "max_players": d.get("max_players", 48),
                      "last_seen": d.get("updated_at"), "last_seen_label": _last_seen_str(age),
                      "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime),
                      "resource_count": d.get("resource_count", 0), "server_name": d.get("server_name", "AIFAZI RP"),
                      "peak_players": d.get("peak_players", 0), "dev_override": None, "display_message": msg}

    # Sanitized player list — strip every identifier, keep only display fields.
    players: list[dict] = []
    players_res = supabase.table("fivem_players").select("*").eq("id", "main").execute()
    if players_res.data:
        p = players_res.data[0]
        try:
            recent = (datetime.now(timezone.utc) - datetime.fromisoformat(
                (p.get("updated_at") or "").replace("Z", "+00:00"))).total_seconds() < 120
        except Exception:
            recent = False
        if recent:
            for row in (p.get("players") or []):
                if not isinstance(row, dict):
                    continue
                players.append({
                    "name": row.get("name") or row.get("username") or "Unknown",
                    "ping": row.get("ping") or 0,
                    "server_id": row.get("server_id"),
                    "session_seconds": row.get("session_seconds") or 0,
                })

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    hist_res = (supabase.table("server_status_history")
                .select("recorded_at,players_online,max_players,status")
                .gte("recorded_at", since).order("recorded_at", desc=False)
                .limit(1000).execute())

    return {"status": status, "players": players, "history": hist_res.data or [], "hours": hours}
async def refresh_status_timestamp(user: dict = Depends(require_staff)):
    """
    Reload the current status for the admin panel without changing the heartbeat
    timestamp. FiveM itself must report online/offline so this endpoint cannot
    accidentally make a stopped server look online.
    """
    from routers.fivem_status_api import get_server_status
    status = await get_server_status()
    await _push_realtime("server_status_refresh", {
        "requested_by": user.get("username", "admin"),
        "status": status.get("status"),
    })
    return {"ok": True, **status}
# â”€â”€â”€ Players â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def update_players(request: Request, background_tasks: BackgroundTasks):
    """Accepts {players: [...]} from Lua. Also handles bare array for compat."""
    _check_token(request)
    import json as _json
    raw = await request.body()
    try:
        data = _json.loads(raw)
    except Exception:
        raise HTTPException(422, "Invalid JSON")

    players = data.get("players", data) if isinstance(data, dict) else data
    if not isinstance(players, list):
        raise HTTPException(422, "Expected {players: [...]} or bare array")

    supabase.table("fivem_players").upsert({
        "id": "main", "players": players, "updated_at": _now()
    }).execute()
    _stamp_whitelist_activity(players, _now())
    return {"ok": True, "count": len(players)}
# â”€â”€â”€ Cron â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# â”€â”€â”€ Stats tile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def fivem_stats(_: dict = Depends(require_staff)):
    pending  = supabase.table("fivem_whitelist").select("id", count="exact").eq("status", "pending").execute()
    approved = supabase.table("fivem_whitelist").select("id", count="exact").eq("status", "approved").execute()
    bans     = supabase.table("fivem_bans").select("id", count="exact").eq("active", True).execute()
    srv_res  = supabase.table("fivem_status").select("*").eq("id", "main").execute()
    srv  = srv_res.data[0] if srv_res.data else {}
    computed, age = _compute_status(srv.get("updated_at"))
    ov = srv.get("dev_override")
    if ov == "force_online": computed = "online"
    elif ov == "maintenance": computed = "maintenance"
    online = computed == "online"
    uptime = srv.get("uptime_seconds", 0)
    return {
        "pending_applications": pending.count or 0,
        "whitelisted_players":  approved.count or 0,
        "active_bans":          bans.count or 0,
        "players_online":       srv.get("players_online", 0) if online else 0,
        "max_players":          srv.get("max_players", 48),
        "status":               computed,
        "online":               online,
        "uptime_label":         _uptime_str(uptime),
        "resource_count":       srv.get("resource_count", 0),
        "peak_players":         srv.get("peak_players", 0),
        "dev_override":         ov,
        "last_seen_label":      _last_seen_str(age),
        "server_name":          srv.get("server_name", "AIFAZI RP"),
    }
async def record_player_join(body: PlayerJoinBody, request: Request):
    """Lua fires on successful join — creates/updates player record + opens a session."""
    _check_token(request)
    now_iso = _now()
    ids = _player_ids_from_fields(body.license, body.license2, body.steam_hex, body.fivem_id, body.discord_id, body.identifiers)
    if not ids.get("license_key"):
        return {"ok": False, "reason": "no_license"}
    record = _upsert_player_record(ids, body.player_name, body.server_id, now_iso)
    if not record:
        return {"ok": False, "reason": "no_record"}
    sess = supabase.table("player_sessions").insert({
        "player_id":   record["id"],
        "license_key": ids["license_key"],
        "player_name": body.player_name or "Unknown",
        "joined_at":   now_iso,
        "server_id":   body.server_id,
        "identifiers": ids.get("all") or [],
    }).execute()
    return {"ok": True, "record_id": record["id"], "session_id": (sess.data or [{}])[0].get("id")}
async def record_player_leave(body: PlayerLeaveBody, request: Request):
    """Lua fires on playerDropped — closes the open session and bumps totals."""
    _check_token(request)
    now_iso = _now()
    ids = _player_ids_from_fields(body.license, body.license2, body.steam_hex, None, None, body.identifiers)
    license_key = ids.get("license_key")
    if not license_key:
        return {"ok": False, "reason": "no_license"}
    res = (supabase.table("player_sessions")
           .select("id,player_id,joined_at")
           .eq("license_key", license_key)
           .is_("left_at", "null")
           .order("joined_at", desc=True).limit(1).execute())
    session = (res.data or [None])[0]
    closed = 0
    if session:
        joined = _parse_dt(session.get("joined_at")) or datetime.now(timezone.utc)
        duration = max(0, int((datetime.now(timezone.utc) - joined).total_seconds()))
        supabase.table("player_sessions").update({
            "left_at":           now_iso,
            "duration_seconds":  duration,
            "disconnect_reason": (body.disconnect_reason or "")[:200],
        }).eq("id", session["id"]).execute()
        closed = 1
        rec_res = (supabase.table("player_records")
                   .select("id,total_sessions,total_playtime_seconds")
                   .eq("id", session["player_id"]).limit(1).execute())
        rec = (rec_res.data or [None])[0]
        if rec:
            supabase.table("player_records").update({
                "total_sessions":         int(rec.get("total_sessions") or 0) + 1,
                "total_playtime_seconds": int(rec.get("total_playtime_seconds") or 0) + duration,
                "last_seen_at":           now_iso,
                "last_server_id":         body.server_id,
            }).eq("id", rec["id"]).execute()
    return {"ok": True, "closed": closed, "license_key": license_key}
async def heartbeat_sync_players(body: PlayerHeartbeatBody, request: Request):
    """Lua sends with each heartbeat — keeps player_records.last_seen fresh."""
    _check_token(request)
    now_iso = _now()
    synced = 0
    # Batch all player upserts into ONE round-trip (was 1 upsert per player).
    rows = []
    for p in body.players or []:
        if not isinstance(p, dict):
            continue
        ids = _player_identifiers(p)
        if not (ids.get("license") or ids.get("license2") or ids.get("fivem_license")):
            continue
        row = _build_player_record_row(ids, p.get("name") or "Unknown", p.get("server_id"), now_iso)
        if row:
            rows.append(row)
            synced += 1
    if rows:
        supabase.table("player_records").upsert(rows, on_conflict="license_key").execute()
    return {"ok": True, "synced": synced}
