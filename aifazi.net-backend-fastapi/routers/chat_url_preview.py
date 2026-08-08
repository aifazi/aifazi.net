"""
routers/chat_url_preview.py — Link (URL) unfurl for chat messages.

Given a URL pasted in chat, returns title/description/image + domain so the
mobile and web clients can render a rich card. Uses only the public OpenGraph /
<meta> tags of the target page — no body-text scraping. Parsing uses only the
stdlib HTMLParser, so no extra runtime dependency is introduced.

Security: the fetch is SSRF-hardened (resolves the host up front and rejects
any non-global address; only http/https allowed; capped response; hard timeout).
"""
import re
import socket
import ipaddress
import time
import asyncio
from urllib.parse import urlparse
from html.parser import HTMLParser
from fastapi import APIRouter, HTTPException, Query
import httpx

router = APIRouter()

MAX_RESPONSE_BYTES = 512 * 1024  # a preview only needs the document <head>
FETCH_TIMEOUT = 6.0

_preview_cache: dict[str, tuple[float, dict]] = {}
_PREVIEW_TTL = 900.0  # 15 minutes
_lock = asyncio.Lock()


# ── metadata extraction via stdlib HTMLParser ───────────────────────────────

class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self._in_title = False
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "meta":
            key = d.get("property") or d.get("name")
            val = d.get("content")
            if key and val:
                self.meta[key.strip().lower()] = val.strip()
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def _extract_meta(html: str, url: str) -> dict:
    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception:
        pass
    parsed = urlparse(url)

    def _attr(keys: list[str]) -> str:
        for k in keys:
            v = parser.meta.get(k)
            if v:
                return v
        return ""

    title = _attr(["og:title", "twitter:title"]) or (parser.title or "").strip()
    desc = _attr(["og:description", "twitter:description", "description"]) or ""
    image = _attr(["og:image", "twitter:image"]) or ""
    site = _attr(["og:site_name", "twitter:site"]) or ""

    def _absolute(src: str) -> str:
        src = (src or "").strip()
        if not src:
            return ""
        if src.startswith("//"):
            return f"{parsed.scheme}:{src}"
        if src.startswith("/"):
            return f"{parsed.scheme}://{parsed.netloc}{src}"
        if re.match(r"^[a-z][a-z0-9+.-]*://", src, re.IGNORECASE):
            return src
        return f"{parsed.scheme}://{parsed.netloc}/{src.lstrip('/')}"

    return {
        "title": (title[:200] or parsed.netloc or url[:200]),
        "description": (desc or "")[:400],
        "image": _absolute(image)[:500],
        "site": (site[:120] or parsed.netloc or ""),
        "url": url,
    }


# ── SSRF guards ───────────────────────────────────────────────────────────────

def _is_private_hostname(host: str) -> bool:
    """Reject literal private/loopback/link-local hostnames (e.g. 127.0.0.1)."""
    try:
        addr = ipaddress.ip_address(host)
        return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast
    except ValueError:
        return False


async def _resolve_blocked(host: str) -> bool:
    """Resolve DNS and reject any non-global address (SSRF guard)."""
    try:
        info = await asyncio.get_event_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except Exception:
        return True
    for entry in info:
        ip = entry[4][0]
        try:
            addr = ipaddress.ip_address(ip)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                return True
        except ValueError:
            return True
    return False


# ── route ─────────────────────────────────────────────────────────────────────

@router.get("/link-preview")
async def link_preview(url: str = Query(..., min_length=8, max_length=2048)):
    """Unfurl a URL into {title, description, image, site}. SSRF-guarded."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "Only http/https URLs supported")
    host = parsed.hostname or ""
    if not host or _is_private_hostname(host):
        raise HTTPException(400, "Address not allowed")
    if await _resolve_blocked(host):
        raise HTTPException(400, "Address not allowed")

    now = time.time()
    async with _lock:
        entry = _preview_cache.get(url)
        if entry and now - entry[0] < _PREVIEW_TTL:
            return entry[1]

    headers = {
        "User-Agent": "Mozilla/5.0 (aifazi.net link previews; +https://aifazi.net) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True, headers=headers) as client:
            r = await client.get(url)
    except Exception:
        raise HTTPException(422, "Could not fetch URL")
    if r.status_code >= 400:
        raise HTTPException(422, f"Could not fetch URL — status {r.status_code}")

    raw = (r.content or b"")[:MAX_RESPONSE_BYTES]
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        text = ""

    data = _extract_meta(text, url)
    async with _lock:
        _preview_cache[url] = (time.time(), data)
    return data