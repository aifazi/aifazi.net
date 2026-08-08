"""
main.py — FastAPI application entry point
FIX #10: Passes running event loop to scheduler so run_coroutine_threadsafe() works.
"""
import asyncio
import os
import time
import hmac
import ipaddress
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
import sentry_sdk
from dotenv import load_dotenv

load_dotenv()

dsn = os.getenv("SENTRY_DSN", "")
if dsn.startswith("https://"):
    sentry_sdk.init(dsn=dsn, traces_sample_rate=0.1,
                    environment=os.getenv("ENV", "production"))

from utils.scheduler import scheduler, set_event_loop
from utils.request_ip import client_ip

log = logging.getLogger("main")

_IS_SERVERLESS = os.getenv("VERCEL", "") != ""
_IS_PRODUCTION  = os.getenv("ENV", "production") == "production"

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not _IS_SERVERLESS:
        set_event_loop(asyncio.get_running_loop())
        scheduler.start()
    # Run audit table migration in the background so it never blocks startup
    # or delays the health check response on Render's starter plan.
    async def _bg_migrate():
        try:
            from utils.audit import migrate as _audit_migrate
            import logging as _logging
            result = _audit_migrate()
            _logging.getLogger("main").info("audit migrate: %s", result.get("message", result))
        except Exception as _exc:
            import logging as _logging
            _logging.getLogger("main").warning("audit auto-migrate failed: %s", _exc)
    asyncio.create_task(_bg_migrate())
    yield
    if not _IS_SERVERLESS:
        scheduler.shutdown()

app = FastAPI(title="aifazi.net API", version="2.0.0", lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)

import re
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net")

_CORS_ALLOW_HEADERS = "Authorization, Content-Type, X-Internal-Token, X-CSRF-Token, Accept, Origin"

# ── Block direct browser visits to api.aifazi.net ──────────────────────────────
# If someone navigates to api.aifazi.net in a browser (Accept: text/html, no
# Origin header), they are redirected to the homepage.
# Real API calls always set an Origin header or do not prefer text/html.
API_HOSTNAME = os.getenv("API_HOSTNAME", "api.aifazi.net")

# ── Internal API secret ────────────────────────────────────────────────────────
# All non-public requests must include this header (injected by Next.js middleware).
# Set INTERNAL_API_SECRET in your .env — use any long random string.
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "")
if not INTERNAL_API_SECRET:
    if _IS_PRODUCTION:
        raise RuntimeError(
            "INTERNAL_API_SECRET is not set. Refusing to start in production: "
            "the middleware gate would fail open. Set it in Vercel Environment "
            "Variables (Settings → Environment Variables) and redeploy."
        )
    log.warning(
        "INTERNAL_API_SECRET is not set. Protected API endpoints will return 503 "
        "until the secret is configured."
    )

# Paths that are freely accessible without the internal token
_OPEN_EXACT: set[str] = {
    "/api/health",
    "/api/stats/visitors/live",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/2fa/verify",
    "/api/auth/refresh",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/forgot",
    "/api/auth/find-username",
    "/api/auth/reset",
    "/api/auth/resend-verification",
    "/api/auth/verify-email",
    "/api/auth/check-username",
    "/api/auth/check-email",
    "/api/auth/logout",
    "/api/auth/discord/login",
    "/api/auth/discord/callback",
    "/api/auth/discord/connect-url",
    "/api/auth/discord/whitelist-status",
    "/api/auth/steam/login",
    "/api/auth/steam/callback",
    "/api/auth/steam/connect-url",
    "/sitemap.xml",
    "/robots.txt",
    "/api/fivem/status",
    "/api/fivem/status/overview",   # public visitor-safe overview (status + sanitized players + history)
    "/api/fivem/whitelist/apply",
    "/api/txadmin/whitelist-approved",
    "/api/txadmin/whitelist-denied",
    "/api/txadmin/whitelist-request",
    "/api/txadmin/playerConnecting",
    "/api/txadmin/health",
    "/api/webhook/fivem/whitelist-approved",  # FiveM server → Supabase whitelist_applications
    # -- FiveM Lua bridge endpoints (auth via X-FiveM-Token, not X-Internal-Token) --
    "/api/fivem/players",                    # player list POST from Lua resource
    "/api/fivem/whitelist/pending-sync",     # Lua polls for approved entries to push to txAdmin
    "/api/fivem/whitelist/mark-synced",      # Lua marks entries synced after txAdmin push
    "/api/fivem/application-actions/pending",  # Lua polls approved website/game actions
    "/api/fivem/application-actions/mark-synced", # Lua reports action sync result
    "/api/fivem/txadmin-event",              # Lua forwards txAdmin whitelist events
    "/api/fivem/whitelist/update-identifiers",  # Lua patches license hex on connect
    "/api/fivem/txadmin/approvals",              # PS1 sync script polls for pending approvals
    "/api/fivem/txadmin/mark-synced",            # PS1 sync script marks entries done
    # -- Player data sync (auth via X-FiveM-Token) --
    "/api/fivem/players/join",              # Lua fires on playerJoining
    "/api/fivem/players/leave",             # Lua fires on playerDropped
    "/api/fivem/players/heartbeat-sync",    # Lua sends with every 30s heartbeat
    "/api/fivem/connect/session-check",     # Lua requires recent website connect session
    "/api/fivem/connect/verify",            # Legacy Lua token verifier
    # -- Discord OAuth public endpoints --
    "/api/discord/login",       # redirect to Discord consent screen
    "/api/discord/callback",    # OAuth callback — issues JWT
    "/api/discord/logout",      # clear session
    # Steam auth (still at legacy /api/forum/auth/steam) — POST/DELETE need internal token.
    # NOTE: POST /connect was removed (unverified steam_id linking) — only the
    # OpenID callback (mode=connect) links accounts now.
    "/api/forum/auth/steam/disconnect",
    # C6: mail delivery webhook (Brevo/Resend) — self-auth via MAIL_WEBHOOK_SECRET HMAC.
    # Without this entry, providers can't reach the endpoint past the X-Internal-Token gate.
    "/api/admin/mail/queue/webhook/inbound",
    # Phase 2: mail queue drain — the Hobby-tier daily /api/cron/cleanup tick
    # now calls dispatch_pending() itself (see cron.py). This endpoint remains
    # available for manual admin drains. Auth is dual (CRON_SECRET bearer OR
    # staff JWT) handled inside the route.
    "/api/admin/mail/queue/process-pending",
    # C1: Vercel cron cleanup (daily) — auth via Authorization: Bearer CRON_SECRET inside cron.py.
    # Without this entry the middleware 403s the cron before cron.py's hmac check runs.
    "/api/cron/cleanup",
    "/api/cron/monitor",
    "/api/monitor/status",
    "/api/monitor/ping",
    "/api/monitor/errors",
    # Store: Stripe webhook (signature verified inside route) + Lua subscription sync
    "/api/store/webhook",
    "/api/store/stripe/webhook",
    "/api/fivem/store/subscriptions/pending-sync",
    "/api/fivem/store/subscriptions/mark-synced",
}
# GET requests on these prefixes are open (public read)
_OPEN_GET_PREFIXES: tuple[str, ...] = (
    "/api/blog",
    "/api/portfolio",
    "/api/search",
    "/api/content",
    "/api/seo-proxy",
    "/api/admin/banners",
    "/api/admin/site-settings",
    # Forum reads (threads/replies/categories) are public content — opened for
    # the mobile app and direct clients. Staff-only forum GETs stay JWT-gated
    # inside the routes themselves.
    "/api/forum",
    "/api/pdf-editor/page",
    "/api/pdf-editor/thumb",
    "/api/pdf-editor/info",
    # FiveM whitelist check — called by Lua on playerConnecting with identifier in path
    "/api/fivem/whitelist/check",
    "/api/fivem/whitelist/update-identifiers",
    "/api/discord/me",
    "/api/discord/whitelist-status",
    "/api/discord/my-application",
    # Auth endpoints — JWT handles auth, middleware must not block GET
    "/api/auth/me",
    "/api/auth/sessions",
    "/api/auth/verify",
    "/api/auth/verify-status",
    "/api/auth/discord/",
    "/api/auth/steam/",
    "/api/forum/auth/",
    # Steam auth still registered at legacy path
    "/api/forum/auth/steam/",
    # Player records — staff-only GET endpoints, JWT auth handles access control
    "/api/fivem/players/records",
    "/api/fivem/players/sessions",
    # Store catalog — public reads (categories/plans); protected routes use JWT
    "/api/store",
)

# ── CORS allowed origins ───────────────────────────────────────────────────────
_STATIC_ORIGINS = {
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "https://aifazi.net",
    "https://www.aifazi.net",
    "https://admin.aifazi.net",
    "https://aifazi-website-new.vercel.app",
    FRONTEND_URL,
}

_DYNAMIC_PATTERNS: list[re.Pattern] = []

if not _IS_PRODUCTION:
    # Development only — allow Vercel/Railway preview deploys
    _DYNAMIC_PATTERNS = [
        re.compile(r"^https://[a-z0-9\-]+\.vercel\.app$"),
        re.compile(r"^https://[a-z0-9\-]+\.aifazi\.net$"),
        re.compile(r"^https://[a-z0-9\-]+\.railway\.app$"),
    ]
else:
    _DYNAMIC_PATTERNS = []

def _is_allowed_origin(origin: str) -> bool:
    if origin in _STATIC_ORIGINS:
        return True
    return any(p.match(origin) for p in _DYNAMIC_PATTERNS)

# ── Rate limit store (in-memory sliding window, per IP) ───────────────────────
# Uses a TTL-bounded dict to prevent unbounded memory growth under attack.
# Buckets older than _RL_CLEANUP_INTERVAL seconds are pruned in the background.
_rl_store: dict[str, list[float]] = defaultdict(list)
_rl_last_cleanup: float = 0.0
_RL_CLEANUP_INTERVAL = 300  # prune dead buckets every 5 minutes

# ── IP ban cache (in-memory, TTL-refreshed) ───────────────────────────────────
# ip_bans rows (single IP or CIDR) are loaded once per TTL window so the hot
# request path never blocks on a Supabase round-trip. Refreshes are best-effort:
# a failed refresh keeps serving the previous snapshot.
_ip_bans_cache: dict = {"networks": [], "fetched_at": 0.0}
_IP_BANS_TTL = 60.0

def _refresh_ip_bans(force: bool = False) -> None:
    now = time.monotonic()
    if not force and now - _ip_bans_cache["fetched_at"] < _IP_BANS_TTL:
        return
    try:
        from database import supabase as _sb
        res = _sb.table("ip_bans").select("ip").execute()
        nets = []
        for row in (res.data or []):
            ip = (row.get("ip") or "").strip()
            if not ip:
                continue
            try:
                nets.append(ipaddress.ip_network(ip, strict=False))
            except ValueError:
                try:
                    nets.append(ipaddress.ip_network(f"{ip}/32", strict=False))
                except ValueError:
                    continue
        _ip_bans_cache["networks"] = nets
        _ip_bans_cache["fetched_at"] = now
    except Exception:
        _ip_bans_cache["fetched_at"] = now  # don't retry hot-loop on DB outage

def _ip_is_banned(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    for net in _ip_bans_cache["networks"]:
        try:
            if addr in net:
                return True
        except TypeError:
            continue
    return False

def _prune_rl_store(now: float) -> None:
    """Remove expired buckets to prevent memory growth under high unique-IP traffic."""
    global _rl_last_cleanup
    if now - _rl_last_cleanup < _RL_CLEANUP_INTERVAL:
        return
    _rl_last_cleanup = now
    max_window = max(w for _, _, w in _RL_RULES) if _RL_RULES else _RL_DEFAULT[1]
    dead = [k for k, ts in _rl_store.items() if not ts or now - ts[-1] > max_window]
    for k in dead:
        del _rl_store[k]

# (max_calls, window_seconds) per path suffix
_RL_RULES: list[tuple[str, int, int]] = [
    ("/auth/login",           5,   60),
    ("/auth/register",       10,   60),
    ("/auth/2fa/verify",      3,   60),
    ("/auth/refresh",         20,   60),
    ("/auth/forgot-password", 3, 300),
    ("/auth/reset-password",  3, 300),
    ("/auth/forgot",          3, 300),
    ("/auth/reset",           3, 300),
    ("/auth/find-username",   3, 300),
    ("/auth/resend-verification", 3, 300),
    ("/auth/check-username", 20,  60),
    ("/auth/check-email",    20,  60),
    ("/auth/logout",         10,  60),
    ("/auth/discord",         5,   60),
    ("/auth/steam",           5,   60),
    ("/auth/change-password", 3, 300),
    ("/admin/db/sql",         5,   60),
    ("/admin/backup",        10,  300),
    ("/upload/multiple",      3,   60),
    ("/pdf-editor/open",      5,   60),
    ("/file-tools/",           5,   60),
    ("/seo-proxy",            10,   60),
    ("/helpdesk/tickets",     10,   60),
]
_RL_DEFAULT = (100, 60)   # 100 requests / 60 s general

# Paths with a dedicated (stricter) limit are brute-force sensitive — they get
# an ADDITIONAL shared-store (Supabase) check in dispatch() so the limit holds
# across all Vercel serverless instances, not just within one instance's memory.
_RL_SENSITIVE_SUFFIXES = {suffix for suffix, _, _ in _RL_RULES}

def _get_limit(path: str) -> tuple[int, int]:
    for suffix, calls, period in _RL_RULES:
        if path.endswith(suffix):
            return calls, period
    return _RL_DEFAULT


class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Single middleware that handles:
      0. Browser redirect — api.aifazi.net visited in a browser → 301 to homepage
      1. CORS
      2. Rate limiting (per IP, sliding window)
      3. Internal token gate (blocks direct API access bypassing Next.js)
      4. Security headers
    """
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")
        allowed_origin = _is_allowed_origin(origin)
        path   = request.url.path
        method = request.method

        # ── 0. Redirect browser visits to api.aifazi.net ──────────────────────
        # A browser navigating directly to api.aifazi.net sends Accept: text/html
        # and no Origin header. Redirect those bare-domain visitors to the main site.
        # Programmatic fetch/XHR calls always include an Origin header or a
        # specific Accept type (application/json), so they are never affected.
        # IMPORTANT: only redirect bare-domain visits (path is / or empty).
        # Real API paths like /api/admin/site-settings must NOT be blocked here —
        # the frontend proxy and open-endpoint list handle access control for those.
        host   = request.headers.get("host", "").split(":")[0]
        accept = request.headers.get("accept", "")
        is_browser = "text/html" in accept and not origin
        is_bare    = path in ("/", "")
        if host == API_HOSTNAME and is_browser and is_bare:
            return RedirectResponse(url=FRONTEND_URL, status_code=301)

        # ── 1. CORS preflight ──────────────────────────────────────────────────
        if method == "OPTIONS":
            resp = Response(status_code=204)
            if allowed_origin:
                resp.headers["Access-Control-Allow-Origin"]      = origin
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                resp.headers["Access-Control-Allow-Methods"]     = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
                resp.headers["Access-Control-Allow-Headers"]     = _CORS_ALLOW_HEADERS
                resp.headers["Access-Control-Max-Age"]           = "86400"
            return resp

        # ── 2. Rate limiting ───────────────────────────────────────────────────
        # Client IP must NOT come from user-supplied X-Forwarded-For /
        # x-vercel-forwarded-for: on the Railway origin a client can set those
        # itself and rotate IPs to bypass the limiter and ip_bans. Only
        # Cloudflare's CF-Connecting-IP (proved by CF-Ray) or the socket peer
        # is trusted — see utils/request_ip.py.
        ip = client_ip(request)
        now  = time.monotonic()
        _prune_rl_store(now)   # periodic cleanup — prevents memory growth

        # ── 2b. IP ban enforcement ─────────────────────────────────────────────
        _refresh_ip_bans()
        if _ip_is_banned(ip):
            return JSONResponse(
                status_code=403,
                content={"error": "Your IP address is blocked."},
            )
        max_calls, window = _get_limit(path)
        bucket = f"{ip}:{path}"
        ts = _rl_store.get(bucket, [])
        ts = [t for t in ts if now - t < window]
        if len(ts) >= max_calls:
            _rl_store[bucket] = ts
            return JSONResponse(
                status_code=429,
                content={"error": "Too many requests. Please slow down."},
                headers={"Retry-After": str(window)},
            )
        ts.append(now)
        _rl_store[bucket] = ts

        # ── 2c. Shared (DB) rate limit for brute-force-sensitive paths ──────
        # H5 — the in-memory window above is per-instance. On serverless, an
        # attacker can exceed the intended limit by spraying across instances,
        # so sensitive paths are ALSO enforced against a single Supabase bucket
        # via an atomic upsert. Fail-open on DB error (if the DB is down the
        # auth endpoints themselves are down, and login must never be a worse
        # DoS than it already is).
        if any(path.endswith(s) for s in _RL_SENSITIVE_SUFFIXES):
            try:
                from database import supabase as _sb
                res = _sb.rpc("rate_limit_check", {
                    "p_bucket": bucket,
                    "p_max":    max_calls,
                    "p_window": window,
                }).execute()
                allowed = bool(res.data)
            except Exception:
                allowed = True
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={"error": "Too many requests. Please slow down."},
                    headers={"Retry-After": str(window)},
                )


        # ── 3. Internal token gate ─────────────────────────────────────────────
        # Web frontend injects X-Internal-Token (see Next.js middleware). The
        # mobile app cannot embed that shared secret, so it authenticates with a
        # regular PASETO access token instead — route-level dependencies
        # (get_current_user / require_staff / require_permission) still enforce
        # per-endpoint authorization, so a valid bearer is equivalent here to
        # coming through the proxy with the internal secret.
        is_open = (
            path in _OPEN_EXACT or
            (method == "GET" and any(path.startswith(p) for p in _OPEN_GET_PREFIXES))
        )
        if not is_open:
            # Valid PASETO access token → authenticated first-party client (mobile app).
            auth_header = request.headers.get("authorization", "")
            valid_bearer = False
            if auth_header.lower().startswith("bearer "):
                try:
                    from dependencies import decode_token as _decode_access
                    _decode_access(auth_header[7:].strip())
                    valid_bearer = True
                except Exception:
                    valid_bearer = False
            if not valid_bearer:
                if not INTERNAL_API_SECRET:
                    return JSONResponse(
                        status_code=503,
                        content={"error": "Internal API gate is not configured."},
                    )
                if auth_header.startswith("Bearer "):
                    # A bearer was supplied but rejected → explicit 401 so the
                    # client can refresh/re-auth rather than a confusing 403.
                    return JSONResponse(
                        status_code=401,
                        content={"error": "Invalid or expired token"},
                    )
                submitted = request.headers.get("X-Internal-Token", "")
                if not hmac.compare_digest(submitted, INTERNAL_API_SECRET):
                    return JSONResponse(
                        status_code=403,
                        content={"error": "Direct API access is not permitted."},
                    )

        # ── 4. Call next + attach headers ─────────────────────────────────────
        response = await call_next(request)

        if allowed_origin:
            response.headers["Access-Control-Allow-Origin"]      = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"]     = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
            response.headers["Access-Control-Allow-Headers"]     = _CORS_ALLOW_HEADERS

        response.headers["X-Content-Type-Options"]  = "nosniff"
        response.headers["X-Frame-Options"]         = "DENY"
        # X-Robots-Tag so the API host is never indexed even without Vercel (Railway)
        if host == API_HOSTNAME:
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        # X-XSS-Protection is deprecated (Chrome removed the auditor in 2019); the
        # auditor itself was a source of XSS bypasses on legacy engines. Rely on our
        # strict CSP + DOMPurify on the frontend instead.
        response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]      = "camera=(self), microphone=(self), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        # C5 — strict CSP: NO bare `https:` (which permits every HTTPS host). Explicit
        # allow-list of the origins actually used. Supabase/LiveKit URLs are best
        # supplied via env so this works across dev/staging/prod accounts.
        supabase_host = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").removeprefix("https://").split("/")[0]
        supabase_ws   = f"wss://{supabase_host}" if supabase_host else ""
        supabase_https= f"https://{supabase_host}" if supabase_host else ""
        livekit_host  = os.getenv("NEXT_PUBLIC_LIVEKIT_URL", "").removeprefix("wss://").split("/")[0]
        livekit_ws    = f"wss://{livekit_host}" if livekit_host else ""
        livekit_https = f"https://{livekit_host}" if livekit_host else ""
        sentry_dsn_host = ""
        _dsn = os.getenv("NEXT_PUBLIC_SENTRY_DSN", "")
        if _dsn.startswith("https://"):
            try: sentry_dsn_host = _dsn.removeprefix("https://").split("/")[0]
            except Exception: pass
        sentry_https = f"https://{sentry_dsn_host}" if sentry_dsn_host else ""
        _script_extra = "" if _IS_PRODUCTION else " https://*.vercel.app"
        _connect_src = " ".join(filter(None, [
            "'self'",
            supabase_https if supabase_https else "",
            supabase_ws if supabase_ws else "",
            livekit_https if livekit_https else "",
            livekit_ws if livekit_ws else "",
            "wss://*.livekit.cloud https://*.livekit.cloud",
            sentry_https if sentry_https else "",
        ]))
        csp = (
            "default-src 'self'; "
            f"script-src 'self' 'unsafe-inline'{_script_extra}; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "img-src 'self' data: https://res.cloudinary.com https://*.cloudinary.com https://cdn.aifazi.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            f"connect-src {_connect_src}; "
            "frame-src https://www.youtube.com https://player.vimeo.com; "
            "frame-ancestors 'none';"
        )
        response.headers["Content-Security-Policy"] = csp
        return response

app.add_middleware(SecurityMiddleware)

from routers import (
    auth, blog, upload, contact, content,
    forum, notifications,
    chat, chat_ai, chat_livekit, chat_dm, chat_url_preview,
    helpdesk, newsletter, banners,
    site_settings, email_settings, cdn_settings,
    search, stats, audit, backup, admin_actions,
    portfolio, seo_proxy, sitemap, cron, network, content_aggregator,
    pdf_editor, file_tools,
    mail_queue, mail_templates,
    fivem,
    forms,
    store,
    store_ecommerce,
    store_admin,
    store_catalog_admin,
    store_crm_admin,
    store_marketing_admin,
    store_inventory_admin,
    store_terminal_admin,
    store_delivery,
    documents,
    txadmin_webhook,
    webhooks,
    discord_auth,
    steam_auth,
    github_auth,
    db_console,
    monitor,
)

app.include_router(auth.router,           prefix="/api/auth")
app.include_router(blog.router,           prefix="/api/blog")
app.include_router(upload.router,         prefix="/api/upload")
app.include_router(contact.router,        prefix="/api/contact")
app.include_router(content_aggregator.router, prefix="/api/content")  # /global first — avoids shadowing by content's /{key} catch-all
app.include_router(content.router,        prefix="/api/content")
app.include_router(notifications.router,  prefix="/api/forum/notifications")
app.include_router(forum.router,          prefix="/api/forum")

app.include_router(chat_ai.router,        prefix="/api/chat/ai")
app.include_router(chat_livekit.router,  prefix="/api/chat")
app.include_router(chat.router,           prefix="/api/chat")
app.include_router(chat_dm.router,        prefix="/api/chat")
app.include_router(chat_url_preview.router, prefix="/api/chat")
app.include_router(audit.router,          prefix="/api/admin/audit")
app.include_router(stats.router,          prefix="/api/admin/stats")
app.include_router(stats.router,          prefix="/api/stats")
app.include_router(admin_actions.router,  prefix="/api/admin")
app.include_router(backup.router,         prefix="/api/admin/backup")
app.include_router(email_settings.router, prefix="/api/admin/email")
app.include_router(mail_queue.router,     prefix="/api/admin/mail/queue")
app.include_router(mail_templates.router, prefix="/api/admin/mail/templates")
app.include_router(banners.router,        prefix="/api/admin/banners")
app.include_router(site_settings.router,  prefix="/api/admin/site-settings")
app.include_router(cdn_settings.router,   prefix="/api/admin/cdn")
app.include_router(search.router,         prefix="/api/search")
app.include_router(newsletter.router,     prefix="/api/newsletter")
app.include_router(portfolio.router,      prefix="/api/portfolio")
app.include_router(helpdesk.router,       prefix="/api/helpdesk")
app.include_router(seo_proxy.router,      prefix="/api/seo-proxy")
app.include_router(sitemap.router,        prefix="")
app.include_router(cron.router,           prefix="")
app.include_router(monitor.router,        prefix="")
app.include_router(network.router,        prefix="/api/network")
app.include_router(pdf_editor.router,     prefix="/api/pdf-editor")
app.include_router(file_tools.router,     prefix="/api/file-tools")
app.include_router(fivem.router,          prefix="/api/fivem")
app.include_router(store.router,          prefix="/api/store")
app.include_router(store.bridge_router,   prefix="/api/fivem/store")  # Lua sync bridge only
app.include_router(store_ecommerce.router, prefix="/api/store")
app.include_router(store_admin.router,     prefix="/api/store/admin")
app.include_router(store_catalog_admin.router, prefix="/api/store/admin")
app.include_router(store_crm_admin.router,      prefix="/api/store/admin")
app.include_router(store_marketing_admin.router, prefix="/api/store/admin")
app.include_router(store_inventory_admin.router, prefix="/api/store/admin")
app.include_router(store_terminal_admin.router,  prefix="/api/store/admin")
app.include_router(store_delivery.router,        prefix="/api/store/delivery")
app.include_router(documents.router,       prefix="/api/documents")
app.include_router(forms.router,          prefix="/api/forms")
app.include_router(txadmin_webhook.router, prefix="/api/txadmin")
app.include_router(webhooks.router,         prefix="/api/webhook")
app.include_router(discord_auth.router,   prefix="/api/discord")
app.include_router(steam_auth.router,     prefix="/api/forum/auth/steam")
app.include_router(github_auth.router,    prefix="/api/forum/auth/github")
app.include_router(db_console.router,    prefix="/api/admin/db")

@app.get("/api/health")
async def health():
    db_ok = False
    try:
        from database import supabase as _sb
        _sb.table("site_config").select("key").limit(1).execute()
        db_ok = True
    except Exception:
        pass
    status = "OK" if db_ok else "degraded"
    code = 200 if db_ok else 503
    return JSONResponse(status_code=code, content={"status": status, "database": "connected" if db_ok else "unreachable"})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if dsn:
        sentry_sdk.capture_exception(exc)
    # Record + alert via the in-project monitor (Sentry-like, deduped email)
    try:
        import traceback
        from routers.monitor import _record_error
        await _record_error(
            source="backend",
            error_type=type(exc).__name__,
            message=str(exc) or type(exc).__name__,
            stack=traceback.format_exc(),
            endpoint=str(request.url.path),
            ip=request.client.host if request.client else "",
            user_agent=request.headers.get("user-agent", "")[:300],
        )
    except Exception:
        pass  # never let error-reporting break the response
    # Never leak internal details to clients in production
    msg = str(exc) if not _IS_PRODUCTION else "An unexpected error occurred."
    return JSONResponse(status_code=500, content={"error": msg})

# Socket.IO removed — chat is now handled by Supabase Realtime.
# Entry point: uvicorn main:app --host 0.0.0.0 --port 8000
