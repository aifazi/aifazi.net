"""
websocket/chat_ws.py — STUB

Socket.IO has been removed from this backend.
Real-time chat and site events are now handled by Supabase Realtime on the frontend.

broadcast_site_event() is kept as a no-op so the three routers that import it
(site_settings, content, banners) continue to work without modification.

If Socket.IO is re-enabled in future, restore this file from git history:
  git show HEAD~5:websocket/chat_ws.py
"""

async def broadcast_site_event(event: str, data: dict = {}) -> None:
    """No-op stub — Socket.IO removed. Frontend uses Supabase Realtime instead."""
    pass
