"""auth_staff.py — Staff management (CRUD, permissions, search, verify).

Staff are `users` rows with staff roles. The CRUD handlers moved here from
routers/auth.py (god-file split) keeping the dict-payload signatures the
admin panel was built against.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from database import _escape_ilike, safe_search_term, supabase
from dependencies import get_current_user, require_admin, require_staff
from permissions import normalize_permissions, resolve_staff_access, role_permissions
from routers.auth_shared import (
    StaffCreateBody,
    StaffUpdateBody,
    _clean_username,
    _ensure_email_available,
    _hash,
    _normalized_email,
    _queue_staff_email_verification,
    _staff_public,
)
from utils.audit import record as _audit

router = APIRouter()
log = logging.getLogger("auth.staff")

# Short-lived impersonation sessions: 15 min access, refresh minted but never
# persisted (see impersonate()) so the session dies at access-token expiry.


@router.get("/permissions")
async def get_permissions(user: dict = Depends(require_staff)):
    """Current user's role + effective permissions (any staff; admin catalog
    lives at the monolith's admin-only handler)."""
    username = user.get("username") or ""
    role = user.get("role", "staff")
    res = supabase.table("users").select("staff_permissions").eq("username", username).limit(1).execute()
    permissions = res.data[0].get("staff_permissions", []) if res.data else []
    return {"role": role, "permissions": permissions}


@router.get("/staff")
async def list_staff(admin: dict = Depends(require_admin)):
    res = supabase.table("users").select("id,username,email,role,created_at,last_seen,staff_permissions").in_("role", ["admin","moderator","editor","chat"]).limit(500).execute()
    return [_staff_public(r) for r in (res.data or [])]


@router.get("/staff/search-users")
async def search_staff_users(q: str = Query("", min_length=1), admin: dict = Depends(require_admin)):
    query = safe_search_term(q)
    if len(query) < 2:
        return {"users": []}
    try:
        res = supabase.table("users").select("id,username,email,avatar,role,discord_id,discord_username,steam_id,steam_username").or_(
            f"username.ilike.%{query}%,email.ilike.%{query}%,discord_username.ilike.%{query}%,discord_id.ilike.%{query}%,steam_username.ilike.%{query}%"
        ).limit(10).execute()
        users = res.data or []
    except Exception:
        users = []
    return {"users": users}


# Staff presence/feed allowlist. The users table has NO display_name column
# (display name IS username — see auth_profile.py) and NO website_url column;
# avatar lives in avatar/profile_avatar (auth code reads both, preferring
# profile_avatar). Only these safe columns are ever selected/returned here —
# NEVER password_hash, refresh_token/tokens, totp_secret, staff_permissions
# or other secrets.
_STAFF_FEED_COLUMNS = "id,username,avatar,profile_avatar,role"
_STAFF_FEED_ROLES = ("admin", "moderator", "editor", "chat")


@router.get("/staff/feed")
async def staff_feed(user: dict = Depends(get_current_user)):
    """Authenticated staff presence feed (replaces the anon `staff_users`
    Realtime/SELECT feed).

    Any logged-in user may read it (the old anon feed was world-readable;
    now auth is required and only safe presence columns are returned).
    Returns [{id, username, display_name, avatar, role}] for staff-role
    users rows. The legacy anon `staff_users` SELECT policy is dropped by
    migration 20260927000000 — anonymous callers now get 401 here instead.
    """
    res = supabase.table("users").select(_STAFF_FEED_COLUMNS).in_("role", list(_STAFF_FEED_ROLES)).limit(500).execute()
    out = []
    for r in (res.data or []):
        out.append({
            "id": r.get("id"),
            "username": r.get("username") or "",
            "display_name": r.get("username") or "",
            "avatar": r.get("profile_avatar") or r.get("avatar") or "",
            "role": r.get("role") or "",
        })
    return {"staff": out}


@router.post("/staff")
async def create_staff(payload: dict, request: Request, admin: dict = Depends(require_admin)):
    """Create a staff user. Accepts the StaffCreateBody shape."""
    body = StaffCreateBody(**(payload or {}))
    # P2-10 — the `chat` role is dead (community.chat module removed); new
    # staff can only be moderator/editor.
    if body.role not in ("moderator", "editor"):
        raise HTTPException(400, "Invalid role")
    perms = normalize_permissions(body.module_permissions or role_permissions(body.role))
    username = _clean_username(body.username or "")
    email = _normalized_email(str(body.email or ""))
    if not username or len(username) < 3:
        raise HTTPException(400, "Username is required")
    if email:
        _ensure_email_available(email)
    existing = supabase.table("users").select("id").ilike("username", _escape_ilike(username)).limit(5).execute()
    if any((r.get("username") or "").lower() == username.lower() for r in (existing.data or [])):
        raise HTTPException(409, "Username already exists")
    payload_row = {"username": username, "email": email, "email_verified": False, "role": body.role, "created_by": "admin", "staff_permissions": perms}
    if not body.password or len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not email:
        raise HTTPException(400, "Email is required")
    payload_row["password_hash"] = _hash(body.password)
    res = supabase.table("users").insert(payload_row).execute()
    if email:
        await _queue_staff_email_verification("staff", email, staff_id=res.data[0]["id"])
    _audit(admin.get("username", "admin"), "staff_create", target=username, details={"role": body.role}, ip=request.client.host if request.client else "")
    return _staff_public(res.data[0])


@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, payload: dict, admin: dict = Depends(require_admin)):
    body = StaffUpdateBody(**(payload or {}))
    updates: dict = {}
    if body.username:  updates["username"]      = _clean_username(body.username)
    if body.email is not None:
        current = supabase.table("users").select("email,email_verified").eq("id", staff_id).limit(1).execute()
        current_row = (current.data or [{}])[0]
        email = _normalized_email(str(body.email))
        _ensure_email_available(email, exclude_staff_id=staff_id)
        updates["email"] = email
        updates["email_verified"] = bool(current_row.get("email_verified")) if email == _normalized_email(current_row.get("email") or "") else False
    if body.role:
        if body.role not in ("moderator", "editor"):
            raise HTTPException(400, "Invalid role")
        updates["role"] = body.role
    if body.module_permissions is not None:
        updates["staff_permissions"] = normalize_permissions(body.module_permissions)
    elif body.role:
        updates["staff_permissions"] = role_permissions(body.role)
    if body.password:
        updates["password_hash"] = _hash(body.password)
    if not updates:
        raise HTTPException(400, "Nothing to update")
    res = supabase.table("users").update(updates).eq("id", staff_id).execute()
    if not res.data:
        raise HTTPException(404, "Staff member not found")
    row = res.data[0]
    if body.email is not None and row.get("email") and not row.get("email_verified"):
        await _queue_staff_email_verification("staff", row["email"], staff_id=staff_id)
    return _staff_public(row)


@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, request: Request, admin: dict = Depends(require_admin)):
    row = supabase.table("users").select("username,role").eq("id", staff_id).execute()
    target_name = row.data[0]["username"] if row.data else staff_id
    supabase.table("users").update({"role": "member", "staff_permissions": {}}).eq("id", staff_id).execute()
    _audit(admin.get("username", "admin"), "staff_delete", target=target_name,
           details={}, ip=request.client.host if request.client else "")
    return {"message": "Deleted"}


# ── Staff access verify + user lookup ──────────────────────────────────────────
@router.get("/verify")
async def verify_token(user: dict = Depends(get_current_user)):
    access = resolve_staff_access(user)
    if not access:
        return {"valid": False, "user": {
            "username": user.get("username", ""),
            "role": user.get("role", "user"),
            "permissions": [],
            "staff_account": False,
        }}
    return {"valid": True, "user": {
        "username": access.get("username") or user.get("username"),
        "role": access.get("role") or user.get("role"),
        "permissions": normalize_permissions(access.get("permissions")),
        "staff_account": True,
    }}


@router.get("/lookup")
async def lookup_user(username: str, _: dict = Depends(require_staff)):
    if not username or len(username.strip()) < 2:
        return {"found": False}
    res = supabase.table("users").select("id,username,email,avatar,discord_id,discord_username,discord_avatar").ilike("username", f"%{safe_search_term(username.strip())}%").limit(5).execute()
    if not res.data:
        return {"found": False}
    users = res.data
    exact = next((u for u in users if u["username"].lower() == username.strip().lower()), None)
    u = exact or users[0]
    return {"found": True, "id": u["id"], "username": u["username"], "email": u.get("email"), "avatar": u.get("avatar") or u.get("discord_avatar"), "discord_id": u.get("discord_id"), "discord_username": u.get("discord_username")}


@router.get("/admin-gate-token")
async def admin_gate_token(user: dict = Depends(require_staff)):
    """Short-lived admin gate token for sensitive operations."""
    from utils.auth_tokens import make_admin_gate_token

    return {"token": make_admin_gate_token({"username": user.get("username") or ""})}


# ── User impersonation ("view as") ────────────────────────────────────────────
IMPERSONATION_TTL_MIN = 15


class ImpersonateBody(BaseModel):
    user_id: str = ""
    confirm: bool = False


def _lookup_user(target_key: str) -> dict | None:
    """Find a users row by id, falling back to username."""
    for col in ("id", "username"):
        try:
            res = supabase.table("users").select("id,username,email,role") \
                .eq(col, target_key).limit(1).execute()
        except Exception:
            continue
        if res and res.data:
            return res.data[0]
    return None


@router.post("/staff/impersonate")
async def impersonate(body: ImpersonateBody, request: Request, admin: dict = Depends(require_admin)):
    """Mint a short-lived "view as" token for a non-admin user.

    Returns tokens in the BODY (never Set-Cookie) so the admin's own HttpOnly
    session cookies stay intact — the frontend holds the impersonated token in
    memory and sends it as an explicit Authorization header, which
    CookieHTTPBearer prefers over the cookie. Refresh is minted for shape
    compatibility but deliberately NOT persisted to users.refresh_token, so
    /refresh (DB-validated) rejects it and the session dies at access expiry.
    """
    # Lazy import: routers/auth.py imports this module at load time.
    from utils.auth_tokens import ADMIN_USERNAME, make_refresh_token, make_token

    if not body.confirm:
        raise HTTPException(400, "Impersonation requires confirm:true")
    target_key = (body.user_id or "").strip()
    if not target_key:
        raise HTTPException(422, "user_id is required")
    row = _lookup_user(target_key)
    if not row:
        raise HTTPException(404, "User not found")
    if (row.get("username") or "") == ADMIN_USERNAME or (row.get("role") or "") == "admin":
        raise HTTPException(403, "Cannot impersonate another admin")
    actor = str(admin.get("username") or "admin")
    target_name = str(row.get("username") or target_key)
    claims = {
        "username": target_name,
        "role": row.get("role") or "user",
        "id": row.get("id"),
        "impersonated": True,
        "impersonated_by": actor,
    }
    token = make_token(claims, IMPERSONATION_TTL_MIN)
    refresh = make_refresh_token(claims, IMPERSONATION_TTL_MIN)
    _audit(actor, "impersonation_start", target=target_name,
           details={"target_id": str(row.get("id") or ""), "impersonated": True,
                    "expires_in_minutes": IMPERSONATION_TTL_MIN},
           ip=request.client.host if request.client else "")
    return {
        "token": token,
        "refreshToken": refresh,
        "expires_in_minutes": IMPERSONATION_TTL_MIN,
        "user": {"username": target_name, "role": claims["role"], "email": row.get("email") or ""},
    }


@router.post("/staff/unimpersonate")
async def unimpersonate(request: Request, user: dict = Depends(get_current_user)):
    """Audit the end of an impersonated session. The client drops the memory
    token; the server cannot revoke a bearer token, but the unpersisted refresh
    guarantees the session dies at access expiry (~15 min).

    NOTE: intentionally NOT require_admin — the caller holds an impersonated
    (non-admin) token by definition. The endpoint is audit-only and grants no
    privilege, so any authenticated impersonated session may call it.
    """
    if not user.get("impersonated"):
        raise HTTPException(400, "Not an impersonated session")
    actor = str(user.get("impersonated_by") or "admin")
    _audit(actor, "impersonation_end", target=str(user.get("username") or ""),
           details={"impersonated": True},
           ip=request.client.host if request.client else "")
    return {"ok": True}
