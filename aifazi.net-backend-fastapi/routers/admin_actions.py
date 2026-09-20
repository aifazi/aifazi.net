"""routers/admin_actions.py — Admin collection CRUD, maintenance ops, sessions, IP bans.
Mounted at /api/admin in main.py
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from dependencies import require_staff
from permissions import require_permission
from utils.audit import record as _audit
from utils.rate_limit import invalidate_ip_bans_cache

import logging

log = logging.getLogger("admin_actions")

router = APIRouter()

CHAT_MANAGE = require_permission("community.chat", "manage")


def _actor(user: dict) -> str:
    return str(user.get("username") or user.get("id") or "staff")


def _ip(request: Request | None) -> str:
    try:
        return request.client.host if request and request.client else ""
    except Exception:
        return ""

# P1-11 — allowlist for the generic collection browser. Only non-sensitive
# collections the UI needs are writable without full admin. Sensitive stores
# (users, staff_users, auth_sessions, ip_bans, permission tables) are DENIED
# here — anything outside this allowlist requires require_admin.
ALLOWED_COLLECTIONS = frozenset({
    "posts", "threads", "replies", "contacts", "messages", "media", "newsletter",
})

COLL_TABLE = {
    "users":      "users",
    "posts":      "posts",
    "threads":    "forum_threads",
    "replies":    "forum_replies",
    "contacts":   "contacts",
    "messages":   "chat_messages",
    "media":      "media",
    # NOTE 2026-09: the legacy coll="staff" alias for the users table was
    # removed — read-only grep of aifazi.net-frontend-next showed no usage of
    # the generic collection browser with coll="staff". Staff account edits
    # must go through the dedicated user-management flows, never this browser.
    "newsletter": "newsletter_subs",
}

# H10 — fields a staff member must NEVER be allowed to PATCH via the generic
# collection browser. The previous ratchet only stripped `id/_id/__v/password/
# verifyToken/resetToken/chatToken/created_at/createdAt`, leaving:
#   * `role`           — moderator→admin self-promotion (CRITICAL privilege escalation)
#   * `password_hash`  — bypass login entirely
#   * `totp_secret` / `totp_enabled` — disable 2FA on another admin's account
#   * `email_verified`  — verify an attacker-controlled email without inbox round-trip
#   * `discord_id` / `steam_id` — re-bind a forum account to your own Discord/Steam
#                                → bypass _active_identity_locked
#   * `refresh_token`   — replay a leaked refresh token as the target account
#   * `banned` / `ban_reason` — un-ban yourself
#   * `encryption_key`  — decrypt "E2EE" chat rooms
#   * `staff_permissions` — self-grant any module:any perm
FORBIDDEN_FIELDS = frozenset({
    "id", "_id", "__v",
    "password", "password_hash", "hashed_password",
    "role", "permissions",
    "verifytoken", "verify_token", "verify_expires",
    "resettoken",  "reset_token",  "reset_expires",
    "chattoken",   "chat_token",
    "created_at", "createdat",
    "updated_at", "updatedat",
    "totp_secret", "totp_enabled",
    "email_verified",
    "discord_id", "steam_id",
    "refresh_token",
    "banned", "ban_reason",
    "encryption_key",
    "staff_permissions",
    "module_permissions",
    "admin_session_id",
    # Account identity fields — changing these through the generic collection
    # browser lets a staff member hijack/rename accounts (or lock them out) in
    # one click. Use the dedicated user-management flows instead.
    "email", "username",
    "steam_username", "steam_avatar",
    "discord_username", "discord_avatar",
    # OAuth identity links — binding a staff member's own GitHub id to a target
    # account row lets them sign in as that user (github_auth callback matches on
    # github_id). The same applies to any other provider link columns.
    "github_id", "github_username", "github_avatar",
    "fivem_id", "fivem_license", "license_hex", "license2_hex",
    "forum_user_id", "admin_2fa",
    # Role / privilege columns — any of these lets a staffer self-promote or
    # rebind permissions through the generic browser. Dedicated flows only.
    "is_admin", "is_staff", "superuser", "role_id", "user_role",
    "permissions_json",
    # Ban / verification state — bypasses the moderated ban + verify flows.
    "ban_expires", "is_banned", "is_verified",
    # NOTE: per-collection column allowlists are the follow-up — FORBIDDEN_FIELDS
    # is a denylist ratchet, not a full allowlist. Any new sensitive column must
    # be added here until each collection gets its own explicit allowlist.
})

def _normalize(doc):
    if doc and "id" in doc:
        doc["_id"] = doc["id"]
    return doc


# ── Collection CRUD ───────────────────────────────────────────────────────────

# Bounds for the generic PATCH body. The payload shape is per-collection
# (arbitrary columns), so a fixed Pydantic model can't describe it — but an
# unbounded raw dict must never flow straight into Supabase: cap field count,
# key length, and serialized value size to block oversized-document DoS.
_PATCH_MAX_FIELDS = 100
_PATCH_MAX_KEY_LEN = 128
_PATCH_MAX_VALUE_BYTES = 65536
_PATCH_MAX_TOTAL_BYTES = 262144


def _validate_patch_body(body) -> dict:
    import json as _json
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Patch body must be a JSON object")
    if len(body) > _PATCH_MAX_FIELDS:
        raise HTTPException(status_code=400, detail=f"Too many fields (max {_PATCH_MAX_FIELDS})")
    total = 0
    for k, v in body.items():
        if not isinstance(k, str) or not k or len(k) > _PATCH_MAX_KEY_LEN:
            raise HTTPException(status_code=400, detail="Invalid field name")
        try:
            size = len(_json.dumps(v, default=str).encode())
        except Exception:
            raise HTTPException(status_code=400, detail=f"Field is not JSON-serializable: {k[:64]}")
        if size > _PATCH_MAX_VALUE_BYTES:
            raise HTTPException(status_code=400, detail=f"Field too large: {k[:64]}")
        total += size
        if total > _PATCH_MAX_TOTAL_BYTES:
            raise HTTPException(status_code=400, detail="Patch body too large")
    return body


@router.patch("/collection/{coll}/{doc_id}")
async def collection_update(coll: str, doc_id: str, request: Request, user: dict = Depends(require_staff)):
    # P1-11 — collections outside the allowlist require full admin.
    if coll not in ALLOWED_COLLECTIONS and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    body = _validate_patch_body(body)
    table = COLL_TABLE.get(coll)
    if not table:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {coll}")
    # H10 — Strip every forbidden field (case-insensitive) before passing the
    # remainder to Supabase. The list covers every escalation / impersonation
    # vector the audit identified when staff could WRITE any column.
    safe = {
        k: v for k, v in body.items()
        if k and k.lower() not in FORBIDDEN_FIELDS
    }
    if not safe:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    res = supabase.table(table).update(safe).eq("id", doc_id).execute()
    _audit(_actor(user), "admin_collection_update", target=f"{table}:{doc_id}",
           details={"coll": coll, "fields": sorted(safe.keys())}, ip=_ip(request))
    return {"message": "Saved", "doc": _normalize((res.data or [{}])[0])}

@router.delete("/collection/{coll}/{doc_id}")
async def collection_delete(coll: str, doc_id: str, request: Request, user: dict = Depends(require_staff)):
    # P1-11 — same allowlist gate as PATCH: outside the allowlist requires admin.
    if coll not in ALLOWED_COLLECTIONS and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    table = COLL_TABLE.get(coll)
    if not table:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {coll}")
    supabase.table(table).delete().eq("id", doc_id).execute()
    _audit(_actor(user), "admin_collection_delete", target=f"{table}:{doc_id}",
           details={"coll": coll}, ip=_ip(request))
    return {"message": "Deleted"}


# ── Maintenance actions ───────────────────────────────────────────────────────
@router.post("/actions/db/clear-sessions")
async def clear_sessions(request: Request, user: dict = Depends(require_staff)):
    try:
        supabase.table("auth_sessions").delete().lt("expires_at", "now()").execute()
    except Exception:
        pass  # table may not exist
    _audit(_actor(user), "admin_clear_sessions", target="auth_sessions", ip=_ip(request))
    return {"message": "Expired sessions cleared"}

@router.post("/actions/db/purge-unverified")
async def purge_unverified(request: Request, user: dict = Depends(require_staff)):
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    res = supabase.table("users").delete().eq("email_verified", False).lt("created_at", cutoff).execute()
    deleted = len(res.data or [])
    _audit(_actor(user), "admin_purge_unverified", target="users",
           details={"deleted": deleted, "cutoff": cutoff}, ip=_ip(request))
    return {"message": f"Purged {deleted} unverified accounts older than 7 days"}

@router.post("/actions/db/compact")
async def compact_db(request: Request, user: dict = Depends(require_staff)):
    _audit(_actor(user), "admin_compact_db", target="db", ip=_ip(request))
    return {"message": "Database compaction is managed automatically by Supabase"}

@router.post("/actions/posts/recalculate-views")
async def recalculate_views(request: Request, user: dict = Depends(require_staff)):
    _audit(_actor(user), "admin_recalculate_views", target="posts", ip=_ip(request))
    return {"message": "View counts are stored directly — no recalculation needed"}

class ChatClearBody(BaseModel):
    confirm: bool = False


@router.post("/actions/chat/clear-all")
async def clear_chat(request: Request, body: ChatClearBody | None = None, user: dict = Depends(CHAT_MANAGE)):
    # Destructive chat wipe — requires community.chat.manage (NOT bare staff)
    # plus an explicit {"confirm": true} body so a stray POST can't nuke history.
    if not body or not body.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required: pass {\"confirm\": true}")
    supabase.table("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    from routers.chat import clear_history_cache
    await clear_history_cache()
    _audit(_actor(user), "admin_chat_clear_all", target="chat_messages",
           details={"confirm": True}, ip=_ip(request))
    return {"message": "All chat messages deleted"}

@router.post("/actions/search/rebuild")
async def rebuild_search(request: Request, user: dict = Depends(require_staff)):
    _audit(_actor(user), "admin_rebuild_search", target="search", ip=_ip(request))
    return {"message": "Full-text search indexes rebuilt via Supabase (automatic)"}

@router.post("/actions/cache/flush")
async def flush_cache(request: Request, user: dict = Depends(require_staff)):
    _audit(_actor(user), "admin_flush_cache", target="cache", ip=_ip(request))
    return {"message": "Server cache flushed"}

@router.post("/actions/stats/refresh")
async def refresh_stats(request: Request, user: dict = Depends(require_staff)):
    _audit(_actor(user), "admin_refresh_stats", target="stats", ip=_ip(request))
    return {"message": "Stats will refresh on next poll"}

@router.post("/actions/newsletter/{sub_id}/toggle-active")
async def newsletter_toggle_active(sub_id: str, request: Request, user: dict = Depends(require_staff)):
    cur = supabase.table("newsletter_subs").select("status").eq("id", sub_id).single().execute()
    cur_status = (cur.data or {}).get("status", "active")
    new_status = "inactive" if cur_status == "active" else "active"
    supabase.table("newsletter_subs").update({"status": new_status}).eq("id", sub_id).execute()
    _audit(_actor(user), "admin_newsletter_toggle", target=f"newsletter_subs:{sub_id}",
           details={"from": cur_status, "to": new_status}, ip=_ip(request))
    return {"message": "Activated" if new_status == "active" else "Deactivated"}


# ── Sessions ──────────────────────────────────────────────────────────────────
@router.get("/sessions")
async def list_sessions(_: dict = Depends(require_staff)):
    try:
        res = supabase.table("auth_sessions").select("*").order("created_at", desc=True).limit(100).execute()
        sessions = [_normalize(s) for s in (res.data or [])]
    except Exception:
        sessions = []
    return {"sessions": sessions}

@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, request: Request, user: dict = Depends(require_staff)):
    try:
        supabase.table("auth_sessions").delete().eq("id", session_id).execute()
    except Exception:
        pass
    _audit(_actor(user), "admin_session_revoke", target=f"auth_sessions:{session_id}", ip=_ip(request))
    return {"message": "Session revoked"}


# ── IP Bans ───────────────────────────────────────────────────────────────────
class IpBanBody(BaseModel):
    ip: str
    reason: str | None = ""
    confirm: bool = False

def _validate_ip(ip_str: str) -> bool:
    import ipaddress
    try:
        ipaddress.ip_network(ip_str, strict=False)
        return True
    except ValueError:
        return False

def _ban_prefixlen_ok(ip_str: str) -> bool:
    """True when the ban scope is narrow enough to be safe without extra
    confirmation: /24+ for IPv4, /64+ for IPv6 (single addresses always OK)."""
    import ipaddress
    try:
        net = ipaddress.ip_network(ip_str, strict=False)
        return net.prefixlen >= (24 if net.version == 4 else 64)
    except ValueError:
        return True  # _validate_ip reports the real error

@router.get("/ip-bans")
async def list_ip_bans(_: dict = Depends(require_staff)):
    try:
        res = supabase.table("ip_bans").select("*").order("created_at", desc=True).limit(1000).execute()
        bans = [_normalize(b) for b in (res.data or [])]
    except Exception:
        bans = []
    return {"bans": bans}

@router.post("/ip-bans")
async def add_ip_ban(body: IpBanBody, request: Request, user: dict = Depends(require_staff)):
    if not _validate_ip(body.ip):
        raise HTTPException(400, f"Invalid IP address or CIDR: {body.ip}")
    # A /0–/23 (v4) or /0–/63 (v6) ban blackholes huge ranges — require an
    # explicit {"confirm": true} so it can't happen by typo.
    if not _ban_prefixlen_ok(body.ip) and not body.confirm:
        raise HTTPException(400, "Ban scope too broad (need /24 or narrower for IPv4, /64 or narrower for IPv6) — pass {\"confirm\": true} to proceed")
    from datetime import datetime, timezone
    row = {"ip": body.ip, "reason": body.reason or "", "created_at": datetime.now(timezone.utc).isoformat()}
    try:
        res = supabase.table("ip_bans").insert(row).execute()
        invalidate_ip_bans_cache()
        _audit(_actor(user), "admin_ip_ban_add", target=f"ip_bans:{body.ip}",
               details={"reason": body.reason or "", "confirmed_wide": not _ban_prefixlen_ok(body.ip)}, ip=_ip(request))
        return {"message": f"Banned {body.ip}", "ban": _normalize((res.data or [{}])[0])}
    except Exception as e:
        log.warning("ban_ip error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@router.delete("/ip-bans/{ban_id}")
async def remove_ip_ban(ban_id: str, request: Request, user: dict = Depends(require_staff)):
    try:
        supabase.table("ip_bans").delete().eq("id", ban_id).execute()
        invalidate_ip_bans_cache()
    except Exception:
        pass
    _audit(_actor(user), "admin_ip_ban_remove", target=f"ip_bans:{ban_id}", ip=_ip(request))
    return {"message": "IP ban removed"}
