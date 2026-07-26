"""routers/notifications.py — Forum notifications"""
from fastapi import APIRouter, Depends, HTTPException
from database import supabase
from dependencies import get_current_user
import os
from jwt_compat import jwt, JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter()
bearer = HTTPBearer(auto_error=False)
SECRET = os.getenv("PASETO_SECRET", os.getenv("JWT_SECRET", "")); ALGO = "HS256"

def get_forum_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "Login required")
    try:
        return jwt.decode(creds.credentials, SECRET, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid token")

@router.get("")
async def get_notifications(user: dict = Depends(get_forum_user)):
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        return []  # Admin/staff tokens have no forum user id — return empty
    res = supabase.table("notifications").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
    return res.data or []

@router.patch("/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_forum_user)):
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        return {"message": "OK"}
    supabase.table("notifications").update({"read": True}).eq("id", notif_id).eq("user_id", user_id).execute()
    return {"message": "Marked read"}

@router.post("/read-all")
async def read_all(user: dict = Depends(get_forum_user)):
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        return {"message": "OK"}
    supabase.table("notifications").update({"read": True}).eq("user_id", user_id).execute()
    return {"message": "All read"}

@router.delete("/{notif_id}")
async def delete_notif(notif_id: str, user: dict = Depends(get_forum_user)):
    user_id = user.get("id") or user.get("sub")
    if not user_id:
        return {"message": "OK"}
    supabase.table("notifications").delete().eq("id", notif_id).eq("user_id", user_id).execute()
    return {"message": "Deleted"}

def create_notification(user_id: str, type: str, message: str, link: str = ""):
    """Helper used by forum.py to create notifications."""
    supabase.table("notifications").insert({
        "user_id": user_id, "type": type, "message": message, "link": link
    }).execute()
