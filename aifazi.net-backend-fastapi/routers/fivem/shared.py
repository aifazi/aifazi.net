"""routers/fivem/shared.py - extracted from routers/fivem.py."""

from __future__ import annotations

from database import safe_or_in, safe_search_term, supabase
from datetime import datetime
from typing import Any
from utils.fivem_ids import _player_identifiers
from utils.fivem_shared import active_priority as shared_active_priority, now as shared_now, push_realtime as shared_push_realtime
import httpx
import logging
import os
import txadmin_service as txa

_push_realtime = shared_push_realtime
_active_priority = shared_active_priority
_now = shared_now
log = logging.getLogger("fivem")
# Hot-path throttle: the Lua heartbeat fires every ~30s and each stamping pass
# runs up to 64 players x (1 fivem_whitelist UPDATE + 2 application_submissions
# queries) — a serious N+1 against Supabase. Gate the whole stamping pass so it
# runs at most once per 120s regardless of heartbeat frequency.
_STAMP_INTERVAL_SECONDS = 120
_stamp_last_ran: float = 0.0
def _stamp_due() -> bool:
    import time as _t
    global _stamp_last_ran
    now = _t.time()
    if now - _stamp_last_ran < _STAMP_INTERVAL_SECONDS:
        return False
    _stamp_last_ran = now
    return True
WL_PUBLIC_FIELDS = (
    "id,status,txadmin_synced,character_name,fivem_id,fivem_license,steam_hex,"
    "discord_id,discord_name,email,applied_at,reviewed_at,reviewer_note,"
    "priority_tier,priority_level,priority_expires_at"
)
WL_PUBLIC_FIELDS_WITH_PLAY = f"{WL_PUBLIC_FIELDS},last_played_at,last_played_name"
def _effective_whitelist_status(app: dict | None) -> dict | None:
    if not app:
        return app
    if app.get("status") == "approved" and app.get("last_played_at"):
        app["display_status"] = "active"
    elif app.get("status") == "approved" and not app.get("txadmin_synced"):
        app["display_status"] = "syncing"
    else:
        app["display_status"] = app.get("status")
    app["submitted_at"] = app.get("applied_at")
    app["denial_reason"] = app.get("reviewer_note")
    return app
def _stamp_application_activity(player_ids: dict[str, Any], player_name: str, now_iso: str) -> None:
    player_values = {str(v).lower() for v in player_ids.get("all", []) if v}
    for val in (player_ids.get("discord_id"), player_ids.get("steam_hex"), player_ids.get("fivem_license"), player_ids.get("license2"), player_ids.get("fivem_id")):
        if val:
            player_values.add(str(val).lower())
            if str(val).startswith("discord:"):
                player_values.add(str(val).split(":", 1)[1].lower())

    if not player_values:
        return

    try:
        filters = []
        for val in player_values:
            clean = safe_search_term(val, max_len=64)
            if not clean:
                continue
            for key in ("license", "fivem_license", "license2", "steam_hex", "steam", "fivem_id", "discord_id"):
                filters.append(f"answers->>'{key}' ilike.%{clean}%")
        if not filters:
            return
        res = (
            supabase.table("application_form_submissions")
            .select("id")
            .eq("status", "approved")
            .or_(",".join(filters[:50]))
            .limit(50)
            .execute()
        )
        matched = [row["id"] for row in (res.data or []) if row.get("id")]
        if matched:
            patch = {"last_active_at": now_iso, "updated_at": now_iso}
            if player_name:
                patch["last_active_name"] = player_name
            supabase.table("application_form_submissions").update(patch).in_("id", matched).execute()
    except Exception as exc:
        log.warning("Could not stamp application activity: %s", exc)
def _stamp_whitelist_activity(players: list[Any] | None, now_iso: str) -> None:
    if not players:
        return
    # Throttle: only run the N+1 stamping pass once per _STAMP_INTERVAL_SECONDS.
    if not _stamp_due():
        return
    for player in players[:64]:
        if not isinstance(player, dict):
            continue
        ids = _player_identifiers(player)
        license_id = (ids.get("fivem_license") or ids.get("license") or ids.get("license2") or "").strip()
        steam_hex = (ids.get("steam_hex") or "").strip()
        fivem_id = (ids.get("fivem_id") or "").strip()
        discord_id = (ids.get("discord_id") or "").strip()
        player_name = (player.get("name") or "").strip()
        patch = {"last_played_at": now_iso}
        if player_name:
            patch["last_played_name"] = player_name

        conds = []
        if license_id: conds.append(safe_or_in("fivem_license", [license_id]))
        if steam_hex:  conds.append(safe_or_in("steam_hex", [steam_hex]))
        if fivem_id:   conds.append(safe_or_in("fivem_id", [fivem_id]))
        if discord_id: conds.append(safe_or_in("discord_id", [discord_id]))

        try:
            if conds:
                supabase.table("fivem_whitelist").update(patch).eq("status", "approved").or_(",".join(conds)).execute()
            _stamp_application_activity(ids, player_name, now_iso)
        except Exception as exc:
            log.warning("Could not stamp whitelist activity for player %s: %s", player_name or license_id or discord_id, exc)
# Discord Bot Config (role sync)
_DISCORD_TOKEN    = os.getenv("DISCORD_BOT_TOKEN", "")
_DISCORD_GUILD    = os.getenv("DISCORD_GUILD_ID", "")
_DISCORD_WL_ROLE  = os.getenv("DISCORD_WHITELIST_ROLE_ID", "")
async def _discord_assign_whitelist_role(discord_id: str) -> tuple[bool, str]:
    """
    Assign the Whitelisted role to a Discord member via Bot API.
    Returns (success, message).
    Silently skips if env vars not configured.
    """
    if not all([_DISCORD_TOKEN, _DISCORD_GUILD, _DISCORD_WL_ROLE]):
        return False, "Discord bot not configured (missing env vars)"

    url = f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/members/{discord_id}/roles/{_DISCORD_WL_ROLE}"
    headers = {
        "Authorization": f"Bot {_DISCORD_TOKEN}",
        "Content-Type":  "application/json",
        "X-Audit-Log-Reason": "Whitelisted via aifazi.net admin panel",
    }
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.put(url, headers=headers)

    if r.status_code == 204:
        return True, f"Discord role assigned to {discord_id}"
    if r.status_code == 404:
        return False, f"Member {discord_id} not found in Discord server"
    return False, f"Discord API error {r.status_code}: {r.text[:200]}"
async def _discord_remove_whitelist_role(discord_id: str) -> tuple[bool, str]:
    """Remove the Whitelisted role (used on deny/ban)."""
    if not all([_DISCORD_TOKEN, _DISCORD_GUILD, _DISCORD_WL_ROLE]):
        return False, "Discord bot not configured"

    url = f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/members/{discord_id}/roles/{_DISCORD_WL_ROLE}"
    headers = {"Authorization": f"Bot {_DISCORD_TOKEN}"}
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.delete(url, headers=headers)

    if r.status_code == 204:
        return True, f"Discord role removed from {discord_id}"
    return False, f"Discord API {r.status_code}: {r.text[:200]}"
def _priority_update_fields(priority_tier: str | None, priority_level: int | None, priority_expires_at: str | None) -> dict:
    if priority_level is None and priority_tier is None and priority_expires_at is None:
        return {}

    level = max(0, int(priority_level or 0))
    return {
        "priority_tier": (priority_tier or "").strip() or None if level > 0 else None,
        "priority_level": level,
        "priority_expires_at": priority_expires_at or None if level > 0 else None,
    }
async def _sync_to_txadmin(app: dict, approved_by: str, source: str) -> dict:
    """
    Push a whitelist approval to txAdmin (direct HTTPS via txadmin_service).
    FIX: tries all available identifier forms before giving up.
    """
    # Build candidates in order of preference
    candidates: list[str] = []
    steam = (app.get("steam_hex") or "").strip()
    license_id = (app.get("fivem_license") or "").strip()
    fivem = (app.get("fivem_id") or "").strip()
    if license_id:
        candidates.append(license_id)
    if steam:
        candidates.append(steam)
        if not steam.startswith("license:") and not steam.startswith("steam:"):
            candidates.append("license:" + steam)
    if fivem:
        candidates.append(fivem)
        if not fivem.startswith("fivem:"):
            candidates.append("fivem:" + fivem)

    txadmin_ok   = False
    txadmin_note = "no_identifier"

    for ident in candidates:
        ok, msg = await txa.add_whitelist_approval(ident)
        if ok:
            txadmin_ok   = True
            txadmin_note = msg
            log.info("txAdmin whitelist add OK: %s (%s)", ident, msg)
            break
        else:
            log.warning("txAdmin identifier %s failed: %s â€” trying next", ident, msg)
            txadmin_note = msg

    if not candidates:
        log.warning("No identifier for app %s â€” skipping txAdmin push", app.get("id"))

    upd: dict = {
        "txadmin_synced": txadmin_ok,
        "sync_source":    source,
        "approved_at":    _now(),
        "reviewed_by":    approved_by,
        "reviewed_at":    _now(),
        "status":         "approved",
    }
    if not txadmin_ok and txadmin_note:
        upd["reviewer_note"] = (app.get("reviewer_note") or "") + f" [txAdmin sync error: {txadmin_note}]"

    supabase.table("fivem_whitelist").update(upd).eq("id", app["id"]).execute()

    # Push realtime event so admin panel updates instantly
    await _push_realtime("whitelist_synced", {
        "app_id":       app["id"],
        "player_name":  app.get("discord_name"),
        "txadmin_ok":   txadmin_ok,
        "source":       source,
        "approved_by":  approved_by,
    })
    return upd
def _pending_count(table: str, filters: dict[str, Any], in_filters: dict[str, list[Any]] | None = None) -> int:
    q = supabase.table(table).select("id", count="exact")
    for key, val in filters.items():
        q = q.eq(key, val)
    for key, vals in (in_filters or {}).items():
        q = q.in_(key, vals)
    res = q.limit(1).execute()
    return int(res.count or 0)
def _build_player_record_row(ids: dict, player_name: str, server_id: Any, now_iso: str) -> dict | None:
    license_key = ids.get("license_key")
    if not license_key:
        return None
    row: dict = {
        "license_key":    license_key,
        "player_name":    player_name or "Unknown",
        "last_seen_at":   now_iso,
        "last_server_id": server_id,
        "updated_at":     now_iso,
    }
    for field, val in (
        ("license_hex", ids.get("license")),
        ("license2_hex", ids.get("license2")),
        ("discord_id", ids.get("discord_id")),
        ("steam_hex", ids.get("steam_hex")),
        ("fivem_id", ids.get("fivem_id")),
    ):
        if val:
            row[field] = val
    return row
def _upsert_player_record(ids: dict, player_name: str, server_id: Any, now_iso: str) -> dict | None:
    row = _build_player_record_row(ids, player_name, server_id, now_iso)
    if not row:
        return None
    res = supabase.table("player_records").upsert(row, on_conflict="license_key").execute()
    return (res.data or [None])[0]
def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None
