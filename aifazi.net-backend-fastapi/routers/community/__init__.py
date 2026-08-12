"""
community/__init__.py — Community routers module

Mounts: /api/forum, /api/chat, /api/helpdesk, /api/newsletter, /api/notifications
"""

def mount_community(app):
    from .. import forum
    from .. import chat
    from .. import chat_ai
    from .. import chat_livekit
    from .. import chat_dm
    from .. import chat_admin
    from .. import chat_url_preview
    from .. import helpdesk
    from .. import newsletter
    from .. import notifications

    app.include_router(notifications.router, prefix="/api/forum/notifications")
    app.include_router(forum.router, prefix="/api/forum")
    app.include_router(chat_ai.router, prefix="/api/chat/ai")
    app.include_router(chat_livekit.router, prefix="/api/chat")
    app.include_router(chat.router, prefix="/api/chat")
    app.include_router(chat_dm.router, prefix="/api/chat")
    app.include_router(chat_admin.router, prefix="/api/chat")
    app.include_router(chat_url_preview.router, prefix="/api/chat")
    app.include_router(helpdesk.router, prefix="/api/helpdesk")
    app.include_router(newsletter.router, prefix="/api/newsletter")