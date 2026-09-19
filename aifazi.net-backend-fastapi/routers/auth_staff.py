"""auth_staff.py — Staff management (CRUD, permissions, search).

Extracted from auth.py. Handles staff user management for admin panel.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, require_staff, require_permission

router = APIRouter()
log = logging.getLogger("auth.staff")


# ── Models ───────────────────────────────────────────────────────────────────
class CreateStaffBody(BaseModel):
    username: str
    password: str = Field(min_length=8)
    role: str = "staff"
    display_name: str | None = None
    email: str | None = None


class UpdateStaffBody(BaseModel):
    password: str | None = None
    role: str | None = None
    display_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/permissions")
async def get_permissions(user: dict = Depends(require_staff)):
    """Get current user's permissions."""
    username = user.get("username") or ""
    role = user.get("role", "staff")
    res = supabase.table("staff_users").select("permissions").eq("username", username).limit(1).execute()
    permissions = res.data[0].get("permissions", []) if res.data else []
    return {"role": role, "permissions": permissions}


@router.get("/staff")
async def list_staff(user: dict = Depends(require_permission("staff:read"))):
    """List all staff users."""
    res = supabase.table("staff_users").select("username,role,display_name,email,is_active,created_at").order("created_at", desc=True).execute()
    return res.data or []


@router.get("/staff/search-users")
async def search_staff_users(q: str = Query("", min_length=1), user: dict = Depends(require_permission("staff:read"))):
    """Search staff users by username."""
    res = supabase.table("staff_users").select("username,role,display_name,email").ilike("username", f"%{q}%").limit(20).execute()
    return res.data or []


@router.post("/staff")
async def create_staff(body: CreateStaffBody, user: dict = Depends(require_permission("staff:write"))):
    """Create a new staff user."""
    from passlib.hash import bcrypt
    username = body.username.strip().lower()
    existing = supabase.table("staff_users").select("username").eq("username", username).limit(1).execute()
    if existing.data:
        raise HTTPException(400, "Username already exists")
    hashed = bcrypt.hash(body.password)
    supabase.table("staff_users").insert({
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": hashed,
        "role": body.role,
        "display_name": body.display_name or username,
        "email": body.email,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"ok": True, "username": username}


@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, body: UpdateStaffBody, user: dict = Depends(require_permission("staff:write"))):
    """Update a staff user."""
    updates = {}
    if body.password is not None:
        from passlib.hash import bcrypt
        updates["password_hash"] = bcrypt.hash(body.password)
    if body.role is not None:
        updates["role"] = body.role
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.email is not None:
        updates["email"] = body.email
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if updates:
        supabase.table("staff_users").update(updates).eq("id", staff_id).execute()
    return {"ok": True}


@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, user: dict = Depends(require_permission("staff:delete"))):
    """Delete a staff user."""
    supabase.table("staff_users").delete().eq("id", staff_id).execute()
    return {"ok": True}


@router.get("/admin-gate-token")
async def admin_gate_token(user: dict = Depends(require_staff)):
    """Get a short-lived admin gate token for sensitive operations."""
    from paseto_token import create_token
    username = user.get("username") or ""
    token = create_token({"sub": username, "purpose": "admin_gate"}, purpose="auth", expires_in=300)
    return {"token": token}
