"""auth_sessions.py — Session management (list, heartbeat, delete).

Extracted from auth.py. Handles session lifecycle for user accounts.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from database import supabase
from dependencies import get_current_user

router = APIRouter()
log = logging.getLogger("auth.sessions")


@router.get("/sessions")
async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
    """List active sessions for the current user."""
    username = user.get("username") or ""
    # Get user_id from username
    u = supabase.table("users").select("id").eq("username", username).limit(1).execute()
    if not u.data:
        return []
    user_id = u.data[0]["id"]
    res = (
        supabase.table("user_sessions")
        .select("id,user_agent,last_active_at,created_at")
        .eq("user_id", user_id)
        .order("last_active_at", desc=True)
        .limit(50)
        .execute()
    )
    sessions = res.data or []
    # Mark current session
    current_ua = request.headers.get("user-agent", "")
    for s in sessions:
        s["is_current"] = s.get("user_agent") == current_ua
    return sessions


@router.post("/sessions/heartbeat")
async def session_heartbeat(request: Request, user: dict = Depends(get_current_user)):
    """Update last_active_at for the current session."""
    username = user.get("username") or ""
    u = supabase.table("users").select("id").eq("username", username).limit(1).execute()
    if not u.data:
        return {"ok": False}
    user_id = u.data[0]["id"]
    ua = request.headers.get("user-agent", "")
    if not ua:
        return {"ok": False}
    # Upsert session
    existing = supabase.table("user_sessions").select("id").eq("user_id", user_id).eq("user_agent", ua).limit(1).execute()
    now = datetime.now(timezone.utc).isoformat()
    if existing.data:
        supabase.table("user_sessions").update({"last_active_at": now}).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("user_sessions").insert({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_agent": ua,
            "last_active_at": now,
            "created_at": now,
        }).execute()
    return {"ok": True}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a specific session."""
    username = user.get("username") or ""
    u = supabase.table("users").select("id").eq("username", username).limit(1).execute()
    if not u.data:
        raise HTTPException(404, "User not found")
    user_id = u.data[0]["id"]
    supabase.table("user_sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()
    return {"ok": True}


@router.delete("/sessions")
async def delete_all_sessions(user: dict = Depends(get_current_user)):
    """Delete all sessions except the current one."""
    username = user.get("username") or ""
    u = supabase.table("users").select("id").eq("username", username).limit(1).execute()
    if not u.data:
        return {"ok": True}
    user_id = u.data[0]["id"]
    supabase.table("user_sessions").delete().eq("user_id", user_id).execute()
    return {"ok": True}
