"""
utils/link_safety.py — Cloudflare Radar URL Scanner integration.

Checks user-submitted links (forum threads/replies, chat + DM messages, blog
posts/comments, contact messages, chat link previews) against Cloudflare's URL
Scanner verdicts for malicious/phishing/malware content.

Flow:
  check_link_safety(url)  — non-blocking. Serves a verdict from the in-memory
                            cache.py tier or the link_verdicts DB table (the
                            source of truth), else schedules a background Radar
                            scan and returns "unknown" immediately. Never blocks
                            the request on the scanner.
  schedule_scan(text)     — fire-and-forget entry for content creators: extracts
                            http(s) URLs, dedupes by hostname (per-process
                            in-flight set), submits each new host to Radar,
                            polls the result, writes the verdict to
                            link_verdicts and audit-logs malicious findings.

Env (both required to enable; when unset every check reports "disabled"):
  CLOUDFLARE_ACCOUNT_ID       — Cloudflare account id (dashboard right side)
  CLOUDFLARE_RADAR_API_TOKEN  — URL Scanner API token
                                (Account > URL Scanner > Edit permission)
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from database import supabase
from utils import cache

log = logging.getLogger("link_safety")

ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
API_TOKEN = os.getenv("CLOUDFLARE_RADAR_API_TOKEN", "")
_API_BASE = "https://api.cloudflare.com/client/v4/accounts/{account_id}/urlscanner/v2"

_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)

# Hosts Cloudflare's scanner refuses by policy (returns 400) — skip them so we
# never waste submits on domains that are trivially safe / un-scannable.
_SKIP_HOSTS = {
    "github.com", "google.com", "gmail.com", "youtube.com", "facebook.com",
    "instagram.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com",
    "amazon.com", "apple.com", "microsoft.com", "netflix.com", "wikipedia.org",
}

_DB_REFRESH_SECONDS = 7 * 24 * 3600   # re-scan a host once its DB verdict is older than 7d
_INMEM_TTL = 6 * 3600                 # in-memory verdict TTL (cache.py tier)
_RADAR_TIMEOUT = 30.0
_RADAR_POLL_INTERVAL = 10.0
_RADAR_POLLS = 6                      # ~60s of polling before giving up

# Hostnames with a scan currently in flight (per-process dedupe).
_pending: set[str] = set()


# ── helpers ──────────────────────────────────────────────────────────────────

def _configured() -> bool:
    return bool(ACCOUNT_ID and API_TOKEN)


def _hostname(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def extract_urls(text: str) -> list[str]:
    """Return unique http(s) URLs found in text, trailing punctuation stripped."""
    if not text:
        return []
    found: list[str] = []
    for m in _URL_RE.findall(text):
        u = m.rstrip(".,;:!?)\"'")
        if u and (not found or u != found[-1]):
            found.append(u)
    return found


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_fresh(scanned_at) -> bool:
    if not scanned_at:
        return False
    try:
        ts = datetime.fromisoformat(str(scanned_at).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - ts).total_seconds() < _DB_REFRESH_SECONDS
    except Exception:
        return False


def _verdict_public(v: dict) -> dict:
    """Shape returned to callers — always include the source for transparency."""
    return {
        "verdict": v.get("verdict", "unknown"),
        "malicious": v.get("malicious"),
        "categories": v.get("categories") or [],
        "source": v.get("source", "radar"),
    }


# ── persistence (link_verdicts table, source of truth) ───────────────────────

def _lookup_db(hostname: str) -> dict | None:
    if supabase is None:
        return None
    try:
        res = (
            supabase.table("link_verdicts")
            .select("verdict,malicious,categories,scanned_at")
            .eq("hostname", hostname)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as exc:
        log.warning("link_verdicts lookup failed for %s: %s", hostname, exc)
        return None


def _write_db(hostname: str, verdict: dict) -> None:
    if supabase is None:
        return
    try:
        supabase.table("link_verdicts").upsert(
            {
                "hostname": hostname,
                "verdict": verdict.get("verdict", "unknown"),
                "malicious": bool(verdict.get("malicious")),
                "categories": verdict.get("categories") or [],
                "scan_id": verdict.get("scan_id") or "",
                "scanned_at": verdict.get("scanned_at") or _now_iso(),
            },
            on_conflict="hostname",
        ).execute()
    except Exception as exc:
        log.warning("link_verdicts write failed for %s: %s", hostname, exc)


# ── Radar API ─────────────────────────────────────────────────────────────────

def _headers() -> dict:
    return {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


async def _submit_and_poll(url: str) -> dict | None:
    """Submit one URL to Radar and poll until the scan report is ready.
    Returns the report JSON, or None on any non-transient failure."""
    base = _API_BASE.format(account_id=ACCOUNT_ID)
    try:
        async with httpx.AsyncClient(timeout=_RADAR_TIMEOUT) as client:
            try:
                r = await client.post(f"{base}/scan", headers=_headers(), json={"url": url})
            except httpx.HTTPError as exc:
                log.warning("Radar submit failed for %s: %s", url, exc)
                return None
            if r.status_code == 409:
                # Recently scanned — the existing scan is reused; skip for now
                # (the cached/DB verdict will expire and trigger a re-check).
                return None
            if r.status_code not in (200, 201):
                log.warning("Radar submit returned %s for %s", r.status_code, url)
                return None
            scan_id = (r.json() or {}).get("uuid") or ""
            if not scan_id:
                return None

            for _ in range(_RADAR_POLLS):
                await asyncio.sleep(_RADAR_POLL_INTERVAL)
                try:
                    res = await client.get(f"{base}/result/{scan_id}", headers=_headers())
                except httpx.HTTPError as exc:
                    log.warning("Radar poll failed for %s: %s", url, exc)
                    return None
                if res.status_code == 200:
                    return res.json()
                if res.status_code != 404:  # still scanning → 404; anything else is terminal
                    return None
        return None
    except Exception as exc:
        log.warning("Radar scan failed for %s: %s", url, exc)
        return None


def _parse_verdict(data: dict, host: str) -> dict:
    """Extract the malicious verdict + risk categories from a scan report."""
    verdicts = (data or {}).get("verdicts") or {}
    overall = verdicts.get("overall") or {}
    malicious = bool(overall.get("malicious"))

    categories: list[str] = []
    meta = (data or {}).get("meta") or {}
    processors = meta.get("processors") if isinstance(meta, dict) else None
    if isinstance(processors, dict):
        cats = processors.get("categories")
        if isinstance(cats, dict):
            for key in ("security_risk_categories", "malicious", "categories"):
                group = cats.get(key)
                if isinstance(group, list):
                    for item in group:
                        if isinstance(item, dict) and item.get("name"):
                            categories.append(item["name"])
                        elif isinstance(item, str):
                            categories.append(item)

    task = (data or {}).get("task")
    scan_id = task.get("uuid", "") if isinstance(task, dict) else ""
    return {
        "verdict": "malicious" if malicious else "safe",
        "malicious": malicious,
        "categories": categories,
        "scan_id": scan_id,
        "scanned_at": _now_iso(),
    }


# ── public API ───────────────────────────────────────────────────────────────

async def check_link_safety(url: str) -> dict:
    """Non-blocking safety verdict for one URL.

    Priority: in-memory cache (fast tier) → link_verdicts DB (source of truth) →
    schedule a background Radar scan. Never blocks on the scanner itself.
    """
    host = _hostname(url)
    if not host:
        return {"verdict": "unknown", "malicious": None, "categories": [], "source": "invalid"}
    if not _configured():
        return {"verdict": "unknown", "malicious": None, "categories": [], "source": "disabled"}

    cached = cache.get(f"linksafe:{host}")
    if cached is not None:
        return cached

    row = _lookup_db(host)
    if row and _db_fresh(row.get("scanned_at")):
        verdict = _verdict_public(
            {
                "verdict": row.get("verdict", "unknown"),
                "malicious": bool(row.get("malicious")),
                "categories": row.get("categories") or [],
                "source": "db",
            }
        )
        cache.set(f"linksafe:{host}", verdict, ttl=_INMEM_TTL)
        return verdict

    _schedule_host(host)
    return {"verdict": "unknown", "malicious": None, "categories": [], "source": "pending"}


def schedule_scan(text: str) -> None:
    """Extract URLs from user content and scan them in the background.
    Best-effort: never raises, never blocks. Call from async routes only."""
    if not _configured():
        return
    for url in extract_urls(text):
        host = _hostname(url)
        if host:
            _schedule_host(host)


def _schedule_host(host: str) -> None:
    if host in _pending or host in _SKIP_HOSTS:
        return
    _pending.add(host)
    try:
        asyncio.create_task(_scan_hostname(host))
    except RuntimeError as exc:  # no running event loop (e.g. shutdown)
        log.warning("could not schedule Radar scan for %s: %s", host, exc)
        _pending.discard(host)


async def _scan_hostname(host: str) -> None:
    try:
        result = await _submit_and_poll(f"https://{host}/")
        if result is None:
            return
        verdict = _parse_verdict(result, host)
        _write_db(host, verdict)
        cache.set(f"linksafe:{host}", _verdict_public(verdict), ttl=_INMEM_TTL)
        if verdict.get("malicious"):
            _flag(host, verdict)
    except Exception as exc:
        log.warning("Radar scan crashed for %s: %s", host, exc)
    finally:
        _pending.discard(host)


def _flag(host: str, verdict: dict) -> None:
    try:
        from utils.audit import record
        record(
            "system",
            "link_flagged",
            target=host,
            details={
                "verdict": verdict.get("verdict"),
                "categories": verdict.get("categories") or [],
            },
        )
    except Exception as exc:
        log.warning("audit record failed for flagged host %s: %s", host, exc)