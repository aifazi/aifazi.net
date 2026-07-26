"""
routers/webhooks.py — FiveM playerJoining → Website whitelist sync
Mounted at /api/webhook in main.py

Endpoint: POST /api/webhook/fivem/whitelist-approved

Called by the FiveM Lua resource (aifazi_status/server.lua) when a player
connects and txAdmin lets them through its whitelist gate.

This endpoint updates the `fivem_whitelist` table (the single source of truth
for all whitelist data — applications, approvals, denials).

Field mapping between Lua identifiers and DB columns:
  Lua sends         →  DB column
  ─────────────────────────────
  license (str)     →  fivem_license
  discord (str)     →  discord_id  (stripped of "discord:" prefix)

Security:
  X-FiveM-Token: <FIVEM_SERVER_SECRET>   (existing token used throughout aifazi_status)
  OR
  Authorization: Bearer <FIVEM_WEBHOOK_TOKEN>  (new dedicated token)
  Set at least one in backend .env
"""
from __future__ import annotations
import os
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from database import supabase

log = logging.getLogger("webhooks")
router = APIRouter()

# ── Secrets ───────────────────────────────────────────────────────────────────
FIVEM_WEBHOOK_TOKEN = os.getenv("FIVEM_WEBHOOK_TOKEN", "")
FIVEM_SERVER_SECRET = os.getenv("FIVEM_SERVER_SECRET", "")


def _verify(request: Request) -> None:
    """Accept X-FiveM-Token OR Authorization: Bearer token."""
    if not FIVEM_WEBHOOK_TOKEN and not FIVEM_SERVER_SECRET:
        raise HTTPException(503, "FiveM webhook token is not configured")

    # X-FiveM-Token (used everywhere in aifazi_status)
    xt = request.headers.get("X-FiveM-Token", "")
    if FIVEM_SERVER_SECRET and xt and hmac.compare_digest(xt, FIVEM_SERVER_SECRET):
        return

    # Authorization: Bearer (newer style)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        if FIVEM_WEBHOOK_TOKEN and hmac.compare_digest(token, FIVEM_WEBHOOK_TOKEN):
            return
        if FIVEM_SERVER_SECRET and hmac.compare_digest(token, FIVEM_SERVER_SECRET):
            return

    raise HTTPException(403, "Invalid or missing FiveM webhook token")


# ── Payload ───────────────────────────────────────────────────────────────────
class WhitelistApprovedPayload(BaseModel):
    license: str = ""   # "license:abc..." or "license2:abc..."
    discord: str = ""   # "discord:123456789" OR bare "123456789"


# ── Helper: push realtime event (non-fatal) ───────────────────────────────────
def _push_realtime(event: str, payload: dict) -> None:
    try:
        supabase.table("fivem_realtime_events").insert({
            "event":   event,
            "payload": payload,
        }).execute()
    except Exception as exc:
        log.warning("Realtime push failed (non-fatal): %s", exc)


def _stamp_last_played(app_id: str, now_iso: str, fivem_license: str = "", player_name: str = "") -> None:
    """Best-effort player activity stamp. Safe to deploy before the SQL patch runs."""
    patch = {"last_played_at": now_iso}
    if player_name:
        patch["last_played_name"] = player_name
    if fivem_license:
        patch["fivem_license"] = fivem_license
    try:
        supabase.table("fivem_whitelist").update(patch).eq("id", app_id).execute()
    except Exception as exc:
        log.warning("Could not stamp whitelist last_played_at for id=%s: %s", app_id, exc)


# ── Route ─────────────────────────────────────────────────────────────────────
@router.post("/fivem/whitelist-approved")
async def fivem_whitelist_approved(request: Request, body: WhitelistApprovedPayload):
    """
    Called by FiveM server.lua (playerJoining handler).

    Flow:
      txAdmin lets player through its gate
        → playerJoining fires in server.lua
        → PerformHttpRequest → POST /api/webhook/fivem/whitelist-approved
        → We find their fivem_whitelist row and stamp:
            status      = 'approved'
            approved_at = now()
            sync_source = 'fivem'
            fivem_license = <license identifier>
        → Real-time event pushed so admin panel updates live
    """
    _verify(request)

    now_iso = datetime.now(timezone.utc).isoformat()

    # Normalise identifiers
    fivem_license = body.license.strip()
    raw_discord   = body.discord.strip()
    # Strip "discord:" prefix so we store just the numeric ID
    discord_id = raw_discord[8:] if raw_discord.startswith("discord:") else raw_discord

    if not fivem_license and not discord_id:
        raise HTTPException(422, "At least one of license or discord is required")

    # ── Find existing record: license first, then discord ────────────────────
    existing = None
    matched_by = None

    # Try fivem_license column first (exact match)
    if fivem_license:
        res = supabase.table("fivem_whitelist") \
            .select("id, status, discord_id, fivem_license") \
            .eq("fivem_license", fivem_license) \
            .order("applied_at", desc=True).limit(1).execute()
        if res.data:
            existing = res.data[0]
            matched_by = "fivem_license"

    # Fallback: match by discord_id
    if not existing and discord_id:
        res = supabase.table("fivem_whitelist") \
            .select("id, status, discord_id, fivem_license") \
            .eq("discord_id", discord_id) \
            .order("applied_at", desc=True).limit(1).execute()
        if res.data:
            existing = res.data[0]
            matched_by = "discord_id"

    # ── Update payload ────────────────────────────────────────────────────────
    update = {
        "status":      "approved",
        "approved_at": now_iso,
        "sync_source": "fivem",
        "reviewed_at": now_iso,
    }
    # Always backfill the license if we have it
    if fivem_license:
        update["fivem_license"] = fivem_license
    # Backfill discord_id if row didn't have it
    if discord_id:
        update["discord_id"] = discord_id

    if existing:
        app_id = existing["id"]

        # Already approved — just refresh sync timestamp (idempotent)
        if existing["status"] == "approved":
            supabase.table("fivem_whitelist") \
                .update({"approved_at": now_iso, "sync_source": "fivem"}) \
                .eq("id", app_id).execute()
            _stamp_last_played(app_id, now_iso, fivem_license=fivem_license)
            log.info("fivem_whitelist id=%s already approved — refreshed sync_source", app_id)
            return {"ok": True, "action": "already_approved", "id": app_id}

        # Approve pending/denied record
        supabase.table("fivem_whitelist").update(update).eq("id", app_id).execute()
        _stamp_last_played(app_id, now_iso, fivem_license=fivem_license)
        log.info("fivem_whitelist id=%s approved via playerJoining (matched by %s)", app_id, matched_by)

        _push_realtime("whitelist_approved", {
            "app_id": str(app_id), "source": "fivem_joining",
            "fivem_license": fivem_license, "discord_id": discord_id,
        })
        return {"ok": True, "action": "approved", "id": app_id}

    # ── No existing record — create auto-approved entry ───────────────────────
    # (Player was whitelisted directly in txAdmin without a website application)
    try:
        insert_payload = {
            "discord_id":       discord_id or "",
            "discord_name":     fivem_license or discord_id or "fivem-join-auto",
            "fivem_license":    fivem_license or None,
            "character_name":   "Auto-approved via FiveM join",
            "status":           "approved",
            "approved_at":      now_iso,
            "sync_source":      "fivem",
            "reviewer_note":    "Auto-created when player connected through txAdmin whitelist gate",
            "reviewed_by":      "fivem_webhook",
            "reviewed_at":      now_iso,
            "applied_at":       now_iso,
            "last_played_at":   now_iso,
        }
        try:
            ins = supabase.table("fivem_whitelist").insert(insert_payload).execute()
        except Exception as exc:
            if "last_played" not in str(exc):
                raise
            insert_payload.pop("last_played_at", None)
            ins = supabase.table("fivem_whitelist").insert(insert_payload).execute()
        new_id = (ins.data or [{}])[0].get("id", "new")
        log.info("fivem_whitelist: auto-created approved record id=%s (license=%s)", new_id, fivem_license)
        _push_realtime("whitelist_approved", {
            "app_id": str(new_id), "source": "fivem_auto_create",
            "fivem_license": fivem_license, "discord_id": discord_id,
        })
        return {"ok": True, "action": "created", "id": new_id}
    except Exception as exc:
        log.error("Failed to create auto-approved record: %s", exc)
        raise HTTPException(500, f"DB insert failed: {exc}")
