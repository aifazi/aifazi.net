"""
admin/__init__.py — Admin routers module

Mounts: /api/admin/*, /api/admin/mail/*, /api/admin/db, /api/admin/stats, /api/admin/audit, /api/admin/backup
"""

def mount_admin(app):
    from .. import admin_actions
    from .. import audit
    from .. import backup
    from .. import banners
    from .. import email_settings
    from .. import mail_queue
    from .. import mail_templates
    from .. import site_settings
    from .. import cdn_settings
    from .. import stats
    from .. import db_console
    from .. import mobile_admin

    app.include_router(admin_actions.router, prefix="/api/admin")
    app.include_router(audit.router, prefix="/api/admin/audit")
    app.include_router(backup.router, prefix="/api/admin/backup")
    app.include_router(banners.router, prefix="/api/admin/banners")
    app.include_router(email_settings.router, prefix="/api/admin/email")
    app.include_router(mail_queue.router, prefix="/api/admin/mail/queue")
    app.include_router(mail_templates.router, prefix="/api/admin/mail/templates")
    app.include_router(site_settings.router, prefix="/api/admin/site-settings")
    app.include_router(cdn_settings.router, prefix="/api/admin/cdn")
    app.include_router(stats.router, prefix="/api/admin/stats")
    app.include_router(db_console.router, prefix="/api/admin/db")
    app.include_router(mobile_admin.router, prefix="/api/admin/mobile")