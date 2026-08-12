"""
dev/__init__.py — Developer/Admin tools routers module

Mounts: /api/pdf-editor, /api/file-tools, /api/network, /api/upload, /api/cron, /api/monitor, /api/admin/db
"""

def mount_dev(app):
    from .. import pdf_editor
    from .. import file_tools
    from .. import network
    from .. import upload
    from .. import cron
    from .. import monitor
    from .. import webhooks
    from .. import db_console

    app.include_router(pdf_editor.router, prefix="/api/pdf-editor")
    app.include_router(file_tools.router, prefix="/api/file-tools")
    app.include_router(network.router, prefix="/api/network")
    app.include_router(upload.router, prefix="/api/upload")
    app.include_router(cron.router, prefix="")
    app.include_router(monitor.router, prefix="")
    app.include_router(webhooks.router, prefix="/api/webhook")
    app.include_router(db_console.router, prefix="/api/admin/db")