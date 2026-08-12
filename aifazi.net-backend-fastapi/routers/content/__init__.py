"""
content/__init__.py — Content routers module

Mounts: /api/blog, /api/content, /api/portfolio, /api/search, /api/seo-proxy, /api/sitemap, /api/forms
"""

def mount_content(app):
    from .. import blog
    from .. import content
    from .. import content_aggregator
    from .. import portfolio
    from .. import search
    from .. import seo_proxy
    from .. import sitemap
    from .. import forms

    app.include_router(blog.router, prefix="/api/blog")
    app.include_router(content_aggregator.router, prefix="/api/content")
    app.include_router(content.router, prefix="/api/content")
    app.include_router(portfolio.router, prefix="/api/portfolio")
    app.include_router(search.router, prefix="/api/search")
    app.include_router(seo_proxy.router, prefix="/api/seo-proxy")
    app.include_router(sitemap.router, prefix="")
    app.include_router(forms.router, prefix="/api/forms")