"""routers/fivem/txadmin.py - extracted from routers/fivem.py."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

from routers.fivem.shared import _now, _push_realtime, log
from database import safe_or_in, supabase
from datetime import datetime, timedelta, timezone
from dependencies import require_admin, require_staff
from fastapi import BackgroundTasks, Depends, HTTPException, Request
from routers.fivem_models import TxAdminActionBody, TxAdminEvent, _check_token
from utils.audit import record as _audit
from utils.fivem_ids import _identifier_update_fields
import txadmin_service as txa

# â”€â”€â”€ txAdmin â†’ Website  (Lua forwards txAdmin:events:* here) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/txadmin-event")
async def receive_txadmin_event(
    body: TxAdminEvent,
    background_tasks: BackgroundTasks,
    request: Request
):
    """
    Receives txAdmin native events forwarded by the Lua resource.
    Updates fivem_whitelist immediately and pushes to fivem_realtime_events
    so the admin panel sees the change without polling.

    Handles:
      whitelistPreApproval  â€” admin approved/removed via txAdmin panel
      playerWhitelisted     â€” player passed whitelist check on join
      whitelistPlayer       â€” alias for playerWhitelisted (older txAdmin)
      whitelistRequest      â€” player was rejected and request was logged
    """
    _check_token(request)
    event = body.event
    data  = body.data

    if event == "whitelistPreApproval":
        action     = data.get("action", "")       # "added" | "removed"
        identifier = data.get("identifier", "")   # "license:abcâ€¦"
        admin_name = data.get("adminName", "txAdmin")
        discord_id = data.get("discord_id") or data.get("discordId") or data.get("discord")

        if action == "added" and identifier:
            # Try to find existing application by identifier first.
            matched = (supabase.table("fivem_whitelist").select("id,status,discord_name")
                       .or_(",".join([safe_or_in("steam_hex", [identifier]), safe_or_in("fivem_license", [identifier]), safe_or_in("fivem_id", [identifier])]))
                       .limit(1).execute())

            matched_app = (matched.data or [None])[0]

            if not matched_app and discord_id:
                by_discord = (supabase.table("fivem_whitelist")
                              .select("id,status,discord_name,steam_hex,fivem_license,fivem_id")
                              .eq("discord_id", discord_id)
                              .order("applied_at", desc=True)
                              .limit(1)
                              .execute())
                matched_app = (by_discord.data or [None])[0]

            if not matched_app:
                # Website approvals usually get pushed to txAdmin before we
                # know the player's license. If txAdmin immediately echoes the
                # license-only approval back, merge it into the single recent
                # website-approved row instead of creating an Unknown duplicate.
                recent = (supabase.table("fivem_whitelist")
                          .select("id,status,discord_name,steam_hex,fivem_license,fivem_id,approved_at")
                          .eq("status", "approved")
                          .eq("txadmin_synced", False)
                          .order("approved_at", desc=True)
                          .limit(3)
                          .execute())
                recent_candidates = []
                for row in recent.data or []:
                    has_id = row.get("steam_hex") or row.get("fivem_license") or row.get("fivem_id")
                    if has_id:
                        continue
                    try:
                        approved_at = datetime.fromisoformat(str(row.get("approved_at")).replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) - approved_at <= timedelta(minutes=10):
                            recent_candidates.append(row)
                    except Exception:
                        continue
                if len(recent_candidates) == 1:
                    matched_app = recent_candidates[0]

            if matched_app:
                app = matched_app
                upd: dict = {
                    "txadmin_synced": True,
                    "sync_source":    "txadmin",
                    "approved_at":    _now(),
                    **_identifier_update_fields(identifier, app),
                }
                if app.get("status") != "approved":
                    upd.update({
                        "status":       "approved",
                        "reviewed_by":  admin_name,
                        "reviewed_at":  _now(),
                    })
                supabase.table("fivem_whitelist").update(upd).eq("id", app["id"]).execute()
                log.info("txAdminâ†’website: approved %s by %s", identifier, admin_name)

                background_tasks.add_task(_push_realtime, "whitelist_txadmin_approved", {
                    "app_id":      app["id"],
                    "player_name": app.get("discord_name"),
                    "identifier":  identifier,
                    "approved_by": admin_name,
                    "source":      "txadmin",
                })
            else:
                # No existing application â€” auto-create an approved entry
                identifier_updates = _identifier_update_fields(identifier)
                ins = supabase.table("fivem_whitelist").insert({
                    "discord_id":         discord_id or identifier,
                    "discord_name":       f"txAdmin:{identifier[:20]}",
                    "character_name":     "Unknown (txAdmin approved)",
                    "character_backstory":"Auto-created from txAdmin approval.",
                    "age": 0, "rp_experience": "N/A",
                    "why_join":       "Approved directly in txAdmin panel.",
                    "status":         "approved",
                    "applied_at":     _now(),
                    "approved_at":    _now(),
                    "reviewed_at":    _now(),
                    "reviewed_by":    admin_name,
                    "sync_source":    "txadmin",
                    "txadmin_synced": True,
                    **identifier_updates,
                }).execute()
                new_id = (ins.data or [{}])[0].get("id", "new")
                log.info("txAdminâ†’website: auto-created approved entry for %s", identifier)
                background_tasks.add_task(_push_realtime, "whitelist_txadmin_approved", {
                    "app_id": new_id, "identifier": identifier, "approved_by": admin_name,
                    "source": "txadmin_auto",
                })

        elif action == "removed" and identifier:
            supabase.table("fivem_whitelist").update({
                "txadmin_synced": False,
                "sync_source":    "txadmin",
            }).or_(",".join([safe_or_in("steam_hex", [identifier]), safe_or_in("fivem_license", [identifier]), safe_or_in("fivem_id", [identifier])])).execute()
            background_tasks.add_task(_push_realtime, "whitelist_txadmin_removed", {
                "identifier": identifier, "removed_by": data.get("adminName"),
            })

    elif event in ("playerWhitelisted", "whitelistPlayer"):
        # Player joined successfully through txAdmin whitelist gate
        identifier = data.get("license") or data.get("identifier", "")
        if identifier:
            (supabase.table("fivem_whitelist")
             .update({"txadmin_synced": True, "sync_source": "txadmin"})
             .or_(",".join([safe_or_in("steam_hex", [identifier]), safe_or_in("fivem_license", [identifier]), safe_or_in("fivem_id", [identifier])]))
             .eq("status", "approved").execute())
            background_tasks.add_task(_push_realtime, "player_joined_whitelist", {
                "identifier": identifier,
            })

    elif event == "whitelistRequest":
        # Player rejected â€” just log it for visibility
        log.info("txAdmin whitelist request: %s", data)

    # â”€â”€ BAN SYNC: txAdmin â†’ Website â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    elif event == "playerBanned":
        # txAdmin banned a player â€” create/update the ban record on website
        identifier  = data.get("license") or data.get("identifier", "")
        player_name = data.get("name") or data.get("playerName", "Unknown")
        reason      = data.get("reason", "Banned via txAdmin")
        admin_name  = data.get("adminName", "txAdmin")
        expires_at  = data.get("expiration")  # ISO string or null

        if identifier:
            # Check if ban already exists
            action_id = data.get("actionId") or data.get("action_id")
            existing = supabase.table("fivem_bans").select("id") \
                .eq("identifier", identifier).eq("active", True).execute()
            if not existing.data:
                supabase.table("fivem_bans").insert({
                    "identifier":  identifier,
                    "player_name": player_name,
                    "reason":      reason,
                    "banned_by":   admin_name,
                    "banned_at":   _now(),
                    "active":      True,
                    "expires_at":  expires_at,
                    "source":      "txadmin",
                    "txadmin_synced": True,
                    "txadmin_action_id": str(action_id) if action_id else None,
                }).execute()
                log.info("txAdminâ†’website: ban synced for %s by %s", identifier, admin_name)
                background_tasks.add_task(_push_realtime, "player_banned_txadmin", {
                    "identifier": identifier, "player_name": player_name,
                    "reason": reason, "banned_by": admin_name,
                })
            elif action_id:
                supabase.table("fivem_bans").update({
                    "txadmin_synced": True,
                    "txadmin_action_id": str(action_id),
                }).eq("id", existing.data[0]["id"]).execute()

    elif event == "playerUnbanned":
        # txAdmin unbanned a player â€” lift the ban on website
        identifier = data.get("license") or data.get("identifier", "")
        admin_name = data.get("adminName", "txAdmin")
        if identifier:
            action_id = data.get("actionId") or data.get("action_id")
            updates: dict = {
                "active":       False,
                "unbanned_by":  admin_name,
                "unbanned_at":  _now(),
                "source":       "txadmin",
                "txadmin_synced": True,
            }
            if action_id:
                updates["txadmin_action_id"] = str(action_id)
            supabase.table("fivem_bans").update(updates).eq("identifier", identifier).eq("active", True).execute()
            log.info("txAdminâ†’website: unban synced for %s by %s", identifier, admin_name)
            background_tasks.add_task(_push_realtime, "player_unbanned_txadmin", {
                "identifier": identifier, "unbanned_by": admin_name,
            })

    return {"ok": True, "event": event}
# â”€â”€â”€ txAdmin health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/txadmin/status")
async def txadmin_status(_: dict = Depends(require_staff)):
    """Check whether the backend can reach txAdmin."""
    reachable = await txa.is_available()
    return {
        "url":        txa.TXADMIN_URL,
        "reachable":  reachable,
        "session_ok": txa._is_valid(),
        "configured": bool(txa.TXADMIN_USERNAME and txa.TXADMIN_PASSWORD),
    }
# ─── txAdmin live actions ────────────────────────────────────────────────────
_TXADMIN_ACTIONS = ("kick", "ban", "stop-resource", "start-resource")
def _resolve_live_netid(target: str) -> str | None:
    """Resolve a player name or server id to a txAdmin netid using the latest
    fivem_players snapshot (written by the Lua heartbeat)."""
    want = (target or "").strip().lower()
    if not want:
        return None
    if want.isdigit():
        return want
    try:
        res = supabase.table("fivem_players").select("players").eq("id", "main").execute()
    except Exception:
        return None
    players = ((res.data or [{}])[0].get("players") or []) if res.data else []
    for p in players:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or p.get("username") or "").strip().lower()
        sid = str(p.get("server_id") or p.get("id") or p.get("netid") or "")
        if want == name or (sid and want == sid.lower()):
            return sid or None
    return None
@router.post("/txadmin/action")
async def txadmin_live_action(
    body: TxAdminActionBody,
    request: Request,
    user: dict = Depends(require_admin),
):
    """Live txAdmin moderation (kick/ban/resource stop-start).

    Uses the SAME txadmin_service session (TXADMIN_URL + TXADMIN_USERNAME /
    TXADMIN_PASSWORD) as GET /fivem/txadmin/status — the secret never leaves
    the server. Every call is audited.
    """
    action = (body.action or "").strip().lower()
    if action not in _TXADMIN_ACTIONS:
        raise HTTPException(400, f"Unknown action. Allowed: {', '.join(_TXADMIN_ACTIONS)}")
    if not body.confirm:
        raise HTTPException(400, "Live actions require confirm:true")
    target = (body.target or "").strip()
    if not target:
        raise HTTPException(422, "target is required")
    reason = (body.reason or "").strip() or "Actioned by admin"
    actor = str(user.get("username") or user.get("id") or "admin")
    ok: bool
    detail: dict | str | None

    if action == "kick":
        netid = _resolve_live_netid(target)
        if not netid:
            raise HTTPException(404, f"Player '{target}' is not online (no matching netid)")
        ok, detail = await txa.request(
            "POST", "/player/kick", {"reason": reason},
            params={"mutex": "current", "netid": str(netid)},
        )
    elif action == "ban":
        if target.isdigit():
            ok, detail = await txa.ban_online_player(int(target), reason, "permanent")
        else:
            ok, detail = await txa.ban_by_identifiers([target], target, reason, "permanent")
        # txAdmin fires playerBanned -> Lua forwards -> backend records the
        # fivem_bans row, so no direct DB write here.
    else:
        # NOTE: verify these paths against your txAdmin version; txa.request
        # surfaces txAdmin's own response as `detail` so a wrong path is
        # visible immediately instead of failing silently.
        verb = "stop" if action == "stop-resource" else "start"
        ok, detail = await txa.request(
            "POST", f"/resources/{verb}", {"name": target},
            params={"mutex": "current"},
        )

    _audit(actor, f"txadmin_{action}", target=target,
           details={"reason": reason, "ok": bool(ok),
                    "detail": str(detail)[:300] if detail else ""},
           ip=request.client.host if request.client else "")
    return {"ok": bool(ok), "action": action, "target": target, "detail": detail}
