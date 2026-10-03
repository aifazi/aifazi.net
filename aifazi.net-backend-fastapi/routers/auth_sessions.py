"""auth_sessions.py — Session management (list, heartbeat, revoke) +
WireGuard auto-login + H4 session-migrate (moved from routers/auth.py
during the god-file split).

Website sessions live in admin_sessions, keyed by username; current session
is matched by IP + user-agent.
"""
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials

from database import supabase
from dependencies import get_current_user
from routers.auth_shared import _get_forum_user, bearer
from utils.audit import record as _audit
from utils.auth_tokens import (
    _set_auth_cookies,
    make_forum_token,
    make_refresh_token,
    make_token,
)

router = APIRouter()
log = logging.getLogger("auth.sessions")


# P1-6 — explicit safe columns only (never select(*): the table may gain
# token/secret columns later that must not leak to the client).
_SESSION_COLUMNS = "id,username,user_id,role,ip,user_agent,last_active"


@router.get("/sessions")
async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
    """Return all active sessions for the current user."""
    username = user.get("username")
    try:
        rows = supabase.table("admin_sessions") \
            .select(_SESSION_COLUMNS) \
            .eq("username", username) \
            .order("last_active", desc=True) \
            .execute()
        sessions = rows.data or []
        client_ip = request.client.host if request.client else ""
        ua = request.headers.get("user-agent", "")
        for s in sessions:
            s["current"] = (s.get("ip") == client_ip and s.get("user_agent") == ua)
        return {"sessions": sessions, "total": len(sessions)}
    except Exception as exc:
        log.error("list_sessions failed: %s", exc)
        return {"sessions": [], "total": 0, "error": "Could not load sessions"}


@router.post("/sessions/heartbeat")
async def session_heartbeat(request: Request, user: dict = Depends(get_current_user)):
    """Keep session alive, report concurrent sessions, prune stale ones."""
    username = user.get("username")
    client_ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    now = datetime.now(timezone.utc).isoformat()
    try:
        existing = supabase.table("admin_sessions") \
            .select("id") \
            .eq("username", username) \
            .eq("ip", client_ip) \
            .eq("user_agent", ua) \
            .execute()
        if existing.data:
            supabase.table("admin_sessions") \
                .update({"last_active": now}) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
        else:
            supabase.table("admin_sessions").insert({
                "user_id":    user.get("id") or "admin",
                "username":   username,
                "role":       user.get("role", ""),
                "ip":         client_ip,
                "user_agent": ua,
                "last_active": now,
            }).execute()
        all_sessions = supabase.table("admin_sessions") \
            .select("id,ip,user_agent,last_active") \
            .eq("username", username) \
            .execute()
        others = [s for s in (all_sessions.data or [])
                  if not (s.get("ip") == client_ip and s.get("user_agent") == ua)]
        stale_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        for s in others:
            if s.get("last_active", "") < stale_cutoff:
                supabase.table("admin_sessions").delete().eq("id", s["id"]).execute()
        active_others = [s for s in others if s.get("last_active", "") >= stale_cutoff]
        return {
            "ok": True,
            "concurrent_sessions": len(active_others),
            "conflict": len(active_others) > 0,
            "others": [{"ip": s["ip"], "last_active": s["last_active"]} for s in active_others],
        }
    except Exception as exc:
        log.error("session_heartbeat failed: %s", exc)
        return {"ok": False, "error": "Could not update session"}


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, user: dict = Depends(get_current_user)):
    """Revoke a specific session by ID (owner only)."""
    username = user.get("username")
    row = supabase.table("admin_sessions").select("username").eq("id", session_id).execute()
    if not row.data or row.data[0].get("username") != username:
        raise HTTPException(404, "Session not found")
    supabase.table("admin_sessions").delete().eq("id", session_id).execute()
    _audit(str(username or ""), "session_revoked", target=session_id)
    return {"revoked": True}


@router.delete("/sessions")
async def revoke_all_other_sessions(request: Request, user: dict = Depends(get_current_user)):
    """Revoke all sessions except the current one."""
    username = user.get("username")
    client_ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    all_rows = supabase.table("admin_sessions") \
        .select("id,ip,user_agent") \
        .eq("username", username) \
        .execute()
    to_delete = [s["id"] for s in (all_rows.data or [])
                 if not (s.get("ip") == client_ip and s.get("user_agent") == ua)]
    if to_delete:
        supabase.table("admin_sessions").delete().in_("id", to_delete).execute()
    _audit(str(username or ""), "sessions_revoke_all", details={"count": len(to_delete)})
    return {"revoked": len(to_delete)}


# ── WireGuard auto-login ─────────────────────────────────────────────────────
# When connected via WireGuard, the client IP is in the 10.8.0.0/24 subnet.
# This endpoint auto-authenticates the user based on their WG IP, treating
# the WireGuard private key as proof of identity.
_WG_SUBNET = "10.8.0."
_WG_IP_MAP = {
    "10.8.0.3": "tanvir",
}


@router.get("/wg-login")
async def wg_login(request: Request, response: Response):
    """Auto-login for WireGuard peers. Returns tokens + user info.
    Only works from the 10.8.0.0/24 subnet. IP-to-user mapping is configured
    in _WG_IP_MAP above.
    """
    if os.getenv("WG_LOGIN_ENABLED", "").lower() not in ("1", "true", "yes"):
        raise HTTPException(404, "Not found")
    client_ip = request.client.host if request.client else ""
    if not client_ip.startswith(_WG_SUBNET):
        raise HTTPException(403, "WireGuard login only available from VPN subnet")

    username = _WG_IP_MAP.get(client_ip)
    if not username:
        _audit("unknown", "wg_login_failed", ip=client_ip,
               details={"reason": "no mapping for IP"})
        raise HTTPException(403, f"No WireGuard user mapped to {client_ip}")

    # Look up the user in the database
    res = supabase.table("users").select("*").eq("username", username).limit(1).execute()
    user = res.data[0] if res.data else None
    if not user:
        raise HTTPException(404, f"User '{username}' not found")
    if user.get("banned"):
        raise HTTPException(403, "Account suspended")

    user_id = user["id"]
    user_role = user.get("role", "user")
    user_agent = request.headers.get("user-agent", "")

    token = make_token({"username": username, "role": user_role, "id": user_id})
    refresh = make_refresh_token({"username": username, "role": user_role, "id": user_id})

    supabase.table("users").update({
        "refresh_token": refresh,
        "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()

    _audit(username, "wg_login", ip=client_ip, details={"method": "wireguard"})
    _set_auth_cookies(response, token, refresh)
    return {
        "token": token,
        "refreshToken": refresh,
        "user": {"username": username, "role": user_role},
        "method": "wireguard",
    }


@router.post("/session-migrate")
async def session_migrate(request: Request, response: Response, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """H4 — mint HttpOnly auth cookies for a valid Bearer-only session.

    Pre-migration sessions kept their JWT in localStorage and never had the
    auth_token/refresh_token cookies set. The frontend calls this once after a
    successful legacy-Bearer /auth/me so it can drop the localStorage token:
    the refresh_token cookie then keeps the session alive across reloads.
    """
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id") or payload.get("sub")
    if not user_id:
        raise HTTPException(400, "Token has no user id — re-login to migrate")
    token = make_forum_token(user_id, payload.get("username") or "", payload.get("role") or "user")
    refresh = make_refresh_token({"id": user_id, "username": payload.get("username") or "", "role": payload.get("role") or "user"}, 60 * 24 * 7)
    try:
        supabase.table("users").update({
            "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
        }).eq("id", user_id).execute()
    except Exception:
        pass
    _set_auth_cookies(response, token, refresh)
    return {"ok": True}
