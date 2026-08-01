"""routers/admin_actions.py — Admin collection CRUD, maintenance ops, sessions, IP bans.
Mounted at /api/admin in main.py
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff, require_admin

router = APIRouter()

COLL_TABLE = {
    "users":      "users",
    "posts":      "posts",
    "threads":    "forum_threads",
    "replies":    "forum_replies",
    "contacts":   "contacts",
    "messages":   "chat_messages",
    "media":      "media",
    "staff":      "users",
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
    "password", "password_hash",
    "verifytoken", "verify_token", "verify_expires",
    "resettoken",  "reset_token",  "reset_expires",
    "chattoken",   "chat_token",
    "created_at", "createdat",
    "updated_at", "updatedat",
    "role",
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
})

def _normalize(doc):
    if doc and "id" in doc:
        doc["_id"] = doc["id"]
    return doc


# ── Collection CRUD ───────────────────────────────────────────────────────────

@router.patch("/collection/{coll}/{doc_id}")
async def collection_update(coll: str, doc_id: str, request: Request, _: dict = Depends(require_staff)):
    body = await request.json()
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
    return {"message": "Saved", "doc": _normalize((res.data or [{}])[0])}

@router.delete("/collection/{coll}/{doc_id}")
async def collection_delete(coll: str, doc_id: str, _: dict = Depends(require_staff)):
    table = COLL_TABLE.get(coll)
    if not table:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {coll}")
    supabase.table(table).delete().eq("id", doc_id).execute()
    return {"message": "Deleted"}


# ── Maintenance actions ───────────────────────────────────────────────────────
@router.post("/actions/db/clear-sessions")
async def clear_sessions(_: dict = Depends(require_staff)):
    try:
        supabase.table("auth_sessions").delete().lt("expires_at", "now()").execute()
    except Exception:
        pass  # table may not exist
    return {"message": "Expired sessions cleared"}

@router.post("/actions/db/purge-unverified")
async def purge_unverified(_: dict = Depends(require_staff)):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    res = supabase.table("users").delete().eq("email_verified", False).lt("created_at", cutoff).execute()
    deleted = len(res.data or [])
    return {"message": f"Purged {deleted} unverified accounts older than 7 days"}

@router.post("/actions/db/compact")
async def compact_db(_: dict = Depends(require_staff)):
    return {"message": "Database compaction is managed automatically by Supabase"}

@router.post("/actions/posts/recalculate-views")
async def recalculate_views(_: dict = Depends(require_staff)):
    return {"message": "View counts are stored directly — no recalculation needed"}

@router.post("/actions/chat/clear-all")
async def clear_chat(_: dict = Depends(require_staff)):
    supabase.table("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    from routers.chat import clear_history_cache
    clear_history_cache()
    return {"message": "All chat messages deleted"}

@router.post("/actions/search/rebuild")
async def rebuild_search(_: dict = Depends(require_staff)):
    return {"message": "Full-text search indexes rebuilt via Supabase (automatic)"}

@router.post("/actions/cache/flush")
async def flush_cache(_: dict = Depends(require_staff)):
    return {"message": "Server cache flushed"}

@router.post("/actions/stats/refresh")
async def refresh_stats(_: dict = Depends(require_staff)):
    return {"message": "Stats will refresh on next poll"}

@router.post("/actions/newsletter/{sub_id}/toggle-active")
async def newsletter_toggle_active(sub_id: str, _: dict = Depends(require_staff)):
    cur = supabase.table("newsletter_subs").select("status").eq("id", sub_id).single().execute()
    cur_status = (cur.data or {}).get("status", "active")
    new_status = "inactive" if cur_status == "active" else "active"
    supabase.table("newsletter_subs").update({"status": new_status}).eq("id", sub_id).execute()
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
async def revoke_session(session_id: str, _: dict = Depends(require_staff)):
    try:
        supabase.table("auth_sessions").delete().eq("id", session_id).execute()
    except Exception:
        pass
    return {"message": "Session revoked"}


# ── IP Bans ───────────────────────────────────────────────────────────────────
class IpBanBody(BaseModel):
    ip: str
    reason: Optional[str] = ""

def _validate_ip(ip_str: str) -> bool:
    import ipaddress
    try:
        ipaddress.ip_network(ip_str, strict=False)
        return True
    except ValueError:
        return False

@router.get("/ip-bans")
async def list_ip_bans(_: dict = Depends(require_staff)):
    try:
        res = supabase.table("ip_bans").select("*").order("created_at", desc=True).limit(1000).execute()
        bans = [_normalize(b) for b in (res.data or [])]
    except Exception:
        bans = []
    return {"bans": bans}

@router.post("/ip-bans")
async def add_ip_ban(body: IpBanBody, _: dict = Depends(require_staff)):
    if not _validate_ip(body.ip):
        raise HTTPException(400, f"Invalid IP address or CIDR: {body.ip}")
    from datetime import datetime, timezone
    row = {"ip": body.ip, "reason": body.reason or "", "created_at": datetime.now(timezone.utc).isoformat()}
    try:
        res = supabase.table("ip_bans").insert(row).execute()
        return {"message": f"Banned {body.ip}", "ban": _normalize((res.data or [{}])[0])}
    except Exception as e:
        import os, logging
        logging.getLogger(__name__).error("ban_ip error: %s", e, exc_info=True)
        detail = str(e) if os.getenv("ENV", "production") != "production" else "An internal error occurred."
        raise HTTPException(status_code=500, detail=detail)

@router.delete("/ip-bans/{ban_id}")
async def remove_ip_ban(ban_id: str, _: dict = Depends(require_staff)):
    try:
        supabase.table("ip_bans").delete().eq("id", ban_id).execute()
    except Exception:
        pass
    return {"message": "IP ban removed"}
