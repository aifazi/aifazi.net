"""Granular admin/staff permission helpers.

The JWT is still only an identity hint. Effective staff access is resolved from
staff_users so linked forum accounts can receive module-specific access without
becoming full admins.
"""
from __future__ import annotations

from typing import Any
from fastapi import Depends, HTTPException

STAFF_ROLES = {"admin", "moderator", "editor", "chat"}
ACTIONS = ("view", "create", "edit", "delete", "approve", "sync", "manage", "export")
MODULES = {
    "home": "Dashboard",
    "content.posts": "Posts",
    "content.editor": "Post editor",
    "content.media": "Media",
    "content.pages": "Pages",
    "content.themes": "Theme library",
    "community.contacts": "Contacts",
    "community.staff": "Staff",
    "community.forum": "Forum",
    "community.chat": "Chat",
    "community.newsletter": "Newsletter",
    "system.db": "DB monitor",
    "system.mail": "Mail",
    "system.cdn": "CDN",
    "system.backup": "Backup",
    "system.monitor": "Monitoring",
    "system.audit": "Audit log",
    "system.announcements": "Announcements",
    "system.settings": "Settings",
    "support.helpdesk": "Help desk",
    "store": "Store",
    "store.analytics": "Store analytics",
    "store.products": "Store products",
    "store.categories": "Store categories",
    "store.orders": "Store orders",
    "store.payments": "Store payments",
    "store.customers": "Store customers",
    "store.coupons": "Store coupons",
    "store.deals": "Store deals",
    "store.reviews": "Store reviews",
    "store.inventory": "Store inventory",
    "store.delivery": "Store delivery",
    "store.settings": "Store settings",
    "fivem.status": "FiveM status",
    "fivem.whitelist": "FiveM whitelist",
    "fivem.forms": "FiveM forms",
    "fivem.approval_log": "FiveM approval log",
    "fivem.bans": "FiveM bans",
    "dev.seo": "SEO tools",
    "dev.network": "Network tools",
    "dev.files": "File tools",
    "profile": "My profile",
    "changelog": "Changelog",
}

ROLE_PERMISSION_PRESETS: dict[str, dict[str, list[str]]] = {
    "admin": {"*": ["manage"]},
    "moderator": {
        "home": ["view"], "community.forum": ["view", "edit", "delete", "manage"],
        "community.chat": ["view", "edit", "delete", "manage"], "support.helpdesk": ["view", "edit"],
        "content.media": ["view", "create", "edit", "delete"],
        "store": ["view", "edit", "manage"],
        "fivem.status": ["view"], "fivem.whitelist": ["view", "approve", "sync"],
        "fivem.forms": ["view", "approve"], "fivem.approval_log": ["view"], "fivem.bans": ["view", "create", "edit"],
        "system.monitor": ["view"],
        "profile": ["view", "edit"], "changelog": ["view"],
    },
    "editor": {
        "home": ["view"], "content.posts": ["view", "create", "edit", "delete"],
        "content.editor": ["view", "create", "edit"], "content.media": ["view", "create", "edit", "delete"],
        "content.pages": ["view", "edit"], "content.themes": ["view", "edit"],
        "system.announcements": ["view", "create", "edit", "delete"], "profile": ["view", "edit"], "changelog": ["view"],
    },
    "chat": {"community.chat": ["view", "create", "edit"], "profile": ["view", "edit"]},
}


def normalize_permissions(value: Any) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, list[str]] = {}
    for module, actions in value.items():
        key = str(module or "").strip()
        if not key:
            continue
        if actions is True:
            out[key] = ["manage"]
        elif isinstance(actions, str):
            out[key] = [actions]
        elif isinstance(actions, (list, tuple, set)):
            out[key] = sorted({str(a).strip() for a in actions if str(a or "").strip()})
    return out


def merge_permissions(*sets: dict[str, list[str]]) -> dict[str, list[str]]:
    merged: dict[str, set[str]] = {}
    for perms in sets:
        for module, actions in normalize_permissions(perms).items():
            merged.setdefault(module, set()).update(actions)
    return {m: sorted(a) for m, a in merged.items()}


def role_permissions(role: str | None) -> dict[str, list[str]]:
    return normalize_permissions(ROLE_PERMISSION_PRESETS.get(str(role or "").lower(), {}))


def _supabase():
    from database import supabase
    return supabase


def resolve_staff_access(user: dict | None) -> dict | None:
    if not user:
        return None
    role = str(user.get("role") or "").lower()
    if role == "admin":
        return {"role": "admin", "permissions": role_permissions("admin"), "staff_account": True, "admin_access": True}

    user_id = str(user.get("id") or user.get("_id") or "").strip()
    username = str(user.get("username") or "").strip()
    row = None
    try:
        sb = _supabase()
        if user_id:
            res = sb.table("users").select("id,username,email,role,staff_permissions,banned,last_seen,created_at,profile_bio,profile_avatar,email_verified").eq("id", user_id).limit(1).execute()
            row = (res.data or [None])[0]
        if not row and username:
            res = sb.table("users").select("id,username,email,role,staff_permissions,banned,last_seen,created_at,profile_bio,profile_avatar,email_verified").ilike("username", username).limit(5).execute()
            row = next((r for r in (res.data or []) if str(r.get("username", "")).lower() == username.lower() and r.get("role") in STAFF_ROLES), None)
    except Exception:
        row = None

    if row and row.get("role") in STAFF_ROLES:
        eff_role = str(row.get("role") or role or "").lower()
        if row.get("banned"):
            raise HTTPException(status_code=403, detail="Staff account suspended")
        return {
            "id": row.get("id"), "staff_id": row.get("id"),
            "username": row.get("username") or username, "email": row.get("email") or user.get("email") or "",
            "role": eff_role, "permissions": merge_permissions(role_permissions(eff_role), row.get("staff_permissions") or {}),
            "staff_account": True, "admin_access": eff_role == "admin", "staff_row": row,
        }

    if role in STAFF_ROLES:
        return {"role": role, "permissions": role_permissions(role), "staff_account": True, "admin_access": role == "admin"}
    return None


def has_permission(user: dict | None, module: str, action: str = "view") -> bool:
    access = resolve_staff_access(user)
    if not access:
        return False
    if access.get("role") == "admin":
        return True
    perms = normalize_permissions(access.get("permissions"))
    actions = set(perms.get(module, [])) | set(perms.get("*", []))
    return "manage" in actions or action in actions


def require_permission(module: str, action: str = "view"):
    from dependencies import get_current_user
    def _check(user: dict = Depends(get_current_user)) -> dict:
        access = resolve_staff_access(user)
        if not access:
            raise HTTPException(status_code=403, detail="Staff only")
        if access.get("role") != "admin" and not has_permission(user, module, action):
            raise HTTPException(status_code=403, detail=f"Permission required: {module}.{action}")
        return {**user, **{k: v for k, v in access.items() if k != "staff_row"}}
    return _check


def require_any_permission(*modules: str, action: str = "view"):
    """Allow access if the caller has ANY of the given modules (e.g. the
    umbrella 'store' module OR a fine-grained 'store.<sub>' module)."""
    from dependencies import get_current_user
    def _check(user: dict = Depends(get_current_user)) -> dict:
        access = resolve_staff_access(user)
        if not access:
            raise HTTPException(status_code=403, detail="Staff only")
        if access.get("role") == "admin":
            return {**user, **{k: v for k, v in access.items() if k != "staff_row"}}
        if not any(has_permission(user, m, action) for m in modules):
            raise HTTPException(status_code=403, detail=f"Permission required: {', '.join(modules)}")
        return {**user, **{k: v for k, v in access.items() if k != "staff_row"}}
    return _check
