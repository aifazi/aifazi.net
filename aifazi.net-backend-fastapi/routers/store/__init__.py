"""
store/__init__.py — Store/E-commerce routers module

Mounts: /api/store, /api/store/admin, /api/store/delivery, /api/documents, /api/fivem/store
"""

def mount_store(app):
    from .. import store
    from .. import store_ecommerce
    from .. import store_admin
    from .. import store_catalog_admin
    from .. import store_crm_admin
    from .. import store_marketing_admin
    from .. import store_inventory_admin
    from .. import store_terminal_admin
    from .. import store_inventory
    from .. import store_ledger
    from .. import store_delivery
    from .. import documents

    app.include_router(store.router, prefix="/api/store")
    app.include_router(store_ecommerce.router, prefix="/api/store")
    app.include_router(store_admin.router, prefix="/api/store/admin")
    app.include_router(store_catalog_admin.router, prefix="/api/store/admin")
    app.include_router(store_crm_admin.router, prefix="/api/store/admin")
    app.include_router(store_marketing_admin.router, prefix="/api/store/admin")
    app.include_router(store_inventory_admin.router, prefix="/api/store/admin")
    app.include_router(store_terminal_admin.router, prefix="/api/store/admin")
    app.include_router(store_delivery.router, prefix="/api/store/delivery")
    app.include_router(documents.router, prefix="/api/documents")