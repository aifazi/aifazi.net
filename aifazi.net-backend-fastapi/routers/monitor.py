"""
routers/monitor.py — Uptime / service monitor.

Checks the health of the core services (frontend, backend API, Supabase DB,
email provider, FiveM) and records the results in the `uptime_checks` table.

- Public:   GET /api/monitor/status  → sanitized status for the /status page
- Staff:    GET /api/monitor/checks  → recent check history
- Staff:    POST /api/monitor/run    → force a check now
- Cron:     GET /api/cron/monitor    → scheduled checks (Vercel cron, CRON_SECRET)

Alerts are sent via the existing mail queue (Resend/Brevo/SMTP) using the
`monitor_alert` template when a service transitions to DOWN (or is still down
after a configurable consecutive-failure threshold).
"""
import os, hmac, asyncio, logging, time
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Depends
from database import supabase
from dependencies import get_current_user, require_staff

router = APIRouter()
logger = logging.getLogger("monitor")

CRON_SECRET = os.getenv("CRON_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "https://api.aifazi.net").rstrip("/")

# How many consecutive failures before we fire an email alert (avoids noise on
# a single transient blip). Downtime stays recorded immediately regardless.
ALERT_THRESHOLD = int(os.getenv("MONITOR_ALERT_THRESHOLD", "2"))
ALERT_EMAILS = [e for e in os.getenv("MONITOR_ALERT_EMAILS", "").replace(";", ",").split(",") if e.strip()]

# Services to monitor — name maps to a human label + a check callable.
SERVICES = [
    {"name": "frontend",    "label": "Website"},
    {"name": "backend",     "label": "API"},
    {"name": "database",    "label": "Database"},
    {"name": "email",       "label": "Email Service"},
    {"name": "fivem",       "label": "FiveM Server"},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Individual checks ──────────────────────────────────────────────────────────
async def _check_http(url: str, timeout: float = 8.0) -> tuple[bool, float, str]:
    """GET a URL, return (ok, latency_ms, detail). Never raises."""
    import httpx
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url)
            lat = round((time.perf_counter() - start) * 1000)
            ok = r.status_code < 500
            return ok, lat, f"{r.status_code}"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


async def _check_frontend():
    return await _check_http(FRONTEND_URL)


async def _check_backend():
    ok, lat, detail = await _check_http(f"{BACKEND_URL}/api/health")
    return ok, lat, detail


async def _check_database():
    start = time.perf_counter()
    try:
        res = supabase.table("site_config").select("id").limit(1).execute()
        lat = round((time.perf_counter() - start) * 1000)
        ok = bool(res.data)
        return ok, lat, "connected" if ok else "no rows"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


async def _check_email():
    """Verify an email provider is actually configured (no send attempt)."""
    start = time.perf_counter()
    try:
        res = supabase.table("email_config").select("settings").eq("key", "global").limit(1).execute()
        lat = round((time.perf_counter() - start) * 1000)
        if not res.data:
            return False, lat, "not configured"
        s = res.data[0].get("settings") or {}
        provider = s.get("outgoingProvider") or s.get("outgoing_provider") or "smtp"
        if provider == "resend" and s.get("resendApiKey"):
            return True, lat, "resend"
        if provider == "brevo" and s.get("brevoApiKey"):
            return True, lat, "brevo"
        if provider == "smtp" and s.get("smtpHost"):
            return True, lat, "smtp"
        return False, lat, "no provider configured"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


async def _check_fivem():
    return await _check_http(f"{BACKEND_URL}/api/fivem/status")


CHECKERS = {
    "frontend": _check_frontend,
    "backend": _check_backend,
    "database": _check_database,
    "email": _check_email,
    "fivem": _check_fivem,
}


# ── Alerting ───────────────────────────────────────────────────────────────────
async def _last_fail_count(service: str) -> int:
    """Consecutive failures for a service, from the most recent rows."""
    try:
        res = supabase.table("uptime_checks").select("status") \
            .eq("service", service).order("checked_at", desc=True).limit(10).execute()
        count = 0
        for row in (res.data or []):
            if row.get("status") == "down":
                count += 1
            else:
                break
        return count
    except Exception:
        return ALERT_THRESHOLD  # if we can't read history, stay conservative


async def _send_alert(service: str, detail: str):
    if not ALERT_EMAILS:
        logger.warning("monitor: service %s down but MONITOR_ALERT_EMAILS not set — skipping email", service)
        return
    from utils.email_queue import queue_email
    status_url = f"{FRONTEND_URL}/status"
    subject, html = await asyncio.to_thread(
        lambda: __import__("utils.email", fromlist=["render_template"]).render_template(
            "monitor_alert",
            {"service": service, "detail": detail, "status_url": status_url,
             "checked_at": _now(), "site_name": "aifazi.net"},
        )
    )
    for to in ALERT_EMAILS:
        await queue_email(to=to, subject=subject, html=html, text="", purpose="monitor_alert")


# ── Run all checks + record + alert ────────────────────────────────────────────
async def _run_all_checks() -> list[dict]:
    results = []
    for svc in SERVICES:
        checker = CHECKERS.get(svc["name"])
        if not checker:
            continue
        ok, lat, detail = await checker()
        status = "up" if ok else "down"
        row = {
            "service": svc["name"],
            "label": svc["label"],
            "status": status,
            "latency_ms": lat,
            "detail": detail[:200],
            "checked_at": _now(),
        }
        results.append(row)
        try:
            supabase.table("uptime_checks").insert(row).execute()
        except Exception as e:
            logger.error("monitor: failed to record %s: %s", svc["name"], e)

        if status == "down":
            fails = await _last_fail_count(svc["name"])
            if fails >= ALERT_THRESHOLD:
                await _send_alert(svc["name"], detail)

    return results


def _cron_auth(request: Request):
    if not CRON_SECRET:
        raise HTTPException(503, "CRON_SECRET is not configured.")
    auth = request.headers.get("authorization", "")
    if not hmac.compare_digest(auth, f"Bearer {CRON_SECRET}"):
        raise HTTPException(401, "Unauthorized")


# ── Cron (Vercel scheduled) ───────────────────────────────────────────────────
@router.get("/api/cron/monitor")
async def cron_monitor(request: Request):
    _cron_auth(request)
    results = await _run_all_checks()
    return {"status": "ok", "ran_at": _now(), "results": results}


# ── Public status (sanitized — no secrets) ────────────────────────────────────
@router.get("/api/monitor/status")
async def public_status():
    """Aggregated uptime + last-check per service for the public /status page."""
    now = datetime.now(timezone.utc)
    out = []
    try:
        for svc in SERVICES:
            res = supabase.table("uptime_checks").select("status,latency_ms,detail,checked_at") \
                .eq("service", svc["name"]).order("checked_at", desc=True).limit(500).execute()
            rows = res.data or []
            if not rows:
                out.append({"name": svc["name"], "label": svc["label"], "status": "unknown",
                            "uptime_24h": None, "uptime_7d": None, "last": None})
                continue
            last = rows[0]
            up_24h = sum(1 for r in rows if r.get("status") == "up") / len(rows) if rows else 0
            out.append({
                "name": svc["name"], "label": svc["label"],
                "status": last.get("status", "unknown"),
                "latency_ms": last.get("latency_ms"),
                "detail": last.get("detail"),
                "last_checked": last.get("checked_at"),
                "uptime_24h": round(up_24h * 100, 1),
            })
    except Exception as e:
        logger.error("monitor: public_status failed: %s", e)
        return {"overall": "degraded", "services": []}

    overall = "operational" if all(s["status"] == "up" for s in out) else \
              ("degraded" if any(s["status"] == "up" for s in out) else "outage")
    return {"overall": overall, "generated_at": now.isoformat(), "services": out}


# ── Staff: history ────────────────────────────────────────────────────────────
@router.get("/api/monitor/checks")
async def staff_checks(user: dict = Depends(require_staff), limit: int = 200):
    try:
        res = supabase.table("uptime_checks").select("*") \
            .order("checked_at", desc=True).limit(min(limit, 1000)).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(500, f"Could not read monitor history: {e}")


# ── Staff: run now ────────────────────────────────────────────────────────────
@router.post("/api/monitor/run")
async def staff_run(user: dict = Depends(require_staff)):
    results = await _run_all_checks()
    return {"ran_at": _now(), "results": results}
