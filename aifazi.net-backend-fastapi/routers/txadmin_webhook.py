"""routers/txadmin_webhook.py — Real-time txAdmin ↔ Website whitelist sync"""

from __future__ import annotations
import os, hmac, hashlib, logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel

from database import supabase
from dependencies import require_admin, require_staff
from utils.fivem_shared import push_realtime, active_priority, identifier_updates, now

log = logging.getLogger("txadmin_webhook")
router = APIRouter()

# ─── Secret helpers ───────────────────────────────────────────────────────────
WEBHOOK_SECRET      = os.getenv("TXADMIN_WEBHOOK_SECRET", "")
FIVEM_SERVER_SECRET = os.getenv("FIVEM_SERVER_SECRET", "")
IS_PRODUCTION       = os.getenv("ENV", "production") == "production"


def _verify_signature(request: Request, body: bytes) -> None:
    """
    Accepts EITHER:
      1. X-FiveM-Token matching FIVEM_SERVER_SECRET  (existing Lua bridge)
      2. X-TxAdmin-Signature: sha256=<hex> matching TXADMIN_WEBHOOK_SECRET

    BUG FIX #6: if neither secret is configured, reject in production instead
    of accepting all traffic with a warning log.

    H21 — additionally fail closed in non-production too. The previous logic
    still allowed ANY unauthenticated caller when no secret was configured in
    Vercel preview deployments (ENV != production + empty secrets). Since
    Vercel preview deploys are public URLs, this was the actual attack surface:
    anyone could POST to /api/txadmin/whitelist-approved on a preview URL and
    auto-approve their own whitelist. Local dev should explicitly set a dev
    FIVEM_SERVER_SECRET in .env rather than rely on silent bypass.
    """
    # Local dev bypass: only when explicitly allowed
    _ALLOW_INSECURE_LOCAL = os.getenv("ALLOW_INSECURE_LOCAL", "false").lower() in ("1", "yes", "true")

    # 1. Simple token (backward compat with Lua resource)
    token = request.headers.get("X-FiveM-Token", "")
    if FIVEM_SERVER_SECRET and token and hmac.compare_digest(token, FIVEM_SERVER_SECRET):
        return

    # 2. HMAC-SHA256 signature
    if WEBHOOK_SECRET:
        sig_header = request.headers.get("X-TxAdmin-Signature", "")
        expected   = "sha256=" + hmac.new(
            WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if sig_header and hmac.compare_digest(sig_header, expected):
            return

    if _ALLOW_INSECURE_LOCAL and not IS_PRODUCTION:
        log.warning("ALLOW_INSECURE_LOCAL=true + non-production — accepting unauthenticated call (local dev only)")
        return

    raise HTTPException(403, "Invalid or missing webhook signature. Set FIVEM_SERVER_SECRET (and TXADMIN_WEBHOOK_SECRET for HMAC) in env.")


# ─── Cleanup helper — called by cron ─────────────────────────────────────────
def cleanup_realtime_events() -> None:
    """Delete fivem_realtime_events rows older than 1 hour. Called from cron."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        supabase.table("fivem_realtime_events").delete().lt("created_at", cutoff).execute()
    except Exception as exc:
        log.warning("Realtime event cleanup failed: %s", exc)


# ─── Pydantic models ──────────────────────────────────────────────────────────
class TxAdminApprovalPayload(BaseModel):
    discord_id:    Optional[str] = None
    steam_hex:     Optional[str] = None
    fivem_license: Optional[str] = None
    player_name:   Optional[str] = None
    approved_by:   Optional[str] = None
    txadmin_id:    Optional[str] = None

class PlayerConnectingPayload(BaseModel):
    player_name:   str
    steam_hex:     Optional[str] = None
    fivem_license: Optional[str] = None
    discord_id:    Optional[str] = None
    fivem_id:      Optional[str] = None

# _active_priority and _identifier_updates moved to utils.fivem_shared


# ─── Route: txAdmin/FiveM → Website ──────────────────────────────────────────
@router.post("/whitelist-approved")
async def txadmin_whitelist_approved(
    request: Request,
    background: BackgroundTasks,
):
    """
    Called by the FiveM Lua resource when a player is approved inside txAdmin.

    Flow:
      txAdmin approves player
        → Lua detects txAdmin:events:whitelistPreApproval
        → PerformHttpRequest → POST /api/txadmin/whitelist-approved
        → We update fivem_whitelist status=approved, txadmin_synced=true
        → Insert row into fivem_realtime_events (Supabase Realtime delivers to admin panel)
    """
    raw = await request.body()
    _verify_signature(request, raw)

    try:
        import json
        data = json.loads(raw)
        body = TxAdminApprovalPayload(**data)
    except Exception as exc:
        raise HTTPException(422, f"Invalid payload: {exc}")

    app = None
    for field, value in [
        ("discord_id",    body.discord_id),
        ("fivem_license", body.fivem_license),
        ("steam_hex",     body.steam_hex),
    ]:
        if not value:
            continue
        res = supabase.table("fivem_whitelist").select("*") \
            .eq(field, value).order("applied_at", desc=True).limit(1).execute()
        if res.data:
            app = res.data[0]
            break

    if not app and not body.discord_id:
        # txAdmin can echo a license-only approval immediately after a website
        # approval. If there is exactly one recent website-approved row waiting
        # for txAdmin sync, attach the license to it instead of creating a
        # second Unknown approved row.
        recent = (supabase.table("fivem_whitelist")
                  .select("*")
                  .eq("status", "approved")
                  .eq("txadmin_synced", False)
                  .order("approved_at", desc=True)
                  .limit(3)
                  .execute())
        candidates = []
        for row in recent.data or []:
            if row.get("steam_hex") or row.get("fivem_license") or row.get("fivem_id"):
                continue
            try:
                approved_at = datetime.fromisoformat(str(row.get("approved_at")).replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - approved_at <= timedelta(minutes=10):
                    candidates.append(row)
            except Exception:
                continue
        if len(candidates) == 1:
            app = candidates[0]

    now = datetime.now(timezone.utc).isoformat()

    if not app:
        # Player whitelisted directly in txAdmin with no website application
        log.info("txAdmin approved unknown player %s — creating auto-approved record", body.player_name)
        insert_res = supabase.table("fivem_whitelist").insert({
            "discord_id":         body.discord_id or "",
            "discord_name":       body.player_name or "Unknown",
            "steam_hex":          body.steam_hex,
            "fivem_license":      body.fivem_license,
            "character_name":     "Auto-approved via txAdmin",
            "character_backstory": f"Approved directly in txAdmin by {body.approved_by or 'admin'}",
            "age": 0, "rp_experience": "N/A",
            "why_join": "Approved directly in txAdmin.",
            "status":         "approved",
            "txadmin_synced": True,
            "sync_source":    "txadmin",
            "reviewer_note":  f"Auto-synced from txAdmin. Approved by: {body.approved_by or 'unknown'}",
            "reviewed_by":    body.approved_by or "txadmin",
            "reviewed_at":    now,
            "applied_at":     now,
            "approved_at":    now,
        }).execute()
        app_id = (insert_res.data or [{}])[0].get("id", "new")
        background.add_task(push_realtime, "whitelist_approved", {
            "app_id": app_id, "player_name": body.player_name,
            "source": "txadmin_auto", "approved_by": body.approved_by,
        })
        return {"ok": True, "action": "created", "app_id": app_id}

    if app["status"] == "approved":
        # Already approved — mark synced and return idempotently
        supabase.table("fivem_whitelist").update({
            "txadmin_synced": True,
            "sync_source": "txadmin",
            **identifier_updates(body, app),
        }).eq("id", app["id"]).execute()
        return {"ok": True, "action": "already_approved", "app_id": app["id"]}

    update_res = supabase.table("fivem_whitelist").update({
        "status":         "approved",
        "txadmin_synced": True,
        "sync_source":    "txadmin",
        "reviewer_note":  f"Approved via txAdmin by {body.approved_by or 'admin'}",
        "reviewed_by":    body.approved_by or "txadmin",
        "reviewed_at":    now,
        "approved_at":    now,
        **identifier_updates(body, app),
    }).eq("id", app["id"]).execute()

    background.add_task(push_realtime, "whitelist_approved", {
        "app_id":      app["id"],
        "player_name": body.player_name or app.get("discord_name"),
        "discord_id":  app.get("discord_id"),
        "approved_by": body.approved_by,
        "source":      "txadmin_sync",
    })

    log.info("txAdmin approval synced → app %s approved", app["id"])
    return {"ok": True, "action": "approved", "app_id": app["id"]}


# ─── Route: playerConnecting gate check ───────────────────────────────────────
@router.post("/playerConnecting")
async def player_connecting_gate(request: Request, background: BackgroundTasks):
    """
    Called by FiveM playerConnecting. Returns { allowed: true/false, reason }.
    """
    raw = await request.body()
    _verify_signature(request, raw)

    import json
    try:
        data = json.loads(raw)
        body = PlayerConnectingPayload(**data)
    except Exception as exc:
        raise HTTPException(422, f"Invalid payload: {exc}")

    now_iso = datetime.now(timezone.utc).isoformat()

    identifiers = [i for i in [body.steam_hex, body.fivem_license, body.fivem_id, body.discord_id] if i]
    for ident in identifiers:
        ban_res = supabase.table("fivem_bans") \
            .select("reason,expires_at,banned_by") \
            .eq("identifier", ident).eq("active", True).execute()
        if ban_res.data:
            b = ban_res.data[0]
            exp = b.get("expires_at")
            if exp is None or exp > now_iso:
                return {
                    "allowed": False,
                    "reason": f"You are banned: {b['reason']} (by {b['banned_by']})" +
                              (f"\nExpires: {exp}" if exp else "\nPermanent ban.")
                }

    if body.discord_id:
        discord_wl = (supabase.table("fivem_whitelist")
                      .select("id,status,character_name,steam_hex,fivem_license,fivem_id,discord_id,priority_tier,priority_level,priority_expires_at")
                      .eq("discord_id", body.discord_id)
                      .eq("status", "approved")
                      .order("applied_at", desc=True)
                      .limit(1)
                      .execute())
        if discord_wl.data:
            app = discord_wl.data[0]
            priority = active_priority(app)
            updates = identifier_updates(body, app)
            if updates:
                supabase.table("fivem_whitelist").update(updates).eq("id", app["id"]).execute()
                for field, value in [
                    ("fivem_license", body.fivem_license),
                    ("steam_hex", body.steam_hex),
                    ("fivem_id", body.fivem_id),
                ]:
                    if not value:
                        continue
                    try:
                        (supabase.table("fivem_whitelist")
                         .delete()
                         .eq(field, value)
                         .eq("sync_source", "txadmin")
                         .neq("id", app["id"])
                         .execute())
                    except Exception as exc:
                        log.warning("Duplicate txAdmin whitelist cleanup failed: %s", exc)
            background.add_task(push_realtime, "player_connecting", {
                "player_name": body.player_name,
                "steam_hex": body.steam_hex,
                "priority": priority,
            })
            return {
                "allowed": True,
                "character_name": app.get("character_name", ""),
                "priority": priority,
            }

    for field, value in [
        ("steam_hex",     body.steam_hex),
        ("fivem_license", body.fivem_license),
        ("discord_id",    body.discord_id),
    ]:
        if not value:
            continue
        wl_res = supabase.table("fivem_whitelist") \
            .select("id,status,character_name,steam_hex,fivem_license,fivem_id,discord_id,priority_tier,priority_level,priority_expires_at") \
            .eq(field, value).eq("status", "approved").execute()
        if wl_res.data:
            app = wl_res.data[0]
            priority = active_priority(app)
            updates = identifier_updates(body, app)
            if updates:
                supabase.table("fivem_whitelist").update(updates).eq("id", app["id"]).execute()
            background.add_task(push_realtime, "player_connecting", {
                "player_name": body.player_name,
                "steam_hex": body.steam_hex,
                "priority": priority,
            })
            return {
                "allowed": True,
                "character_name": app.get("character_name", ""),
                "priority": priority,
            }

    return {
        "allowed": False,
        "reason": "You are not whitelisted on AIFAZI RP.\nApply at: aifazi.net/whitelist"
    }


# ─── Route: txAdmin denied → website ─────────────────────────────────────────
@router.post("/whitelist-denied")
async def txadmin_whitelist_denied(request: Request, background: BackgroundTasks):
    raw = await request.body()
    _verify_signature(request, raw)

    import json
    try:
        data  = json.loads(raw)
        body  = TxAdminApprovalPayload(**data)
    except Exception as exc:
        raise HTTPException(422, f"Invalid payload: {exc}")

    app = None
    for field, value in [("discord_id", body.discord_id), ("steam_hex", body.steam_hex)]:
        if not value:
            continue
        res = supabase.table("fivem_whitelist").select("id,status") \
            .eq(field, value).order("applied_at", desc=True).limit(1).execute()
        if res.data:
            app = res.data[0]
            break

    if not app:
        return {"ok": True, "action": "no_record"}

    supabase.table("fivem_whitelist").update({
        "status":         "denied",
        "txadmin_synced": True,
        "sync_source":    "txadmin",
        "reviewer_note":  f"Denied/removed via txAdmin by {body.approved_by or 'admin'}",
        "reviewed_by":    body.approved_by or "txadmin",
        "reviewed_at":    datetime.now(timezone.utc).isoformat(),
    }).eq("id", app["id"]).execute()

    background.add_task(push_realtime, "whitelist_denied", {
        "app_id": app["id"], "player_name": body.player_name,
    })
    return {"ok": True, "action": "denied", "app_id": app["id"]}


# ─── Route: whitelist-request (log only) ─────────────────────────────────────
@router.post("/whitelist-request")
async def txadmin_whitelist_request(request: Request):
    raw = await request.body()
    _verify_signature(request, raw)
    import json
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(422, "Invalid JSON")
    log.info("txAdmin whitelist request from %s (%s)",
             data.get("player_name", "Unknown"), data.get("fivem_license", ""))
    return {"ok": True, "action": "logged"}


# ─── BUG FIX #4: push-to-txadmin removed ─────────────────────────────────────
# The old route used httpx with Authorization: Bearer <TXADMIN_TOKEN>.
# txAdmin has NO public Bearer REST API — it uses cookie+CSRF session auth.
# The correct approach is already implemented: the Lua poller (processPendingSync
# in server.lua) logs into txAdmin with the admin password, gets a cookie+CSRF
# token, and calls POST /whitelist/approvals/add.
#
# If you want to trigger an immediate sync from the admin panel, flip
# txadmin_synced=false on the row — the Lua poller picks it up within 10 s.
@router.post("/push-to-txadmin/{app_id}")
async def push_approval_to_txadmin(app_id: str, user: dict = Depends(require_staff)):
    """
    BUG FIX #4: the old implementation tried to call txAdmin via httpx with a
    Bearer token, which txAdmin does not support (it uses cookie+CSRF auth).

    The correct mechanism is the Lua poller: it polls /api/fivem/whitelist/pending-sync
    every 10 s, logs into txAdmin locally using the admin password, and calls
    POST /whitelist/approvals/add with the correct cookie+CSRF headers.

    This endpoint now simply resets txadmin_synced=false so the Lua poller
    picks it up on the next cycle (within 10 seconds).
    """
    res = supabase.table("fivem_whitelist").select("id,status").eq("id", app_id).execute()
    if not res.data:
        raise HTTPException(404, "Application not found")
    app = res.data[0]
    if app["status"] != "approved":
        raise HTTPException(400, "Application must be approved before syncing to txAdmin")

    supabase.table("fivem_whitelist").update({
        "txadmin_synced": False,
    }).eq("id", app_id).execute()

    return {
        "ok": True,
        "message": "Marked for re-sync. The Lua poller will push this to txAdmin within 10 seconds.",
        "app_id": app_id,
    }


# ─── Health check ─────────────────────────────────────────────────────────────
@router.get("/health")
async def txadmin_webhook_health():
    return {
        "ok": True,
        "webhook_secret_set":    bool(WEBHOOK_SECRET),
        "fivem_token_set":       bool(FIVEM_SERVER_SECRET),
        # BUG FIX #6: surface whether we are in open/insecure mode
        "insecure_mode_active":  not IS_PRODUCTION and not WEBHOOK_SECRET and not FIVEM_SERVER_SECRET,
    }
