"""
mobile/__init__.py — Mobile app routers module

Mounts: /api/mobile, /api/admin/mobile
"""

def mount_mobile(app):
    from .. import mobile_admin, mobile_release

    app.include_router(mobile_release.router, prefix="/api/mobile")
    app.include_router(mobile_admin.router, prefix="/api/admin/mobile")