"""
routers/push.py — Native push notification device tokens + Expo send.

  POST /api/push/register    — upsert an Expo push token for the authed user
  POST /api/push/unregister  — remove a device token (logout / app uninstall)

The mobile app acquires an Expo push token (expo-notifications) and registers it
here; then _send_push (below) fans out to Expo's push service when the backend
creates a notification for a user who has a registered device.
"""
import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user

router = APIRouter()
log = logging.getLogger("push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_PUSH_TIMEOUT = 10.0

class PushTokenBody(BaseModel):
    token: str

def _user_id(user: dict) -> str:
    uid = user.get("id") or user.get("sub")
    if not uid:
        raise HTTPException(401, "No user id in token")
    return str(uid)

@router.post("/register")
async def register_push(body: PushTokenBody, user: dict = Depends(get_current_user)):
    token = (body.token or "").strip()
    if not token or len(token) > 512:
        raise HTTPException(400, "Invalid push token")
    uid = _user_id(user)
    try:
        supabase.table("push_tokens").upsert(
            {"user_id": uid, "token": token},
            on_conflict="user_id,token",
        ).execute()
    except Exception as exc:
        log.warning("push register failed for %s: %s", uid, exc)
        raise HTTPException(502, "Failed to store push token")
    return {"ok": True}

@router.post("/unregister")
async def unregister_push(body: PushTokenBody, user: dict = Depends(get_current_user)):
    token = (body.token or "").strip()
    if not token:
        return {"ok": True}
    uid = _user_id(user)
    try:
        supabase.table("push_tokens").delete().eq("user_id", uid).eq("token", token).execute()
    except Exception as exc:
        log.warning("push unregister failed for %s: %s", uid, exc)
    return {"ok": True}


def _send_push_sync(user_ids: list[str], title: str, body: str, data: dict | None = None):
    """Best-effort Expo push fan-out. Runs in a worker thread (callers use
    asyncio.to_thread); never raises — push must never break the request path.
    Batches token lookups into one query and posts to Expo in chunks of 100
    (Expo's per-request limit)."""
    if not user_ids:
        return
    try:
        res = supabase.table("push_tokens").select("token").in_("user_id", list(user_ids)).execute()
        tokens = [r["token"] for r in (res.data or []) if r.get("token")]
        if not tokens:
            return
        payload = {
            "title": title[:200],
            "body": body[:500],
            "sound": "default",
            "priority": "high",
            "data": data or {},
        }
        with httpx.Client(timeout=_PUSH_TIMEOUT) as client:
            for i in range(0, len(tokens), 100):
                chunk = tokens[i : i + 100]
                client.post(EXPO_PUSH_URL, json={**payload, "to": chunk})
    except Exception as exc:
        log.warning("expo push send failed: %s", exc)


async def send_push(user_ids: list[str], title: str, body: str, data: dict | None = None):
    """Async wrapper — run the (blocking) Expo send off the event loop."""
    if user_ids:
        await asyncio.to_thread(_send_push_sync, user_ids, title, body, data)