"""
auth/__init__.py — Authentication routers module

Mounts: /api/auth, /api/discord, /api/forum/auth/github, /api/forum/auth/steam
"""

def mount_auth(app):
    from . import router as auth_router
    from .discord_auth import router as discord_router
    from .github_auth import router as github_router
    from .steam_auth import router as steam_router

    app.include_router(auth_router, prefix="/api/auth")
    app.include_router(discord_router, prefix="/api/discord")
    app.include_router(github_router, prefix="/api/forum/auth/github")
    app.include_router(steam_router, prefix="/api/forum/auth/steam")