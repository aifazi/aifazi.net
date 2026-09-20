"""auth_staff.py — Staff management (CRUD, permissions, search).

Thin wrappers over routers/auth.py (monolith) handlers: staff are `users`
rows with staff roles, so delegation guarantees zero behavior drift from the
shapes the admin panel was built against. The split router is included first,
so these routes serve; the monolith copies are shadowed but kept as reference.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, require_admin, require_staff
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
    from routers.auth import get_staff as _mono_list

    return await _mono_list(admin)


@router.get("/staff/search-users")
async def search_staff_users(q: str = Query("", min_length=1), admin: dict = Depends(require_admin)):
    from routers.auth import search_staff_users as _mono_search

    return await _mono_search(q, admin)


@router.post("/staff")
async def create_staff(payload: dict, request: Request, admin: dict = Depends(require_admin)):
    """Create a staff user. Accepts the monolith's StaffCreateBody shape."""
    from routers.auth import StaffCreateBody
    from routers.auth import create_staff as _mono_create

    return await _mono_create(StaffCreateBody(**(payload or {})), request, admin)


@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, payload: dict, admin: dict = Depends(require_admin)):
    from routers.auth import StaffUpdateBody
    from routers.auth import update_staff as _mono_update

    return await _mono_update(staff_id, StaffUpdateBody(**(payload or {})), admin)


@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, request: Request, admin: dict = Depends(require_admin)):
    from routers.auth import delete_staff as _mono_delete

    return await _mono_delete(staff_id, request, admin)


@router.get("/admin-gate-token")
async def admin_gate_token(user: dict = Depends(require_staff)):
    """Short-lived admin gate token for sensitive operations."""
    from routers.auth import make_admin_gate_token

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
    from routers.auth import ADMIN_USERNAME, make_refresh_token, make_token

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
