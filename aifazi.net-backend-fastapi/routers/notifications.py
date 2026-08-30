"""routers/notifications.py — In-app notifications API"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user

router = APIRouter()


class MarkReadBody(BaseModel):
    ids: list[str]


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    q = supabase.table("notifications").select("*", count="exact").eq("user_id", user["id"])
    if unread_only:
        q = q.eq("read", False)
    res = q.order("created_at", desc=True).range((page - 1) * page_size, page * page_size - 1).execute()
    return {"items": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    res = supabase.table("notifications").select("id", count="exact").eq("user_id", user["id"]).eq("read", False).execute()
    return {"count": res.count or 0}


@router.post("/mark-read")
async def mark_read(body: MarkReadBody, user: dict = Depends(get_current_user)):
    if not body.ids:
        return {"marked": 0}
    supabase.table("notifications").update({"read": True}).in_("id", body.ids).eq("user_id", user["id"]).execute()
    return {"marked": len(body.ids)}


@router.post("/mark-all-read")
async def mark_all_read(user: dict = Depends(get_current_user)):
    supabase.table("notifications").update({"read": True}).eq("user_id", user["id"]).eq("read", False).execute()
    return {"message": "All marked as read"}


@router.delete("/{notif_id}")
async def delete_notif(notif_id: str, user: dict = Depends(get_current_user)):
    supabase.table("notifications").delete().eq("id", notif_id).eq("user_id", user["id"]).execute()
    return {"message": "Deleted"}


def create_notification(user_id: str, notif_type: str, message: str, link: str = ""):
    """Helper used by forum.py and other routers to create notifications."""
    supabase.table("notifications").insert({
        "user_id": user_id, "type": notif_type, "message": message, "link": link
    }).execute()
