# Refactoring Plan — aifazi.net P1/P2 Items

**Created:** 2026-08-12  
**Status:** Draft  
**Depends on:** Security fixes (P0) completed — `PASETO_SECRET` enforcement, HMAC fallback removal, `JWT_SECRET` cleanup

---

## Overview

Five refactoring tasks to improve maintainability, scalability, and developer experience. No security impact — all are code quality/architecture improvements.

---

## Task 1: Redis Distributed Rate Limiting

### Problem
`main.py:243-302` uses in-memory `_rl_store` and `_ip_bans_cache`. On Railway (multi-instance) and Vercel (serverless), rate limits are per-instance only. Attackers bypass limits by spraying requests across instances.

### Current Partial Fix
Lines 431-447: Shared DB rate limit for sensitive paths (`_RL_SENSITIVE_SUFFIXES`), but fails open on DB error.

### Solution
Replace in-memory rate limiting with **Upstash Redis** (HTTP-based, works on serverless).

### Files to Modify
| File | Changes |
|------|---------|
| `aifazi.net-backend-fastapi/main.py` | Replace `_rl_store`/`_ip_bans_cache` with Upstash client; keep DB fallback for auth paths |
| `aifazi.net-backend-fastapi/requirements.txt` | Add `upstash-redis` |
| Railway/Vercel env | Add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |

### Implementation Details
```python
# New: utils/rate_limit.py
from upstash_redis import Redis
redis = Redis(url=os.getenv("UPSTASH_REDIS_REST_URL"), token=os.getenv("UPSTASH_REDIS_REST_TOKEN"))

async def check_rate_limit(bucket: str, max_calls: int, window: int) -> bool:
    # Sliding window using sorted set (timestamp as score)
    now = time.time()
    key = f"rl:{bucket}"
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now - window)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, window + 1)
    results = pipe.exec()
    return results[1] < max_calls
```

### IP Bans
- Keep in-memory cache with TTL (current `_ip_bans_cache` is fine for reads)
- On ban add/remove: publish to Redis channel → all instances invalidate cache immediately
- Or: store bans in Redis set with TTL, check directly

### Rollout
1. Add Upstash Redis (free tier: 10k req/day)
2. Deploy with feature flag: `USE_REDIS_RATE_LIMIT=true`
3. Monitor for 48h, then remove in-memory code

---

## Task 2: Split `providers.tsx` (772 lines)

### Problem
Single massive component managing:
- Theme system (dark/light, 40+ themes, font loading)
- Site config (admin settings, realtime sync, cross-tab)
- User package overrides
- Admin auth check
- Maintenance mode
- Error boundaries
- Realtime subscriptions (contacts, staff activity)
- Global error capture (Sentry-like)
- OS preference listener
- Loading/maintenance screens
- UI providers (Notify, Dialog, Menu, Edit, Forum)

### Solution
Extract into focused providers in `app/providers/`:

| Provider | Responsibility | Lines |
|----------|----------------|-------|
| `ThemeProvider` | Theme state, font loading, CSS vars, localStorage sync | ~200 |
| `SiteConfigProvider` | Admin settings, realtime sync, cache, cross-tab | ~150 |
| `AuthProvider` | `isAdmin`, `userPackage`, `checkIsAdmin()` | ~50 |
| `MaintenanceProvider` | Maintenance mode, subdomain maintenance | ~80 |
| `RealtimeProvider` | Supabase channels (contacts, staff_activity, site_config) | ~80 |
| `ErrorCaptureProvider` | Window error/unhandledrejection → `/api/monitor/errors` | ~30 |
| `OSPreferenceProvider` | `followOsTheme` media query listener | ~30 |
| `UIProviders` | Notify, Dialog, Menu, Edit, Forum, ErrorBoundary | ~50 |

### Composition
```tsx
// app/providers.tsx (new, ~100 lines)
export function Providers({ children, ...props }) {
  return (
    <ThemeProvider>
      <SiteConfigProvider>
        <AuthProvider>
          <MaintenanceProvider>
            <RealtimeProvider>
              <ErrorCaptureProvider>
                <OSPreferenceProvider>
                  <UIProviders>{children}</UIProviders>
                </OSPreferenceProvider>
              </ErrorCaptureProvider>
            </RealtimeProvider>
          </MaintenanceProvider>
        </AuthProvider>
      </SiteConfigProvider>
    </ThemeProvider>
  )
}
```

### Migration Strategy
1. Create `app/providers/` directory
2. Extract one provider at a time; test after each
3. Update imports in `app/layout.tsx` (single entry point)
4. Delete old `providers.tsx` when all extracted

### Risks
- Theme initialization order (FOUC prevention script in `layout.tsx` reads `localStorage` before providers mount)
- Cross-provider dependencies (e.g., `SiteConfigProvider` needs `ThemeProvider` for `lockTheme`)

---

## Task 3: Modularize Router Registration

### Problem
`main.py:557-647` imports 50+ routers in a flat list. Hard to:
- Find which router handles a path
- Enable/disable features
- Test in isolation
- Understand API surface

### Solution
Group routers into **feature modules** with explicit mounting.

### Proposed Structure
```
aifazi.net-backend-fastapi/
├── routers/
│   ├── __init__.py              # exports: mount_all(app)
│   ├── auth/                    # auth, discord_auth, github_auth, steam_auth
│   │   ├── __init__.py          # mount_auth(app)
│   │   ├── router.py
│   │   ├── discord.py
│   │   ├── github.py
│   │   └── steam.py
│   ├── admin/                   # admin_actions, audit, backup, banners, db_console, email_settings, mail_*, site_settings, cdn_settings, stats, mobile_admin
│   ├── content/                 # blog, content, content_aggregator, portfolio, search, seo_proxy, sitemap, forms
│   ├── community/               # forum, notifications, chat, chat_*, helpdesk, newsletter
│   ├── fivem/                   # fivem, txadmin_webhook
│   ├── store/                   # store, store_*, documents
│   ├── dev/                     # pdf_editor, file_tools, network, upload, cron, monitor, db_console
│   └── mobile/                  # mobile_release, mobile_admin
```

### Implementation
```python
# routers/__init__.py
def mount_all(app: FastAPI):
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
```

### Benefits
- Clear ownership: each module has a maintainer
- Feature flags: `if settings.ENABLE_STORE: mount_store(app)`
- Easier testing: import `mount_auth` in test to get auth-only app
- Documentation: each module can have its own README

---

## Task 4: Move Email Templates to Jinja2

### Problem
Large HTML strings in `fivem.py:218-348` and `auth.py:210-249`. No preview, XSS risk if escaping missed, hard to maintain.

### Solution
Use **Jinja2** templates in `templates/email/`.

### Structure
```
aifazi.net-backend-fastapi/
├── templates/
│   ├── email/
│   │   ├── base.html              # Layout wrapper
│   │   ├── whitelist_approved.html
│   │   ├── whitelist_denied.html
│   │   ├── whitelist_reset.html
│   │   ├── whitelist_applied.html
│   │   ├── priority_update.html
│   │   ├── banned.html
│   │   ├── unbanned.html
│   │   ├── verify_email.html
│   │   ├── reset_password.html
│   │   └── find_username.html
│   └── admin/
│       └── ...
```

### Implementation
```python
# utils/email.py (new)
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path

env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates"),
    autoescape=select_autoescape(["html", "xml"]),
    enable_async=True,
)

async def render_template(name: str, context: dict) -> tuple[str, str]:
    """Returns (subject, html)."""
    template = env.get_template(f"email/{name}.html")
    html = await template.render_async(**context)
    # Extract subject from <title> or first <h1>
    subject = extract_subject(html)
    return subject, html
```

### Migration
1. Add `jinja2` to `requirements.txt`
2. Create `templates/email/` with extracted templates
3. Replace `_email_*()` functions in `fivem.py` and `auth.py` with `render_template()`
4. Keep `_e()` escaping helper (Jinja2 autoescape handles it, but defense in depth)

---

## Task 5: Pydantic Validation for Webhook Events

### Problem
`store.py:360-396` (Stripe webhook) processes events without validating structure. Malformed events crash the handler.

### Solution
Add Pydantic models for each Stripe event type; validate before handling.

### Models
```python
# routers/store/webhook_models.py
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class StripeEventBase(BaseModel):
    id: str
    type: str
    api_version: str
    created: int
    data: "StripeEventData"
    livemode: bool
    pending_webhooks: int
    request: Optional[dict] = None

class StripeEventData(BaseModel):
    object: dict

# Specific event types
class CheckoutSessionCompleted(StripeEventBase):
    type: Literal["checkout.session.completed"]
    data: "CheckoutSessionData"

class CheckoutSessionData(BaseModel):
    object: "CheckoutSession"

class CheckoutSession(BaseModel):
    id: str
    client_reference_id: Optional[str]
    metadata: dict
    subscription: Optional[str]
    customer: Optional[str]
    payment_intent: Optional[str]
    amount_total: Optional[int]
    # ... other fields used

class PaymentIntentSucceeded(StripeEventBase):
    type: Literal["payment_intent.succeeded"]
    data: "PaymentIntentData"

# ... etc for each event type
```

### Implementation
```python
# In store.py webhook handler
from .webhook_models import StripeEventBase, CheckoutSessionCompleted, ...

EVENT_MODELS = {
    "checkout.session.completed": CheckoutSessionCompleted,
    "payment_intent.succeeded": PaymentIntentSucceeded,
    "customer.subscription.created": SubscriptionEvent,
    "customer.subscription.updated": SubscriptionEvent,
    "customer.subscription.deleted": SubscriptionEvent,
    "invoice.payment_failed": InvoiceEvent,
}

@router.post("/webhook")
async def stripe_webhook(request: Request):
    # ... signature verification ...
    event_type = event.get("type", "")
    model = EVENT_MODELS.get(event_type)
    if model:
        try:
            validated = model(**event)
        except ValidationError as e:
            log.warning("Stripe webhook validation failed: %s", e)
            raise HTTPException(400, "Invalid event structure")
        # Use validated.data.object instead of raw dict
    else:
        validated = StripeEventBase(**event)  # basic validation
    # ... rest of handler
```

---

## Dependencies Between Tasks

| Task | Depends On | Blocks |
|------|------------|--------|
| 1. Redis Rate Limit | None | None |
| 2. Split providers.tsx | None | None |
| 3. Modularize routers | None | None |
| 4. Jinja2 emails | None | None |
| 5. Webhook validation | None | None |

**All tasks are independent** — can be done in parallel.

---

## Recommended Order

1. **Task 1 (Redis)** — Highest operational impact (fixes rate limit bypass)
2. **Task 5 (Webhook validation)** — Low effort, prevents production crashes
3. **Task 4 (Jinja2 emails)** — Improves maintainability, enables preview
4. **Task 3 (Modularize routers)** — Medium effort, improves code navigation
5. **Task 2 (Split providers.tsx)** — Highest effort, but enables future theming work

---

## Validation Checklist per Task

| Task | Validation |
|------|------------|
| 1 | Load test: 100 req/s across 3 Railway instances → rate limit holds |
| 2 | All pages render; theme switching works; no hydration mismatches |
| 3 | `python -c "from main import app; print(len(app.routes))"` → same route count |
| 4 | Send test emails via admin panel → render correctly in Gmail/Outlook |
| 5 | Send malformed Stripe webhook → returns 400, not 500 |

---

## Open Questions

1. **Redis provider**: Upstash (HTTP) vs. standard Redis (TCP)? Upstash works on serverless but adds latency. Railway supports standard Redis.
2. **Provider split**: Should `ForumProvider` stay in `context/ForumContext.tsx` or move to `providers/`? Currently it's separate.
3. **Router modules**: Should `db_console` stay in `dev/` or move to `admin/`? It's admin-only but dev-facing.
4. **Email templates**: Keep `_e()` helper or rely on Jinja2 autoescape? (Recommend: both)
5. **Webhook models**: Generate from Stripe OpenAPI spec or hand-write? (Recommend: hand-write for only used fields)

---

## Rollback Plan

Each task is independently reversible:
- Redis: feature flag `USE_REDIS_RATE_LIMIT=false`
- Providers: git revert single provider file
- Routers: git revert `routers/__init__.py`
- Jinja2: git revert template files + `utils/email.py`
- Webhook: git revert `webhook_models.py` + handler changes

---

## Next Steps

1. **Confirm task prioritization** — any reordering?
2. **Decide on open questions** — especially Redis provider choice
3. **Assign ownership** — who implements each task?
4. **Create implementation tickets** — one per task with acceptance criteria