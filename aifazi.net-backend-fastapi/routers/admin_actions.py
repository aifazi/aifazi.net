"""routers/admin_actions.py — Admin collection CRUD, maintenance ops, sessions, IP bans.
Mounted at /api/admin in main.py
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from dependencies import require_admin, require_staff
from permissions import require_permission
from utils.audit import record as _audit
from utils.rate_limit import invalidate_ip_bans_cache

import logging
import os
import secrets

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
    # Lowered camelCase aliases the collection browser echoes back into PATCH
    # payloads (stats.py _normalize adds emailVerified/banReason/lastSeen/
    # threadCount/replyCount next to the snake_case columns, and EditModal
    # sends every non-readonly key). Without these, "emailverified" etc. would
    # slip past this case-insensitive denylist. Real columns are snake_case,
    # so blocking the lowered aliases can never strip a legitimate write.
    "emailverified", "banreason", "lastseen", "threadcount", "replycount",
    # NOTE: per-collection column allowlists (COLL_FIELD_ALLOWLISTS below) are
    # now enforced on top of this denylist: unknown fields 400, and the
    # denylist still strips anything sensitive that slips through as backstop.
    # Any new sensitive column must still be added here.
})

# Per-collection PATCH field allowlists for the generic collection browser.
# Enumerated from read-only grep of the admin UI
# (aifazi.net-frontend-next/pages-src/DatabaseGUI.jsx: COLLS + COL_PRIORITY +
# EditModal payload = every doc key minus the frontend READONLY list) crossed
# with the columns each dedicated router actually writes (blog.py PostBody,
# forum.py thread/reply inserts, contact.py, newsletter.py, chat.py message
# insert/edit, upload.py _save_media). Keys are matched case-insensitively
# (stored lowercase); unknown field -> 400. Collections without an entry here
# (users/staff) stay on the legacy admin-only + FORBIDDEN_FIELDS path, and
# collections with no table mapping at all -> 403. require_staff /
# require_admin gating above is unchanged.
# Included-but-stripped keys (id/created_at/updated_at/role/email/...): the
# browser echoes them back in every save, so they must be *known* (else 400
# would break all saves) while FORBIDDEN_FIELDS still strips them before the
# Supabase write — existing behaviour preserved.
COLL_FIELD_ALLOWLISTS = {
    "posts": frozenset({
        "id", "_id",
        "title", "slug", "excerpt", "content", "cover_image", "video_url",
        "category", "tags", "published", "publish_at", "author_name",
        "views", "reactions",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
    "threads": frozenset({
        "id", "_id",
        "title", "content", "category_id", "author_id", "author_name",
        "tags", "attachments", "pinned", "locked", "views",
        "reply_count", "replycount", "likes",
        "last_reply_at", "last_reply_by",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
    "replies": frozenset({
        "id", "_id",
        "thread_id", "author_id", "author_name", "content", "attachments",
        "edited", "edited_at",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
    "contacts": frozenset({
        "id", "_id",
        "name", "email", "subject", "message", "replied", "replied_at",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
    "messages": frozenset({
        "id", "_id",
        "room_id", "sender", "role", "type", "content",
        "file_name", "file_size", "duration", "reply_to",
        "edited", "edited_at", "reactions",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
    "media": frozenset({
        "id", "_id",
        "filename", "original_name", "mimetype", "size", "url",
        "storage_path", "provider",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
    "newsletter": frozenset({
        "id", "_id",
        "email", "status",
        "created_at", "createdat", "updated_at", "updatedat",
    }),
}

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
        raise HTTPException(status_code=403, detail=f"Unknown collection: {coll}")
    # Per-collection allowlist: unknown field -> 400. Collections without an
    # entry (admin-only users path) keep the legacy denylist-only behaviour.
    allowed = COLL_FIELD_ALLOWLISTS.get(coll)
    if allowed is not None:
        unknown = sorted({k for k in body if k.lower() not in allowed})
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown field(s) for collection '{coll}': {', '.join(unknown[:10])}",
            )
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
        raise HTTPException(status_code=403, detail=f"Unknown collection: {coll}")
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


# ── Abuse kill-switch ─────────────────────────────────────────────────────────
# NOTE (rate limiting): main.py should cap /admin/actions/abuse-* at a low
# rate (e.g. ~5/min per admin account). These endpoints fan out to many
# Supabase round-trips and are destructive; they enforce require_admin +
# confirm:true server-side but carry no per-route throttle of their own.
#
# No new DB tables: the undo payload (per-surface prior state) lives in the
# audit row's details JSON alongside the undo_token. Undo looks the row up
# by scanning recent admin_abuse_ban rows for a matching undo_token.

ABUSE_SURFACES = ("chat", "forum", "vpn", "fivem", "ip")


class AbuseBanBody(BaseModel):
    username: str | None = None
    user_id: str | None = None
    reason: str = ""
    surfaces: list[str] | None = None
    confirm: bool = False
    ip: str | None = None


class AbuseUnbanBody(BaseModel):
    undo_token: str = ""
    confirm: bool = False


def _abuse_find_user(username: str | None, user_id: str | None) -> dict | None:
    """Resolve the ban target to a users row (user_id first, then username)."""
    try:
        if user_id:
            res = supabase.table("users").select("*").eq("id", user_id).limit(1).execute()
            if res.data:
                return res.data[0]
        if username:
            res = supabase.table("users").select("*").eq("username", username).limit(1).execute()
            if res.data:
                return res.data[0]
            res = supabase.table("users").select("*").ilike("username", username).limit(5).execute()
            for row in (res.data or []):
                if (row.get("username") or "").lower() == username.lower():
                    return row
            if res.data:
                return res.data[0]
    except Exception as exc:
        log.warning("abuse-ban user lookup failed: %s", exc)
    return None


def _abuse_last_ip(target: dict) -> str:
    """Best-effort last known IP: admin_sessions, then forum_sessions."""
    uname = (target.get("username") or "").strip()
    uid = str(target.get("id") or "").strip()
    candidates = []
    if uname:
        candidates.append(("admin_sessions", "username", uname))
    if uid:
        candidates.append(("forum_sessions", "user_id", uid))
    if uname:
        candidates.append(("forum_sessions", "username", uname))
    for table, key, val in candidates:
        try:
            res = supabase.table(table).select("ip,last_active").eq(key, val).limit(25).execute()
            rows = sorted(res.data or [], key=lambda r: r.get("last_active") or "", reverse=True)
            for row in rows:
                ip = (row.get("ip") or "").strip()
                if ip:
                    return ip
        except Exception:
            continue
    return ""


def _abuse_fivem_identifiers(target: dict) -> list[str]:
    """Collect prefixed FiveM identifiers from the linked users row."""
    prefixed = ("license:", "license2:", "steam:", "discord:", "fivem:")
    out: list[str] = []

    def _push(raw: str | None, prefix: str):
        val = (raw or "").strip()
        if not val or val in out:
            return
        low = val.lower()
        if any(low.startswith(p) for p in prefixed):
            out.append(val)
        elif prefix:
            labelled = f"{prefix}{val}"
            if labelled not in out:
                out.append(labelled)

    for key in ("fivem_license", "license", "license2", "license_hex", "license2_hex"):
        _push(target.get(key), "license:")
    for key in ("steam_hex", "steam_id", "steam"):
        _push(target.get(key), "steam:")
    for key in ("discord_id",):
        _push(target.get(key), "discord:")
    for key in ("fivem_id",):
        _push(target.get(key), "fivem:")
    return out


def _abuse_primary_identifier(ids: list[str]) -> str | None:
    for prefix in (("license:", "license2:"), ("steam",), ("discord:",), ("fivem:",)):
        for ident in ids:
            if ident.lower().startswith(prefix):
                return ident
    return ids[0] if ids else None


def _find_abuse_audit(undo_token: str) -> dict | None:
    """Find the admin_abuse_ban audit row holding this undo_token."""
    # (match-col, select-list) per schema: full schema first, then legacy
    # alias. Legacy rows (username/event, no details JSON) can never hold an
    # undo_token — the legacy branch is a graceful-degradation probe that
    # correctly matches nothing instead of crashing on missing columns.
    _schemas = (
        ("action", "id,actor,action,target,details,created_at"),
        ("event", "id,username,event,ip,created_at"),
    )
    for col, cols in _schemas:
        try:
            res = (
                supabase.table("audit_logs")
                .select(cols)
                .eq(col, "admin_abuse_ban")
                .order("created_at", desc=True)
                .limit(200)
                .execute()
            )
        except Exception:
            continue
        for row in (res.data or []):
            details = row.get("details") or row.get("meta") or {}
            if isinstance(details, dict) and details.get("undo_token") == undo_token:
                return row
    return None


_ABUSE_UNDO_TTL_HOURS = 72


def _find_abuse_unban(undo_token: str) -> dict | None:
    """Find an admin_abuse_unban row already consuming this undo_token.

    Undo tokens are single-use: a second POST with the same token must be
    refused (checked in abuse_unban before any restore runs).
    """
    for col in ("action", "event"):  # full schema first, then legacy alias
        try:
            res = (
                supabase.table("audit_logs")
                .select("id,actor,action,target,details,created_at")
                .eq(col, "admin_abuse_unban")
                .order("created_at", desc=True)
                .limit(200)
                .execute()
            )
        except Exception:
            continue
        for row in (res.data or []):
            details = row.get("details") or {}
            if isinstance(details, dict) and details.get("undo_token") == undo_token:
                return row
    return None


def _abuse_undo_expired(row: dict) -> bool:
    """True when the ban row is older than the undo TTL (fail-closed: an
    unparseable timestamp refuses the undo rather than granting it)."""
    from datetime import datetime, timedelta, timezone
    try:
        created = datetime.fromisoformat(str(row.get("created_at") or "").replace("Z", "+00:00"))
    except Exception:
        return True
    if not created.tzinfo:
        created = created.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created) > timedelta(hours=_ABUSE_UNDO_TTL_HOURS)


def _stamp_abuse_undone(row: dict, actor: str, now: str) -> None:
    """Best-effort: stamp undone_at/undone_by into the SAME ban audit row's
    details JSON. No-ops (warning only) on legacy-schema instances without a
    details column — the linked admin_abuse_unban row below is the durable
    single-use record there."""
    try:
        details = dict(row.get("details") or {})
        details["undone_at"] = now
        details["undone_by"] = actor
        supabase.table("audit_logs").update({"details": details}).eq("id", row.get("id")).execute()
    except Exception as exc:
        log.warning("abuse-unban undone_at stamp failed: %s", exc)


@router.post("/actions/abuse-ban")
async def abuse_ban(body: AbuseBanBody, request: Request, user: dict = Depends(require_admin)):
    from datetime import datetime, timezone
    if not body.confirm:
        raise HTTPException(status_code=400, detail='Confirmation required: pass {"confirm": true}')
    reason = (body.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="Reason is required (min 3 characters)")
    requested = list(body.surfaces) if body.surfaces else list(ABUSE_SURFACES)
    seen, surfaces = set(), []
    for surface in requested:
        if surface not in ABUSE_SURFACES:
            raise HTTPException(status_code=400, detail=f"Unknown surface: {surface}")
        if surface not in seen:
            seen.add(surface)
            surfaces.append(surface)

    target = _abuse_find_user((body.username or "").strip() or None, (body.user_id or "").strip() or None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    actor = _actor(user)
    if (target.get("role") or "") == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot be abuse-banned")
    if str(target.get("id") or "") == str(user.get("id") or "") or \
            (target.get("username") or "").lower() == (actor or "").lower():
        raise HTTPException(status_code=403, detail="You cannot ban yourself")
    if body.ip and not _validate_ip(body.ip.strip()):
        raise HTTPException(status_code=400, detail=f"Invalid IP address or CIDR: {body.ip}")

    now = datetime.now(timezone.utc).isoformat()
    target_id = str(target.get("id") or "")
    target_name = target.get("username") or ""
    results: dict = {}
    prior: dict = {"target_user_id": target_id, "target_username": target_name}

    # ── chat: ban from every room (skip rooms already banned; undo only removes ours)
    if "chat" in surfaces:
        try:
            rooms = supabase.table("chat_rooms").select("id").limit(500).execute()
            room_ids = [r.get("id") for r in (rooms.data or []) if r.get("id")]
            existing = supabase.table("chat_bans").select("room_id").eq("username", target_name).execute()
            already = {r.get("room_id") for r in (existing.data or []) if r.get("room_id")}
            created, failed = [], []
            for room_id in room_ids:
                if room_id in already:
                    continue
                try:
                    row = {"room_id": room_id, "username": target_name, "banned_by": actor,
                           "reason": reason, "created_at": now}
                    if target_id:
                        row["user_id"] = target_id
                    supabase.table("chat_bans").upsert(row, on_conflict="room_id,username").execute()
                    # Lose access immediately, mirroring POST /chat/rooms/{id}/ban.
                    supabase.table("chat_members").delete().eq("room_id", room_id).eq("username", target_name).execute()
                    created.append(room_id)
                except Exception as exc:
                    failed.append(room_id)
                    log.warning("abuse-ban chat failed room %s: %s", room_id, exc)
            prior["chat_created"] = created
            prior["chat_preexisting"] = sorted(already)
            results["chat"] = {"ok": not failed, "detail": f"banned in {len(created)} rooms ({len(already)} already banned)" + (f"; {len(failed)} failed" if failed else "")}
            if failed:
                results["chat"]["error"] = f"{len(failed)} rooms failed"
        except Exception as exc:
            log.warning("abuse-ban chat surface failed: %s", exc, exc_info=True)
            results["chat"] = {"ok": False, "error": "Chat ban failed"}

    # ── forum: users.banned + ban_reason direct update (pattern from routers/forum.py)
    if "forum" in surfaces:
        try:
            prior["forum"] = {"banned": bool(target.get("banned")), "ban_reason": target.get("ban_reason") or ""}
            supabase.table("users").update({"banned": True, "ban_reason": reason}).eq("id", target_id).execute()
            results["forum"] = {"ok": True, "detail": "account suspended"}
        except Exception as exc:
            log.warning("abuse-ban forum surface failed: %s", exc, exc_info=True)
            results["forum"] = {"ok": False, "error": "Forum suspend failed"}

    # ── vpn: suspend all peers (DB status; the periodic VPN sync enforces WG host removal)
    if "vpn" in surfaces:
        try:
            res = supabase.table("vpn_peers").select("id,status,suspended_reason").eq("user_id", target_id).execute()
            peers = res.data or []
            prior["vpn_peers"] = [{"id": p.get("id"), "status": p.get("status"),
                                   "suspended_reason": p.get("suspended_reason")} for p in peers]
            suspended, already_count, failed_vpn = 0, 0, 0
            for peer in peers:
                if peer.get("status") == "suspended":
                    already_count += 1
                    continue
                try:
                    supabase.table("vpn_peers").update(
                        {"status": "suspended", "suspended_reason": "manual"}
                    ).eq("id", peer.get("id")).execute()
                    suspended += 1
                except Exception as exc:
                    failed_vpn += 1
                    log.warning("abuse-ban vpn failed peer %s: %s", peer.get("id"), exc)
            results["vpn"] = {"ok": failed_vpn == 0, "detail": f"suspended {suspended} peers ({already_count} already suspended)" + (f"; {failed_vpn} failed" if failed_vpn else "")}
            if failed_vpn:
                results["vpn"]["error"] = f"{failed_vpn} peers failed"
        except Exception as exc:
            log.warning("abuse-ban vpn surface failed: %s", exc, exc_info=True)
            results["vpn"] = {"ok": False, "error": "VPN suspend failed"}

    # ── fivem: website ban row queued for txAdmin/qbx sync (mirrors POST /fivem/bans)
    if "fivem" in surfaces:
        try:
            ids = _abuse_fivem_identifiers(target)
            if not ids:
                results["fivem"] = {"ok": True, "detail": "skipped — no linked FiveM identifiers"}
            else:
                res = supabase.table("fivem_bans").select("id,identifier,all_ids").eq("active", True).limit(500).execute()
                idset = set(ids)
                clashes = [b.get("id") for b in (res.data or [])
                           if (b.get("identifier") in idset) or bool(idset & set(b.get("all_ids") or []))]
                if clashes:
                    prior["fivem_preexisting"] = clashes
                    results["fivem"] = {"ok": True, "detail": "already has an active ban — left untouched"}
                else:
                    ban_row = {"identifier": _abuse_primary_identifier(ids), "all_ids": ids,
                               "player_name": target_name, "reason": reason, "duration": "permanent",
                               "expires_at": None, "banned_by": actor, "banned_at": now,
                               "active": True, "source": "website",
                               "txadmin_synced": False, "txadmin_action_id": None}
                    ins = supabase.table("fivem_bans").insert(ban_row).execute()
                    ban_id = ((ins.data or [{}])[0] or {}).get("id")
                    prior["fivem_ban_id"] = ban_id
                    results["fivem"] = {"ok": True, "detail": "banned — queued for server sync", "ban_id": ban_id}
        except Exception as exc:
            log.warning("abuse-ban fivem surface failed: %s", exc, exc_info=True)
            results["fivem"] = {"ok": False, "error": "FiveM ban failed"}

    # ── ip: explicit IP else last known IP from admin/forum sessions
    if "ip" in surfaces:
        try:
            ip_addr = (body.ip or "").strip() or _abuse_last_ip(target)
            if not ip_addr:
                results["ip"] = {"ok": True, "detail": "skipped — no known IP"}
            elif not _validate_ip(ip_addr):
                results["ip"] = {"ok": False, "error": f"Resolved IP is not valid: {ip_addr}"}
            else:
                ins = supabase.table("ip_bans").insert(
                    {"ip": ip_addr, "reason": reason, "created_at": now}).execute()
                ban_id = ((ins.data or [{}])[0] or {}).get("id")
                invalidate_ip_bans_cache()
                prior["ip_ban_id"] = ban_id
                prior["ip"] = ip_addr
                results["ip"] = {"ok": True, "detail": f"banned {ip_addr}", "ban_id": ban_id}
        except Exception as exc:
            log.warning("abuse-ban ip surface failed: %s", exc, exc_info=True)
            results["ip"] = {"ok": False, "error": "IP ban failed"}

    undo_token = secrets.token_urlsafe(32)
    audit_ok = _audit(actor, "admin_abuse_ban", target=f"users:{target_id} ({target_name})",
                      details={"reason": reason, "surfaces": surfaces, "results": results,
                               "undo_token": undo_token, "prior": prior},
                      ip=_ip(request))
    if not audit_ok:
        log.warning("abuse-ban audit write failed — undo token %s may not be recoverable", undo_token)
    all_ok = all(r.get("ok") for r in results.values())
    return {"ok": all_ok, "results": results, "undo_token": undo_token,
            "audit_persisted": audit_ok,
            "target": {"user_id": target_id, "username": target_name}}


@router.post("/actions/abuse-unban")
async def abuse_unban(body: AbuseUnbanBody, request: Request, user: dict = Depends(require_admin)):
    from datetime import datetime, timezone
    if not body.confirm:
        raise HTTPException(status_code=400, detail='Confirmation required: pass {"confirm": true}')
    if not (body.undo_token or "").strip():
        raise HTTPException(status_code=400, detail="undo_token is required")
    row = _find_abuse_audit((body.undo_token or "").strip())
    if not row:
        raise HTTPException(status_code=404, detail="Undo token not found")
    # Single-use: refuse a token that already produced an unban.
    if _find_abuse_unban((body.undo_token or "").strip()):
        raise HTTPException(status_code=409, detail="This undo token has already been used")
    # 72h TTL: the undo payload (prior state) goes stale fast.
    if _abuse_undo_expired(row):
        raise HTTPException(status_code=410, detail="Undo window expired (72h after ban)")
    details = row.get("details") or {}
    prior = details.get("prior") or {}
    actor = _actor(user)
    now = datetime.now(timezone.utc).isoformat()
    target_id = prior.get("target_user_id") or ""
    target_name = prior.get("target_username") or ""
    results: dict = {}

    # forum: restore prior banned flag + reason
    if "forum" in prior:
        try:
            supabase.table("users").update(
                {"banned": bool(prior["forum"].get("banned")),
                 "ban_reason": prior["forum"].get("ban_reason") or ""}
            ).eq("id", target_id).execute()
            results["forum"] = {"ok": True, "detail": "suspend lifted"}
        except Exception as exc:
            log.warning("abuse-unban forum failed: %s", exc)
            results["forum"] = {"ok": False, "error": "Forum restore failed"}

    # chat: remove only the bans this kill-switch created
    if prior.get("chat_created") or "chat" in (details.get("surfaces") or []):
        try:
            removed = 0
            for room_id in (prior.get("chat_created") or []):
                try:
                    supabase.table("chat_bans").delete().eq("room_id", room_id).eq("username", target_name).execute()
                    removed += 1
                except Exception as exc:
                    log.warning("abuse-unban chat failed room %s: %s", room_id, exc)
            results["chat"] = {"ok": True, "detail": f"removed {removed} bans (pre-existing left intact)"}
        except Exception as exc:
            log.warning("abuse-unban chat failed: %s", exc)
            results["chat"] = {"ok": False, "error": "Chat restore failed"}

    # vpn: restore each peer's prior status (unsuspend re-adds on next sync)
    if "vpn_peers" in prior:
        try:
            restored, failed = 0, 0
            for peer in (prior.get("vpn_peers") or []):
                try:
                    supabase.table("vpn_peers").update(
                        {"status": peer.get("status") or "active",
                         "suspended_reason": peer.get("suspended_reason")}
                    ).eq("id", peer.get("id")).execute()
                    restored += 1
                except Exception as exc:
                    failed += 1
                    log.warning("abuse-unban vpn failed peer %s: %s", peer.get("id"), exc)
            results["vpn"] = {"ok": failed == 0, "detail": f"restored {restored} peers" + (f"; {failed} failed" if failed else "")}
            if failed:
                results["vpn"]["error"] = f"{failed} peers failed"
        except Exception as exc:
            log.warning("abuse-unban vpn failed: %s", exc)
            results["vpn"] = {"ok": False, "error": "VPN restore failed"}

    # fivem: lift only the ban row this kill-switch created (pre-existing rows untouched)
    if prior.get("fivem_ban_id"):
        try:
            supabase.table("fivem_bans").update(
                {"active": False, "unbanned_by": actor, "unbanned_at": now,
                 "source": "txadmin_unban_pending", "txadmin_synced": False}
            ).eq("id", prior["fivem_ban_id"]).execute()
            results["fivem"] = {"ok": True, "detail": "ban lifted — queued for server sync"}
        except Exception as exc:
            log.warning("abuse-unban fivem failed: %s", exc)
            results["fivem"] = {"ok": False, "error": "FiveM restore failed"}
    elif "fivem" in (details.get("surfaces") or []):
        results["fivem"] = {"ok": True, "detail": "nothing to restore"}

    # ip: delete the ip-ban row this kill-switch created
    if prior.get("ip_ban_id"):
        try:
            supabase.table("ip_bans").delete().eq("id", prior["ip_ban_id"]).execute()
            invalidate_ip_bans_cache()
            results["ip"] = {"ok": True, "detail": f"unbanned {prior.get('ip') or ''}".strip()}
        except Exception as exc:
            log.warning("abuse-unban ip failed: %s", exc)
            results["ip"] = {"ok": False, "error": "IP restore failed"}
    elif "ip" in (details.get("surfaces") or []):
        results["ip"] = {"ok": True, "detail": "nothing to restore"}

    _stamp_abuse_undone(row, actor, now)
    _audit(actor, "admin_abuse_unban", target=row.get("target") or f"users:{target_id} ({target_name})",
           details={"undo_token": body.undo_token.strip(), "restores_audit_id": row.get("id"),
                    "results": results},
           ip=_ip(request))
    all_ok = all(r.get("ok") for r in results.values())
    return {"ok": all_ok, "results": results,
            "target": {"user_id": target_id, "username": target_name}}


# ── Authentik user lifecycle (read-first, safe subset) ────────────────────────
# No usable Authentik admin credential exists server-side (only the OIDC
# client id/secret + issuer in authentik_oidc.py; no API token, no LDAP write
# path). So: list-only against the LOCAL users table annotated with Authentik
# linkage (users.authentik_id, written by the OIDC callback), and stub
# disable/enable with 501 until AUTHENTIK_API_TOKEN is configured. No LDAP
# writes, no password handling anywhere.
def _authentik_admin_configured() -> bool:
    return bool(os.getenv("AUTHENTIK_API_TOKEN", "").strip())


@router.get("/identity/users")
async def list_identity_users(_: dict = Depends(require_admin)):
    """Local users annotated with Authentik linkage status."""
    try:
        res = supabase.table("users") \
            .select("id,username,email,role,banned,authentik_id,last_seen") \
            .order("last_seen", desc=True).limit(200).execute()
    except Exception as exc:
        raise HTTPException(502, f"Could not list users: {str(exc)[:150]}")
    users = [{
        "id": r.get("id"),
        "username": r.get("username") or "",
        "email": r.get("email") or "",
        "role": r.get("role") or "user",
        "active": not bool(r.get("banned")),
        "authentik_linked": bool(r.get("authentik_id")),
        "last_seen": r.get("last_seen"),
    } for r in (res.data or [])]
    return {
        "users": users,
        "total": len(users),
        "authentik_admin": _authentik_admin_configured(),
        "mode": "authentik" if _authentik_admin_configured() else "local",
    }


class IdentityToggleBody(BaseModel):
    confirm: bool = False


async def _identity_toggle_stub(user_id: str, enable: bool, body: IdentityToggleBody,
                                request: Request, admin: dict):
    if not body.confirm:
        raise HTTPException(400, "This action requires confirm:true")
    _audit(_actor(admin), f"identity_user_{'enable' if enable else 'disable'}",
           target=f"users:{user_id}",
           details={"enabled": enable, "status": "not_configured"},
           ip=_ip(request))
    raise HTTPException(501, "Authentik admin token not configured (set AUTHENTIK_API_TOKEN)")


@router.post("/identity/users/{user_id}/disable")
async def disable_identity_user(user_id: str, body: IdentityToggleBody,
                                request: Request, admin: dict = Depends(require_admin)):
    await _identity_toggle_stub(user_id, False, body, request, admin)


@router.post("/identity/users/{user_id}/enable")
async def enable_identity_user(user_id: str, body: IdentityToggleBody,
                               request: Request, admin: dict = Depends(require_admin)):
    await _identity_toggle_stub(user_id, True, body, request, admin)
