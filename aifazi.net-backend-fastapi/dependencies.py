"""
dependencies.py — PASETO v4 auth middleware

Migrated from JWT (HS256) to PASETO v4 local (XChaCha20-Poly1305):
- Authenticated encryption (confidentiality + integrity)
- No algorithm confusion attacks
- No "none" algorithm bypass
- Random nonces prevent replay attacks
"""
import asyncio
import logging
import os
import time

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from paseto_token import decode_token as _paseto_decode
from permissions import has_permission, resolve_staff_access

log = logging.getLogger("dependencies")

SECRET = os.environ.get("PASETO_SECRET", "")
if not SECRET:
    if os.getenv("ENV") == "production":
        raise RuntimeError("PASETO_SECRET is required in production. Set it in Railway environment variables.")
    log.critical(
        "PASETO_SECRET is not set. All authenticated endpoints will return 503. "
        "Set PASETO_SECRET in your Railway environment variables and redeploy."
    )

class CookieHTTPBearer(HTTPBearer):
    """Bearer dependency that also accepts the HttpOnly `auth_token` cookie.

    H4 — bearer-JWTs used to be stored in localStorage (XSS-exfiltratable). The
    backend now sets auth_token/refresh_token as HttpOnly cookies on login; this
    dependency falls back to the cookie when no Authorization header is sent so
    the frontend can stop persisting tokens in JS-visible storage entirely.
    Cross-site CSRF is mitigated because the cookie is SameSite=lax.
    """
    async def __call__(self, request: Request):
        creds = await super().__call__(request)
        if creds:
            return creds
        cookie = request.cookies.get("auth_token")
        if cookie:
            return HTTPAuthorizationCredentials(scheme="Bearer", credentials=cookie)
        return None


bearer = CookieHTTPBearer(auto_error=False)

_user_cache = {}
_USER_CACHE_TTL = 60

def _enrich_user(payload: dict) -> dict:
    user_id = payload.get("id") or payload.get("sub")
    username = payload.get("username")
    if not user_id:
        if username:
            try:
                from database import supabase as sb
                fu = sb.table("users").select("id,role,username,email,banned,ban_reason").eq("username", username).limit(1).execute().data
                if fu:
                    payload["id"] = fu[0]["id"]
                    user_id = fu[0]["id"]
            except Exception:
                pass
        if not user_id:
            return payload
    now = time.time()
    cached = _user_cache.get(user_id)
    if cached and (now - cached[0]) < _USER_CACHE_TTL:
        payload.update(cached[1])
        return payload
    enrichment = {}
    try:
        from database import supabase as sb
        res = sb.table("users").select("role,username,email,staff_permissions,banned,ban_reason").eq("id", user_id).limit(1).execute()
        if res.data:
            fu = res.data[0]
            enrichment["role"] = fu.get("role", "member")
            enrichment["username"] = fu.get("username", payload.get("username", ""))
            enrichment["email"] = fu.get("email", payload.get("email", ""))
            enrichment["banned"] = bool(fu.get("banned"))
            enrichment["ban_reason"] = fu.get("ban_reason") or ""
            if fu.get("staff_permissions"):
                enrichment["permissions"] = fu["staff_permissions"]
    except Exception:
        pass
    if enrichment:
        _user_cache[user_id] = (now, enrichment)
        payload.update(enrichment)
    return payload

def decode_token(token: str) -> dict:
    data = _paseto_decode(token, purpose="auth")
    if data is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if data.get("purpose") == "admin_gate" or data.get("tfa_pending"):
        raise HTTPException(status_code=401, detail="Invalid auth token")
    # H4 — refresh tokens are only valid for /refresh, never as access tokens.
    if data.get("token_type") == "refresh":
        raise HTTPException(status_code=401, detail="Invalid auth token")
    return data

def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_token(creds.credentials)
    return _enrich_user(payload)


async def get_current_user_async(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """Async variant: offloads the per-request DB enrichment off the event loop.

    FastAPI resolves a plain (non-async) dependency in the threadpool already,
    so existing routes keep working unchanged; routes that declare
    `user: dict = Depends(get_current_user_async)` get the extra benefit of not
    blocking the event loop during the Supabase round-trip.
    """
    if not creds:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_token(creds.credentials)
    return await asyncio.to_thread(_enrich_user, payload)

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user

def _request_permission(path: str, method: str) -> tuple[str, str] | None:
    """Map admin API paths to module permissions for staff tokens."""
    p = path.replace("/api", "", 1) if path.startswith("/api") else path
    if p.startswith("/admin/"):
        p = p.replace("/admin", "", 1)
    action = {"GET": "view", "POST": "create", "PUT": "edit", "PATCH": "edit", "DELETE": "delete"}.get(method.upper(), "view")
    rules = [
        ("/collection", "system.db"),
        ("/forms/admin/definitions", "fivem.forms"),
        ("/forms/admin/submissions", "fivem.forms"),
        ("/stats/actions", "system.db"),
        ("/stats", "home"),
        ("/db", "system.db"),
        ("/actions/db", "system.db"),
        ("/actions/chat", "community.chat"),
        ("/actions/posts", "content.posts"),
        ("/actions/newsletter", "community.newsletter"),
        ("/actions/cache", "system.settings"),
        ("/actions/stats", "system.db"),
        ("/collection", "system.db"),
        ("/ip-bans", "system.settings"),
        ("/sessions", "system.audit"),
        ("/fivem/whitelist", "fivem.whitelist"),
        ("/fivem/priority", "fivem.whitelist"),
        ("/fivem/bans", "fivem.bans"),
        ("/fivem/status", "fivem.status"),
        ("/blog", "content.posts"),
        ("/content", "content.pages"),
        ("/contact", "community.contacts"),
        ("/forum", "community.forum"),
        ("/chat", "community.chat"),
        ("/newsletter", "community.newsletter"),
        ("/mail", "system.mail"),
        ("/email", "system.mail"),
        ("/cdn", "system.cdn"),
        ("/backup", "system.backup"),
        ("/audit", "system.audit"),
        ("/banners", "system.announcements"),
        ("/settings", "system.settings"),
        ("/site-settings", "system.settings"),
        ("/mobile", "system.settings"),
        ("/monitor", "system.monitor"),
        ("/store/admin", "store"),
        ("/store", "store"),
        ("/helpdesk", "support.helpdesk"),
        ("/seo", "dev.seo"),
        ("/network", "dev.network"),
        ("/file", "dev.files"),
        ("/upload", "content.media"),
    ]
    for prefix, module in rules:
        if p.startswith(prefix):
            if module in {"fivem.forms", "fivem.whitelist"} and method.upper() in {"POST", "PATCH"}:
                action = "approve" if "submissions" in p or "whitelist" in p else action
            return module, action
    return None

def require_staff(request: Request, user: dict = Depends(get_current_user)) -> dict:
    """Allows admin/staff roles and linked forum users with a staff grant."""
    access = resolve_staff_access(user)
    if not access:
        raise HTTPException(status_code=403, detail="Staff only")
    merged = {**user, **{k: v for k, v in access.items() if k != "staff_row"}}
    needed = _request_permission(str(request.url.path), request.method)
    if needed and merged.get("role") != "admin":
        module, action = needed
        if not has_permission(merged, module, action):
            raise HTTPException(status_code=403, detail=f"Missing permission: {module}.{action}")
    elif needed is None:
        # Fail closed for admin/monitor surfaces that have no explicit rule.
        path = str(request.url.path)
        if path.startswith("/api/admin/") or path.startswith("/api/monitor") or path.startswith("/api/store/admin"):
            raise HTTPException(status_code=403, detail="Missing permission for this admin route")
    return merged

def require_roles(*roles: str):
    """Factory: require_roles('admin', 'moderator')"""
    def _check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail=f"Role required: {roles}")
        return user
    return _check
