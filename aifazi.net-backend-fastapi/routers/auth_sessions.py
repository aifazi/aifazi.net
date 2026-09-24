"""auth_sessions.py — Session management (list, heartbeat, revoke).

Mirrors routers/auth.py (monolith): website sessions live in admin_sessions,
keyed by username; current session is matched by IP + user-agent.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from database import supabase
from dependencies import get_current_user
from utils.audit import record as _audit

router = APIRouter()
log = logging.getLogger("auth.sessions")


@router.get("/sessions")
async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
    """Return all active sessions for the current user."""
    username = user.get("username")
    token_str = (request.headers.get("Authorization") or "").replace("Bearer ", "")
    try:
        rows = supabase.table("admin_sessions") \
            .select("*") \
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
        return {"sessions": [], "total": 0, "error": str(exc)}


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
        return {"ok": False, "error": str(exc)}


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
