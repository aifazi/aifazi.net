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
import asyncio
import hmac
import ipaddress
import logging
import os
import socket
import time
from collections import deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from database import supabase
from dependencies import require_admin, require_staff
from permissions import require_permission
from utils.audit import record as _audit
from utils.ssrf import BLOCKED_NETWORKS, is_blocked_ip

router = APIRouter()
logger = logging.getLogger("monitor")

MONITOR_MANAGE = require_permission("system.monitor", "manage")


def _actor(user: dict) -> str:
    return str(user.get("username") or user.get("id") or "staff")


def _ip(request: Request | None) -> str:
    try:
        return request.client.host if request and request.client else ""
    except Exception:
        return ""


def _email_ok(email: str) -> bool:
    """Loose email sanity check without regex (avoids ReDoS-class patterns)."""
    if not isinstance(email, str) or email.count("@") != 1:
        return False
    if any(c in email for c in (" ", "\t", "\n", ";", ",")):
        return False
    local, _, domain = email.partition("@")
    return bool(local) and "." in domain and not domain.startswith(".")

CRON_SECRET = os.getenv("CRON_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "https://api.aifazi.net").rstrip("/")


def _host_blocked(host: str) -> tuple[bool, str]:
    """Return (blocked, reason) for a hostname/IP target. Resolves hostnames and
    rejects them if ANY resolved address falls into a blocked network."""
    try:
        host_ip = ipaddress.ip_address(host)
        candidates = [host_ip]
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            candidates = [ipaddress.ip_address(info[4][0]) for info in infos]
        except Exception:
            return False, ""  # unresolved — let the checker report its own error
    for ip in candidates:
        if is_blocked_ip(ip):
            return True, str(ip)
    return False, ""


def _resolve_safe_ip(host: str) -> str | None:
    """Resolve host to a validated PUBLIC IP, or None if every candidate is
    blocked / unresolvable. Used to PIN the connection: the resolved address is
    validated once, then the request connects to that exact IP (with the Host
    header rewritten) so a DNS-rebinding attacker can't swap the target between
    the validation probe and the actual connect (the H20 TOCTOU fix)."""
    try:
        ip_obj = ipaddress.ip_address(host)
        return None if is_blocked_ip(ip_obj) else host
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except Exception:
            return None
        for info in infos:
            try:
                ip_obj = ipaddress.ip_address(info[4][0])
            except ValueError:
                continue
            if is_blocked_ip(ip_obj):
                return None
            return str(info[4][0])
        return None

# Defaults — overridden by admin settings stored in site_config.settings.monitor
DEFAULT_ALERT_THRESHOLD = 2
DEFAULT_ALERT_EMAILS = ""

# Services to monitor — name maps to a human label + a check callable.
SERVICES = [
    {"name": "frontend",    "label": "Website"},
    {"name": "backend",     "label": "API"},
    {"name": "database",    "label": "Database"},
    {"name": "email",       "label": "Email Service"},
    {"name": "fivem",       "label": "FiveM Server"},
    {"name": "mobile",      "label": "Mobile App"},
    {"name": "vpn",         "label": "VPN"},
]


def _get_monitor_settings() -> dict:
    """Read monitor settings from site_config.settings.monitor (admin-editable)."""
    try:
        res = supabase.table("site_config").select("settings").eq("key", "global").limit(1).execute()
        if res.data:
            settings = res.data[0].get("settings") or {}
            return settings.get("monitor") or {}
    except Exception as e:
        logger.debug("monitor: settings read failed, using defaults: %s", e)
    return {}


def _alert_emails() -> list[str]:
    cfg = _get_monitor_settings()
    raw = cfg.get("alert_emails") or DEFAULT_ALERT_EMAILS
    out = [e.strip() for e in raw.replace(";", ",").split(",") if e.strip()]
    # Validate, warn don't fail: a typo'd address must not silently kill alerts.
    bad = [e for e in out if not _email_ok(e)]
    if bad:
        logger.warning("monitor: %d alert email(s) look invalid and may not deliver: %s", len(bad), bad)
    return out


def _alert_threshold() -> int:
    cfg = _get_monitor_settings()
    try:
        return max(1, int(cfg.get("alert_threshold", DEFAULT_ALERT_THRESHOLD)))
    except (TypeError, ValueError):
        return DEFAULT_ALERT_THRESHOLD


def _enabled_services() -> list[str]:
    cfg = _get_monitor_settings()
    enabled = cfg.get("enabled_services")
    if not enabled:
        return [s["name"] for s in SERVICES]
    valid = {s["name"] for s in SERVICES}
    return [n for n in enabled if n in valid]


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


async def _check_mobile():
    """Mobile app release pipeline: our own /api/mobile/status must answer.

    `state` (ready|building|none) is a normal pipeline condition, so any
    well-formed JSON counts as UP — only a dead/instrumented backend or a
    broken release endpoint is a failure.
    """
    start = time.perf_counter()
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(f"{BACKEND_URL}/api/mobile/status")
            lat = round((time.perf_counter() - start) * 1000)
            if r.status_code != 200:
                return False, lat, f"HTTP {r.status_code}"
            data = r.json()
            state = data.get("state")
            if state not in ("ready", "building", "none"):
                return False, lat, f"unexpected state: {state!r}"
            return True, lat, f"release {state}"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


async def _check_vpn():
    """WireGuard server health: host API reachable, interface up, peer mix.

    DOWN only when the server itself is unreachable/down. An idle fleet
    (peers exist, none recently handshaked) is still UP — idleness is
    reported in the detail string, not as an outage, so alerts don't fire
    just because nobody is connected at 4am.
    """
    start = time.perf_counter()
    try:
        from utils.wireguard import is_interface_up, parse_peer_stats
        from routers.vpn import CONNECTED_HANDSHAKE_MAX_AGE_S, _handshake_age_seconds
        from database import supabase as _sb
        up = await is_interface_up()
        lat = round((time.perf_counter() - start) * 1000)
        if not up:
            return False, lat, "server down"
        try:
            db = _sb.table("vpn_peers").select("public_key").execute()
            keys = [r.get("public_key", "") for r in (db.data or [])]
        except Exception as e:
            logger.debug("monitor: vpn peer list read failed: %s", e)
            keys = []
        connected = 0
        try:
            stats = await parse_peer_stats()
            for k in keys:
                age = _handshake_age_seconds(stats.get(k, {}).get("latest_handshake", ""))
                if age is not None and age < CONNECTED_HANDSHAKE_MAX_AGE_S:
                    connected += 1
        except Exception as e:
            logger.debug("monitor: vpn peer stats parse failed: %s", e)
        return True, lat, f"{len(keys)} peers, {connected} connected"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


CHECKERS = {
    "frontend": _check_frontend,
    "backend": _check_backend,
    "database": _check_database,
    "email": _check_email,
    "fivem": _check_fivem,
    "mobile": _check_mobile,
    "vpn": _check_vpn,
}


# ── Custom monitor checkers ───────────────────────────────────────────────────
# Each returns (ok, latency_ms, detail). Runs inside the same run-all pass so
# alerts + history reuse the existing uptime_checks machinery.

async def _safe_http_get(url: str, timeout: float = 8.0, max_hops: int = 5) -> tuple[bool, float, str, str]:
    """HTTP GET with SSRF-safe DNS pinning (replicates seo_proxy's H20 fix).

    Resolves the host once, rejects private/loopback/link-local/metadata
    addresses, then connects to the PINNED IP with the Host header rewritten so
    SNI + virtual-host routing still works. Redirects are followed manually and
    each hop is re-validated, so a DNS-rebinding attacker can't swap the target
    to 169.254.169.254 (cloud metadata) or RFC1918 after the check.

    Returns (ok, latency_ms, detail, body_text).
    """
    from urllib.parse import urlparse

    import httpx
    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, verify=True) as client:
        current = url
        for _ in range(max_hops):
            parsed = urlparse(current)
            host = parsed.hostname or ""
            if not host:
                return False, 0, "invalid URL", ""
            safe_ip = _resolve_safe_ip(host)
            if safe_ip is None:
                blocked, ip = _host_blocked(host)
                return False, 0, (f"target resolves to blocked network ({ip})" if blocked else "target has no usable address"), ""
            try:
                port = parsed.port
                if ":" in safe_ip:  # IPv6 literal
                    netloc = f"[{safe_ip}]" if port is None else f"[{safe_ip}]:{port}"
                else:
                    netloc = safe_ip if port is None else f"{safe_ip}:{port}"
                pinned_url = parsed._replace(netloc=netloc).geturl()
                r = await client.get(pinned_url, headers={"Host": host, "User-Agent": "aifazi.net Monitor/1.0"})
            except Exception as e:
                lat = round((time.perf_counter() - start) * 1000)
                return False, lat, type(e).__name__, ""
            lat = round((time.perf_counter() - start) * 1000)
            if r.status_code in (301, 302, 303, 307, 308):
                location = r.headers.get("location")
                if not location:
                    return False, lat, f"redirect without location ({r.status_code})", ""
                current = str(httpx.URL(current).join(location))
                continue
            ok = r.status_code < 500
            return ok, lat, f"{r.status_code}", (r.text or "")[:200000]
    return False, 0, "too many redirects", ""


async def _check_website(m):
    url = m.get("target") or ""
    if not url.startswith(("http://", "https://")):
        return False, 0, "target must be an http(s) URL", ""
    ok, lat, detail, _ = await _safe_http_get(url)
    return ok, lat, detail


async def _check_keyword(m):
    url = m.get("target") or ""
    expected = m.get("expected") or ""
    if not url.startswith(("http://", "https://")):
        return False, 0, "target must be an http(s) URL"
    if not expected:
        return False, 0, "no keyword configured"
    ok, lat, detail, text = await _safe_http_get(url)
    if not ok:
        return ok, lat, detail
    present = expected.lower() in (text or "").lower()
    mode = m.get("mode") or "contains"
    ok = present if mode == "contains" else not present
    if ok:
        return ok, lat, f"{'found' if present else 'missing'} '{expected}'"
    return ok, lat, (f"expected '{expected}' present but missing" if mode == "contains" else f"keyword '{expected}' unexpectedly present")


def _socket_connect(ip: str, port: int, display_host: str, timeout: float = 5.0) -> tuple[bool, float, str]:
    start = time.perf_counter()
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            lat = round((time.perf_counter() - start) * 1000)
            return True, lat, f"connected to {display_host}:{port}"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


def _parse_port(m) -> int | None:
    try:
        port = int(m.get("port") or 0)
    except (TypeError, ValueError):
        return None
    return port


def _parse_interval(m, default: int = 60) -> int:
    try:
        return max(1, int(m.get("interval_seconds") or default))
    except (TypeError, ValueError):
        return default


async def _check_ping(m):
    host = (m.get("target") or "").strip()
    if not host:
        return False, 0, "no host configured"
    safe_ip = _resolve_safe_ip(host)
    if safe_ip is None:
        return False, 0, "target resolves to a blocked network or has no usable address"
    # Prefer a subprocess ping; fall back to a TCP connect on the PINNED IP
    # (serverless sandboxes often lack the ping binary or ICMP privileges).
    # NOTE: ping the resolved safe_ip, NOT the hostname — pinging the hostname
    # would re-resolve DNS and re-open the rebinding TOCTOU the PINNED IP closes.
    import subprocess
    start = time.perf_counter()
    try:
        res = await asyncio.to_thread(
            subprocess.run, ["ping", "-c", "1", "-W", "2", safe_ip],
            capture_output=True, text=True, timeout=6,
        )
        if res.returncode == 0:
            lat = round((time.perf_counter() - start) * 1000)
            return True, lat, "reachable"
    except Exception as e:
        logger.debug("monitor: ping subprocess unavailable, TCP fallback: %s", e)
    return await asyncio.to_thread(_socket_connect, safe_ip, 443, host)


async def _check_port(m):
    host = (m.get("target") or "").strip()
    port = _parse_port(m)
    if not host or port is None or not (1 <= port <= 65535):
        return False, 0, "need host and a valid port"
    safe_ip = _resolve_safe_ip(host)
    if safe_ip is None:
        return False, 0, "target resolves to a blocked network or has no usable address"
    return await asyncio.to_thread(_socket_connect, safe_ip, port, host)


async def _check_cron(m):
    """Scheduled-job monitor: alert if the job's last heartbeat is too old."""
    job = (m.get("target") or "").strip()
    if not job:
        return False, 0, "no job name configured"
    interval = _parse_interval(m, 60)
    try:
        res = supabase.table("job_heartbeats").select("last_run_at,last_status,last_detail") \
            .eq("job", job).limit(1).execute()
        if not res.data or not res.data[0].get("last_run_at"):
            return False, 0, f"job '{job}' has never run"
        last = res.data[0]
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(str(last["last_run_at"]))).total_seconds()
        if age > interval:
            return False, round(age), f"last run {int(age)}s ago (> {interval}s)"
        return True, round(age), f"ran {int(age)}s ago ({last.get('last_status') or 'ok'})"
    except Exception as e:
        return False, 0, type(e).__name__


async def _check_dns(m):
    host = (m.get("target") or "").strip()
    expected = (m.get("expected") or "").strip()
    if not host:
        return False, 0, "no hostname configured"
    blocked, ip = _host_blocked(host)
    if blocked:
        return False, 0, f"target resolves to blocked network ({ip})"
    start = time.perf_counter()
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        ips = sorted({info[4][0] for info in infos})
        lat = round((time.perf_counter() - start) * 1000)
        if not ips:
            return False, lat, "no A/AAAA records"
        if expected:
            ok = expected in ips
            return ok, lat, (f"resolves to {', '.join(ips)}" if ok else f"expected {expected}, got {', '.join(ips)}")
        return True, lat, f"resolves to {', '.join(ips)}"
    except Exception as e:
        lat = round((time.perf_counter() - start) * 1000)
        return False, lat, type(e).__name__


CUSTOM_CHECKERS = {
    "website": _check_website,
    "keyword": _check_keyword,
    "ping": _check_ping,
    "port": _check_port,
    "cron": _check_cron,
    "dns": _check_dns,
}


def _get_custom_monitors(enabled_only: bool = True) -> list[dict]:
    try:
        q = supabase.table("monitor_checks").select("*").order("created_at")
        if enabled_only:
            q = q.eq("enabled", True)
        return q.execute().data or []
    except Exception as e:
        logger.error("monitor: could not load custom monitors: %s", e)
        return []


def record_job_heartbeat(job: str, status: str = "ok", detail: str = "") -> None:
    """Called by cron/background jobs so 'cron' monitors can detect staleness."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("job_heartbeats").upsert({
            "job": job, "last_run_at": now, "last_status": status,
            "last_detail": str(detail)[:200], "updated_at": now,
        }, on_conflict="job").execute()
    except Exception as e:
        logger.warning("monitor: heartbeat record failed for %s: %s", job, e)


# ── Alerting ───────────────────────────────────────────────────────────────────
async def _last_fail_count(service: str) -> int:
    """Consecutive failures for a service, from the most recent rows."""
    # Look at enough history to cover the configured threshold — the old hard
    # limit(10) meant a threshold > 10 could never fire an alert.
    limit = max(50, _alert_threshold())
    try:
        res = supabase.table("uptime_checks").select("status") \
            .eq("service", service).order("checked_at", desc=True).limit(limit).execute()
        count = 0
        for row in (res.data or []):
            if row.get("status") == "down":
                count += 1
            else:
                break
        return count
    except Exception:
        return _alert_threshold()  # if we can't read history, stay conservative


async def _send_alert(service: str, detail: str):
    recipients = _alert_emails()
    if not recipients:
        logger.warning("monitor: service %s down but no alert emails configured — skipping email", service)
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
    for to in recipients:
        await queue_email(to=to, subject=subject, html=html, text="", purpose="monitor_alert")


# ── Run all checks + record + alert ────────────────────────────────────────────
async def _run_all_checks() -> list[dict]:
    results = []
    threshold = _alert_threshold()
    for svc in SERVICES:
        if svc["name"] not in _enabled_services():
            continue
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
            if fails >= threshold:
                await _send_alert(svc["name"], detail)

    # Custom, admin-configured monitors
    for m in _get_custom_monitors(enabled_only=True):
        custom_checker = CUSTOM_CHECKERS.get(str(m.get("type") or ""))
        if not custom_checker:
            continue
        service = f"custom:{m.get('id')}"
        label = m.get("name") or m.get("type", "monitor")
        # One malformed monitor (bad port / interval / target) must never take
        # down the whole monitor run — record it as down with the exception.
        try:
            ok, lat, detail = await custom_checker(m)  # type: ignore[call-arg]
        except Exception as e:
            logger.error("monitor: custom check %s crashed: %s", service, e)
            ok, lat, detail = False, 0, f"checker error: {type(e).__name__}"
        status = "up" if ok else "down"
        row = {
            "service": service,
            "label": label,
            "status": status,
            "latency_ms": lat,
            "detail": str(detail)[:200],
            "checked_at": _now(),
        }
        results.append(row)
        try:
            supabase.table("uptime_checks").insert(row).execute()
        except Exception as e:
            logger.error("monitor: failed to record custom monitor %s: %s", service, e)
        if status == "down":
            fails = await _last_fail_count(service)
            if fails >= threshold:
                await _send_alert(label, str(detail))

    # Refresh the in-memory ping cache so the unauthenticated /api/monitor/ping
    # serves fresh data without ever running checks itself.
    overall = "operational" if all(r["status"] == "up" for r in results) else \
              ("degraded" if any(r["status"] == "up" for r in results) else "outage")
    _ping_cache["at"] = time.monotonic()
    _ping_cache["payload"] = {
        "status": overall,
        "ran_at": _now(),
        "services": {r["service"]: r["status"] for r in results},
    }
    return results


def _cron_auth(request: Request):
    if not CRON_SECRET:
        raise HTTPException(503, "CRON_SECRET is not configured.")
    auth = request.headers.get("authorization", "")
    if not hmac.compare_digest(auth, f"Bearer {CRON_SECRET}"):
        raise HTTPException(401, "Unauthorized")


# ── Cron (Vercel scheduled, daily on Hobby) ────────────────────────────────────
@router.get("/api/cron/monitor")
async def cron_monitor(request: Request):
    _cron_auth(request)
    results = await _run_all_checks()
    record_job_heartbeat("monitor", "ok", f"{len(results)} checks")
    return {"status": "ok", "ran_at": _now(), "results": results}


# ── Public ping — external uptime service (UptimeRobot/BetterStack, free) hits
#    this every N minutes. It serves the last cached/stored status ONLY and
#    never triggers checks itself (see monitor_ping). Fresh data is written by
#    the cron tick / staff manual run, which refresh the in-memory cache below
#    so floods can't trigger expensive check runs or alert-email storms. ──
_PING_TTL_SECONDS = 300
_ping_cache: dict = {"at": 0.0, "payload": None}


@router.get("/api/monitor/ping")
async def monitor_ping(request: Request):
    """Serve the LAST cached/stored status only — this unauthenticated endpoint
    must never run the full check suite (expensive fan-out + alert-email
    side effects on every anonymous hit). Fresh checks are written by the
    CRON_SECRET-gated /api/cron/monitor tick and the staff POST /api/monitor/run
    path; both update _ping_cache below. 503 when no cached data exists yet."""
    now_ts = time.monotonic()
    cached = _ping_cache["payload"]
    if cached is not None and (now_ts - _ping_cache["at"]) < _PING_TTL_SECONDS:
        return cached
    try:
        res = supabase.table("uptime_checks").select("service,status,checked_at") \
            .order("checked_at", desc=True).limit(200).execute()
        rows = res.data or []
    except Exception as e:
        logger.error("monitor: ping could not read cached status: %s", e)
        raise HTTPException(503, "Monitor status unavailable")
    if not rows:
        raise HTTPException(503, "Monitor status unavailable")
    latest: dict[str, dict] = {}
    for row in rows:
        svc = row.get("service") or ""
        if svc and svc not in latest:
            latest[svc] = row
    services = {svc: row.get("status", "unknown") for svc, row in latest.items()}
    ran_at = max((row.get("checked_at") or "" for row in latest.values()), default="")
    overall = "operational" if all(s == "up" for s in services.values()) else \
              ("degraded" if any(s == "up" for s in services.values()) else "outage")
    payload = {"status": overall, "ran_at": ran_at, "services": services}
    _ping_cache["at"] = now_ts
    _ping_cache["payload"] = payload
    return payload


# ── Public status (sanitized — no secrets) ────────────────────────────────────
def _uptime_in_window(rows: list[dict], since_iso: str) -> float | None:
    """Percent of 'up' checks within a time window (None when no data)."""
    sel = [r for r in rows if r.get("checked_at") and r["checked_at"] >= since_iso]
    if not sel:
        return None
    up = sum(1 for r in sel if r.get("status") == "up")
    return round(up / len(sel) * 100, 1)


def _incidents_for(label: str, rows: list[dict]) -> list[dict]:
    """Turn consecutive-down runs into incidents. rows are newest-first."""
    inc = []
    i = 0
    n = len(rows)
    while i < n:
        if rows[i].get("status") != "down":
            i += 1
            continue
        j = i
        while j < n and rows[j].get("status") == "down":
            j += 1
        newest = rows[i].get("checked_at")   # most recent check in the run
        oldest = rows[j - 1].get("checked_at")  # first check of the run
        duration_s = 0
        if newest and oldest:
            duration_s = max(0, int((datetime.fromisoformat(newest) - datetime.fromisoformat(oldest)).total_seconds()))
        inc.append({
            "label": label,
            "start": oldest,
            "end": newest,
            "duration_s": duration_s,
            "ongoing": i == 0,  # the very latest check is still down
        })
        i = j
    return inc


@router.get("/api/monitor/status")
async def public_status():
    """Aggregated uptime + last-check per service (core + admin custom monitors)
    for the public /status page, plus recent incident history."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=30)).isoformat()
    out = []
    incidents: list[dict] = []
    try:
        services = [{"name": s["name"], "label": s["label"], "custom": False, "type": ""} for s in SERVICES]
        for m in _get_custom_monitors(enabled_only=True):
            services.append({
                "name": f"custom:{m.get('id')}",
                "label": m.get("name") or m.get("type", "monitor"),
                "custom": True,
                "type": m.get("type") or "website",
            })

        for svc in services:
            res = supabase.table("uptime_checks").select("status,latency_ms,detail,checked_at") \
                .eq("service", svc["name"]).gte("checked_at", cutoff) \
                .order("checked_at", desc=True).limit(1000).execute()
            rows = res.data or []
            if not rows:
                out.append({**svc, "status": "unknown", "uptime_24h": None,
                            "uptime_7d": None, "uptime_30d": None, "latency_avg_ms": None,
                            "last_checked": None, "detail": None})
                continue
            last = rows[0]
            up_rows = [r for r in rows if r.get("status") == "up"]
            lat_avg = round(sum(r.get("latency_ms") or 0 for r in up_rows) / len(up_rows)) if up_rows else None
            out.append({
                **svc,
                "status": last.get("status", "unknown"),
                "latency_ms": last.get("latency_ms"),
                "detail": last.get("detail"),
                "last_checked": last.get("checked_at"),
                "uptime_24h": _uptime_in_window(rows, (now - timedelta(hours=24)).isoformat()),
                "uptime_7d": _uptime_in_window(rows, (now - timedelta(days=7)).isoformat()),
                "uptime_30d": _uptime_in_window(rows, cutoff),
                "latency_avg_ms": lat_avg,
            })
            incidents.extend(_incidents_for(svc["label"], rows))
    except Exception as e:
        logger.error("monitor: public_status failed: %s", e)
        return {"overall": "degraded", "services": [], "incidents": []}

    incidents.sort(key=lambda x: x.get("start") or "", reverse=True)
    overall = "operational" if all(s["status"] == "up" for s in out) else \
              ("degraded" if any(s["status"] == "up" for s in out) else "outage")
    return {
        "overall": overall,
        "generated_at": now.isoformat(),
        "services": out,
        "incidents": incidents[:12],
    }


# ── Staff: history ────────────────────────────────────────────────────────────
@router.get("/api/monitor/checks")
async def staff_checks(user: dict = Depends(require_staff), limit: int = Query(50, ge=1, le=100)):
    try:
        res = supabase.table("uptime_checks").select("*") \
            .order("checked_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.error("monitor: staff_checks failed: %s", e)
        raise HTTPException(500, "Could not read monitor history")


# ── Error capture (Sentry-like) ────────────────────────────────────────────────
# Throttle alert emails globally so a flood of distinct signatures/sources (e.g.
# a scraper hitting the public /api/monitor/errors ingest, which lets the client
# set `source`) can't spam staff — each new signature still gets recorded, but
# at most one alert email per window goes out.
_ALERT_COOLDOWN_SECONDS = 600   # at most one alert email / 10 min
_last_error_alert_ts: float = 0.0

def _error_signature(error_type: str, message: str, endpoint: str) -> str:
    return f"{error_type or 'Unknown'}:{str(message)[:120]}:{endpoint or ''}"


def _error_recipients() -> list[str]:
    """Alert recipients — same as uptime alerts (monitor settings)."""
    return _alert_emails()


async def _record_error(source: str, error_type: str, message: str, stack: str = "",
                        endpoint: str = "", ip: str = "", user_agent: str = "", url: str = "") -> dict:
    """Record an error, dedup + alert if it's new (or wasn't alerted in the last
    ALERT_COOLDOWN_SECONDS window). Returns the saved row."""
    sig = _error_signature(error_type, message, endpoint)
    now = datetime.now(timezone.utc).isoformat()
    try:
        res = supabase.table("error_logs").select("id,count,last_seen,notified") \
            .eq("signature", sig).limit(1).execute()
        if res.data:
            row = res.data[0]
            # Update last_seen + count
            supabase.table("error_logs").update({
                "count": (row.get("count") or 0) + 1,
                "last_seen": now,
                # Keep the TAIL: Python tracebacks put the fault frame last,
                # and head-truncation is what hid the Sep-2026 VPN fault line.
                "stack": (stack or "")[-8000:],
            }).eq("id", row["id"]).execute()
            return {**row, "is_new": False}
        # New error — insert + alert
        row = {
            "source": source, "error_type": error_type, "message": str(message)[:1000],
            "stack": (stack or "")[-8000:], "endpoint": endpoint or "", "ip": ip or "",
            "user_agent": user_agent or "", "url": url or "", "signature": sig,
            "first_seen": now, "last_seen": now, "count": 1, "notified": False,
        }
        ins = supabase.table("error_logs").insert(row).execute()
        saved = ins.data[0] if ins.data else row
        # Global email cooldown — still record every error, but never email
        # more often than once per window regardless of source/signature.
        global _last_error_alert_ts
        now_ts = time.monotonic()
        if now_ts - _last_error_alert_ts >= _ALERT_COOLDOWN_SECONDS:
            _last_error_alert_ts = now_ts
            await _send_error_alert(saved)
        return {**saved, "is_new": True}
    except Exception as e:
        logger.error("monitor: failed to record error: %s", e)
        return {"error": str(e)}


async def _send_error_alert(row: dict):
    recipients = _error_recipients()
    if not recipients:
        logger.debug("monitor: error captured but no alert emails configured")
        return
    from utils.email_queue import queue_email
    subject, html = await asyncio.to_thread(
        lambda: __import__("utils.email", fromlist=["render_template"]).render_template(
            "error_alert",
            {"error_type": row.get("error_type") or "Error", "message": row.get("message", ""),
             "endpoint": row.get("endpoint") or "", "source": row.get("source") or "backend",
             "first_seen": row.get("first_seen") or _now(), "site_name": "aifazi.net"},
        )
    )
    for to in recipients:
        await queue_email(to=to, subject=subject, html=html, text="", purpose="error_alert")
    try:
        supabase.table("error_logs").update({"notified": True}).eq("id", row["id"]).execute()
    except Exception as e:
        logger.warning("monitor: marking error notified failed: %s", e)


# Public ingestion — frontend ErrorBoundary + window error/rejection handlers POST here.
# Rate-limited by the global limiter. Keep it lightweight; no sensitive data.
# `source` is allowlisted so scrapers can't invent sources to pollute triage.
_ERROR_SOURCES = {"frontend", "backend", "mobile"}


@router.post("/api/monitor/errors")
async def ingest_error(body: dict, request: Request):
    source = str(body.get("source", "frontend"))[:20]
    if source not in _ERROR_SOURCES:
        raise HTTPException(400, "Unknown error source")
    error_type = str(body.get("error_type", "Error"))[:100]
    message = str(body.get("message", "Unknown error"))[:1000]
    if not message.strip():
        raise HTTPException(400, "Empty error message")
    stack = str(body.get("stack", ""))[-8000:]
    endpoint = str(body.get("endpoint", ""))[:200]
    url = str(body.get("url", ""))[:500]
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")[:300]
    await _record_error(source=source, error_type=error_type, message=message,
                        stack=stack, endpoint=endpoint, ip=ip, user_agent=ua, url=url)
    return {"ok": True}


# Staff: recent errors
@router.get("/api/monitor/errors")
async def staff_errors(user: dict = Depends(require_staff), limit: int = Query(50, ge=1, le=100)):
    try:
        res = supabase.table("error_logs").select("*") \
            .order("last_seen", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.error("monitor: staff_errors failed: %s", e)
        raise HTTPException(500, "Could not read error logs")


async def _send_error_digest() -> bool:
    """Email a summary of errors seen in the last 24h (Sentry-style digest)."""
    recipients = _error_recipients()
    if not recipients:
        return False
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        res = supabase.table("error_logs").select("error_type,message,count,source,endpoint,last_seen") \
            .gte("last_seen", cutoff).order("last_seen", desc=True).limit(50).execute()
        rows = res.data or []
        if not rows:
            return False
        from utils.email_queue import queue_email
        lines = "".join(
            f'<div style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px;margin:6px 0;font-size:12px;color:#e5e7eb;">'
            f'<span style="color:#ff4757;font-weight:700;">{_html(r.get("error_type") or "Error")}</span>'
            f' — <span>{_html(str(r.get("message",""))[:140])}</span>'
            f'<div style="color:#8b949e;font-size:11px;margin-top:4px;">'
            f'{_html(r.get("source") or "")} · {_html(r.get("endpoint") or "")} · ×{r.get("count",1)} · {_html(r.get("last_seen") or "")}</div>'
            f'</div>'
            for r in rows
        )
        subject, html = await asyncio.to_thread(
            lambda: __import__("utils.email", fromlist=["render_template"]).render_template(
                "error_digest",
                {"error_count": len(rows), "errors_html": lines, "site_name": "aifazi.net"},
            )
        )
        for to in recipients:
            await queue_email(to=to, subject=subject, html=html, text="", purpose="error_digest")
        return True
    except Exception as e:
        logger.error("monitor: error digest failed: %s", e)
        return False


def _html(s) -> str:
    import html as _h
    return _h.escape(str(s or ""))


# ── Staff: run now ────────────────────────────────────────────────────────────
# NOTE: rate-limit follow-up — main.py should cap POST /api/monitor/run at
# ~5/min per staff account; a full check sweep fans out to every service.
@router.post("/api/monitor/run")
async def staff_run(request: Request, user: dict = Depends(MONITOR_MANAGE)):
    results = await _run_all_checks()
    _audit(_actor(user), "monitor_run", target="monitor", ip=_ip(request))
    return {"ran_at": _now(), "results": results}


# ── Staff: monitor settings (stored in site_config.settings.monitor) ──────────
@router.get("/api/monitor/settings")
async def staff_get_settings(user: dict = Depends(require_staff)):
    cfg = _get_monitor_settings()
    return {
        "alert_emails": cfg.get("alert_emails", DEFAULT_ALERT_EMAILS),
        "alert_threshold": cfg.get("alert_threshold", DEFAULT_ALERT_THRESHOLD),
        "enabled_services": _enabled_services(),
        "available_services": SERVICES,
    }


@router.put("/api/monitor/settings")
async def staff_update_settings(body: dict, request: Request, user: dict = Depends(MONITOR_MANAGE)):
    # Validate + sanitize
    emails = str(body.get("alert_emails", "") or "")
    bad = [e.strip() for e in emails.replace(";", ",").split(",") if e.strip() and not _email_ok(e.strip())]
    if bad:
        # Warn, don't fail — save the settings so alerts keep flowing to the
        # valid addresses while the typo is fixed.
        logger.warning("monitor: saving settings with suspicious alert email(s): %s", bad)
    try:
        threshold = max(1, int(body.get("alert_threshold", DEFAULT_ALERT_THRESHOLD)))
    except (TypeError, ValueError):
        threshold = DEFAULT_ALERT_THRESHOLD
    enabled = body.get("enabled_services")
    valid = {s["name"] for s in SERVICES}
    if not isinstance(enabled, list):
        enabled = [s["name"] for s in SERVICES]
    enabled = [n for n in enabled if n in valid]

    monitor_cfg = {
        "alert_emails": emails,
        "alert_threshold": threshold,
        "enabled_services": enabled,
    }
    try:
        res = supabase.table("site_config").select("settings").eq("key", "global").limit(1).execute()
        if not res.data:
            supabase.table("site_config").insert({"key": "global", "settings": {"monitor": monitor_cfg}}).execute()
        else:
            existing = res.data[0].get("settings") or {}
            existing["monitor"] = monitor_cfg
            supabase.table("site_config").update({"settings": existing}).eq("key", "global").execute()
    except Exception as e:
        logger.error("monitor: save settings failed: %s", e)
        raise HTTPException(500, "Could not save monitor settings")
    _audit(_actor(user), "monitor_settings_update", target="monitor",
           details={"alert_threshold": monitor_cfg["alert_threshold"],
                    "enabled_services": monitor_cfg["enabled_services"]}, ip=_ip(request))
    return monitor_cfg


# ── Custom monitors CRUD (admin-configured) ───────────────────────────────────
ALLOWED_TYPES = ("website", "keyword", "ping", "port", "cron", "dns")


class MonitorBody(BaseModel):
    name: str
    type: str
    target: str
    port: int | None = None
    expected: str = ""
    mode: str = "contains"
    interval_seconds: int = 60
    enabled: bool = True


def _clean_monitor(body: MonitorBody) -> dict:
    if not body.name.strip():
        raise HTTPException(400, "Monitor name is required")
    if body.type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Invalid monitor type: {body.type}")
    if not body.target.strip():
        raise HTTPException(400, "Target is required")
    mode = body.mode if body.mode in ("contains", "not_contains") else "contains"
    # Minimum 60s interval — sub-minute custom monitors turn the cron sweep
    # into a self-inflicted DoS against the checked targets.
    interval = max(60, int(body.interval_seconds or 60))
    return {
        "name": body.name.strip()[:80],
        "type": body.type,
        "target": body.target.strip()[:300],
        "port": body.port if body.type == "port" else None,
        "expected": (body.expected or "").strip()[:300],
        "mode": mode,
        "interval_seconds": interval,
        "enabled": bool(body.enabled),
        "updated_at": _now(),
    }


@router.get("/api/monitor/checks/config")
async def list_custom_monitors(user: dict = Depends(require_staff)):
    monitors = _get_custom_monitors(enabled_only=False)
    # Attach the latest result (service = custom:<id>) for each monitor
    out = []
    for m in monitors:
        latest = None
        try:
            res = supabase.table("uptime_checks").select("status,latency_ms,detail,checked_at") \
                .eq("service", f"custom:{m['id']}").order("checked_at", desc=True).limit(1).execute()
            if res.data:
                latest = res.data[0]
        except Exception as e:
            logger.debug("monitor: latest-result lookup failed: %s", e)
        out.append({**m, "latest": latest})
    return out


@router.post("/api/monitor/checks/config")
async def create_custom_monitor(body: MonitorBody, request: Request, user: dict = Depends(MONITOR_MANAGE)):
    row = _clean_monitor(body)
    row["created_at"] = _now()
    try:
        res = supabase.table("monitor_checks").insert(row).execute()
        _audit(_actor(user), "monitor_create", target="monitor_checks",
               details={"name": row.get("name"), "type": row.get("type")}, ip=_ip(request))
        return res.data[0] if res.data else row
    except Exception as e:
        logger.error("monitor: create custom monitor failed: %s", e)
        raise HTTPException(500, "Could not create monitor")


@router.put("/api/monitor/checks/config/{monitor_id}")
async def update_custom_monitor(monitor_id: str, body: MonitorBody, request: Request, user: dict = Depends(MONITOR_MANAGE)):
    row = _clean_monitor(body)
    try:
        res = supabase.table("monitor_checks").update(row).eq("id", monitor_id).execute()
        if not res.data:
            raise HTTPException(404, "Monitor not found")
        _audit(_actor(user), "monitor_update", target=f"monitor_checks:{monitor_id}", ip=_ip(request))
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("monitor: update custom monitor failed: %s", e)
        raise HTTPException(500, "Could not update monitor")


@router.delete("/api/monitor/checks/config/{monitor_id}")
async def delete_custom_monitor(monitor_id: str, request: Request, user: dict = Depends(MONITOR_MANAGE)):
    try:
        supabase.table("monitor_checks").delete().eq("id", monitor_id).execute()
        supabase.table("uptime_checks").delete().eq("service", f"custom:{monitor_id}").execute()
        _audit(_actor(user), "monitor_delete", target=f"monitor_checks:{monitor_id}", ip=_ip(request))
        return {"ok": True}
    except Exception as e:
        logger.error("monitor: delete custom monitor failed: %s", e)
        raise HTTPException(500, "Could not delete monitor")


@router.post("/api/monitor/checks/{monitor_id}/run")
async def run_custom_monitor(monitor_id: str, user: dict = Depends(MONITOR_MANAGE)):
    """Run a single monitor now and return its result (no history write)."""
    try:
        res = supabase.table("monitor_checks").select("*").eq("id", monitor_id).limit(1).execute()
    except Exception as e:
        logger.error("monitor: read custom monitor failed: %s", e)
        raise HTTPException(500, "Could not read monitor")
    if not res.data:
        raise HTTPException(404, "Monitor not found")
    m = res.data[0]
    checker = CUSTOM_CHECKERS.get(str(m.get("type") or ""))
    if not checker:
        raise HTTPException(400, "Unsupported monitor type")
    ok, lat, detail = await checker(m)  # type: ignore[call-arg]
    return {"ok": ok, "status": "up" if ok else "down", "latency_ms": lat, "detail": str(detail)[:200]}


# ── Deploy-train visibility (Coolify webhook receiver) ────────────────────────
# Coolify webhook setup (configure per service in Coolify → service → Webhooks):
#   URL:    https://api.aifazi.net/api/admin/deploy/event
#   Header: x-deploy-secret: <DEPLOY_WEBHOOK_SECRET env value>
#   Body:   {"service": "<name>", "commit": "<sha>", "status": "success|failed|...\"",
#            "url": "<coolify deployment url>", "at": "<iso timestamp>"}
# Rollback is out of scope here — use the Coolify deployment_url from the event.
# No new DB tables: the last 50 events live in a process-local deque (lost on
# restart) and every event is also persisted as an audit_logs row (details JSONB).
_DEPLOY_EVENTS: deque = deque(maxlen=50)


class DeployEventBody(BaseModel):
    service: str = ""
    commit: str = ""
    status: str = ""
    url: str = ""
    at: str = ""


@router.post("/api/admin/deploy/event")
async def deploy_event(request: Request, body: DeployEventBody):
    """Unauthenticated webhook receiver — auth is the shared secret header."""
    secret = os.getenv("DEPLOY_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "DEPLOY_WEBHOOK_SECRET is not configured")
    given = request.headers.get("x-deploy-secret", "")
    if not given or not hmac.compare_digest(given, secret):
        raise HTTPException(403, "Invalid deploy secret")
    service = (body.service or "").strip()[:80]
    if not service:
        raise HTTPException(422, "service is required")
    evt = {
        "service": service,
        "commit": (body.commit or "").strip()[:80],
        "status": (body.status or "").strip()[:30] or "unknown",
        "url": (body.url or "").strip()[:500],
        "at": (body.at or "").strip()[:40] or _now(),
    }
    _DEPLOY_EVENTS.appendleft(evt)
    _audit("deploy", "deploy_event", target=service, details=evt, ip=_ip(request))
    return {"ok": True}


@router.get("/api/admin/deploy/status")
async def deploy_status(user: dict = Depends(require_admin)):
    """Recent deploy events (newest first) + latest event per service."""
    events = list(_DEPLOY_EVENTS)
    latest: dict[str, dict] = {}
    for e in events:
        latest.setdefault(e.get("service") or "unknown", e)
    return {"events": events, "services": latest}
