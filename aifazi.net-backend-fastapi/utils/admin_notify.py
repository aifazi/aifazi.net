"""
utils/admin_notify.py — push a row into admin_notifications so staff get a
live bell notification (the admin header listens via Supabase Realtime).
"""
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def notify_admin(icon: str, title: str, msg: str) -> None:
    try:
        from database import supabase
        supabase.table("admin_notifications").insert({
            "icon": icon,
            "title": title,
            "msg": msg,
            "created_at": _now(),
        }).execute()
    except Exception:
        pass
