"""
routers/__init__.py — Main router registry

Mounts all feature modules in a structured way.
"""

def mount_all(app):
    from .auth import mount_auth
    from .admin import mount_admin
    from .content import mount_content
    from .community import mount_community
    from .fivem import mount_fivem
    from .store import mount_store
    from .dev import mount_dev
    from .mobile import mount_mobile

    mount_auth(app)
    mount_admin(app)
    mount_content(app)
    mount_community(app)
    mount_fivem(app)
    mount_store(app)
    mount_dev(app)
    mount_mobile(app)

# Back-compat: direct router imports still work
from . import auth
from . import admin_actions
from . import audit
from . import backup
from . import banners
from . import blog
from . import chat
from . import chat_ai
from . import chat_admin
from . import chat_dm
from . import chat_livekit
from . import chat_url_preview
from . import cdn_settings
from . import cron
from . import db_console
from . import discord_auth
from . import email_settings
from . import file_tools
from . import forms
from . import fivem
from . import github_auth
from . import helpdesk
from . import mail_queue
from . import mail_templates
from . import mobile_admin
from . import mobile_release
from . import monitor
from . import network
from . import notifications
from . import pdf_editor
from . import portfolio
from . import search
from . import seo_proxy
from . import sitemap
from . import site_settings
from . import stats
from . import steam_auth
from . import store
from . import store_admin
from . import store_catalog_admin
from . import store_crm_admin
from . import store_delivery
from . import store_ecommerce
from . import store_inventory
from . import store_inventory_admin
from . import store_ledger
from . import store_marketing_admin
from . import store_terminal_admin
from . import txadmin_webhook
from . import upload
from . import webhooks
from . import documents
from . import content
from . import content_aggregator
from . import contact