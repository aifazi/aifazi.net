"""auth_staff.py — Staff management (CRUD, permissions, search).

Thin wrappers over routers/auth.py (monolith) handlers: staff are `users`
rows with staff roles, so delegation guarantees zero behavior drift from the
shapes the admin panel was built against. The split router is included first,
so these routes serve; the monolith copies are shadowed but kept as reference.
"""
import logging

from fastapi import APIRouter, Depends, Query, Request

from database import supabase
from dependencies import require_admin, require_staff

router = APIRouter()
log = logging.getLogger("auth.staff")


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
