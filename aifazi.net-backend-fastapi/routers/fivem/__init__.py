"""
fivem/__init__.py — FiveM routers module

Mounts: /api/fivem, /api/txadmin
"""

def mount_fivem(app):
    from .. import fivem
    from .. import txadmin_webhook

    app.include_router(fivem.router, prefix="/api/fivem")
    app.include_router(fivem.bridge_router, prefix="/api/fivem/store")
    app.include_router(txadmin_webhook.router, prefix="/api/txadmin")