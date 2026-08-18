"""
routers/chat_url_preview.py — Link (URL) unfurl for chat messages.

Given a URL pasted in chat, returns title/description/image + domain so the
mobile and web clients can render a rich card. Uses only the public OpenGraph /
<meta> tags of the target page — no body-text scraping. Parsing uses only the
stdlib HTMLParser, so no extra runtime dependency is introduced.

Security: the fetch is SSRF-hardened. The host is resolved ONCE, every result
IP is validated as global, and httpx connects to that PINNED IP (reusing
seo_proxy's _validate_resolved_host) — the client is never allowed to
re-resolve, which closes the classic DNS-rebinding TOCTOU. Every redirect hop
is re-validated and re-pinned too. Only http/https allowed; capped response;
hard timeout.
"""
import asyncio
import os
import re
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query

from routers.seo_proxy import _validate_resolved_host
from utils.link_safety import check_link_safety

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

MAX_REDIRECTS = 5


async def _pinned_stream(client: httpx.AsyncClient, url: str, *, hostname: str, pinned_ip: str) -> tuple[int, httpx.Headers, bytes]:
    """GET url (pinned IP, as _pinned_get) but STREAM the body, reading at most
    MAX_RESPONSE_BYTES. `response.content` would buffer the whole payload first,
    so a malicious multi-GB link could exhaust memory despite the later slice;
    streaming bounds memory to MAX_RESPONSE_BYTES regardless of what the server
    sends. Redirect responses are returned with an empty body."""
    parsed = urlparse(url)
    netloc = pinned_ip if ":" not in pinned_ip else f"[{pinned_ip}]"  # bracket IPv6
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    pinned_url = parsed._replace(netloc=netloc).geturl()
    headers = {
        "User-Agent": f"Mozilla/5.0 ({os.getenv('SITE_NAME', 'aifazi.net')} link previews; +{os.getenv('FRONTEND_URL', 'https://aifazi.net')}) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Host": hostname,
    }
    async with client.stream("GET", pinned_url, headers=headers) as resp:
        if resp.status_code in (301, 302, 303, 307, 308):
            return resp.status_code, resp.headers, b""
        body = b""
        async for chunk in resp.aiter_bytes():
            if not chunk:
                continue
            if len(body) + len(chunk) > MAX_RESPONSE_BYTES:
                body += chunk[: MAX_RESPONSE_BYTES - len(body)]
                break
            body += chunk
        return resp.status_code, resp.headers, body


# ── route ─────────────────────────────────────────────────────────────────────

@router.get("/link-preview")
async def link_preview(url: str = Query(..., min_length=8, max_length=2048)):
    """Unfurl a URL into {title, description, image, site}. SSRF-guarded."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "Only http/https URLs supported")
    host = parsed.hostname or ""
    if not host:
        raise HTTPException(400, "Address not allowed")

    now = time.time()
    async with _lock:
        entry = _preview_cache.get(url)
        if entry and now - entry[0] < _PREVIEW_TTL:
            return entry[1]

    try:
        pinned_ip = await asyncio.to_thread(_validate_resolved_host, host)
    except HTTPException as exc:
        # Keep the route's public contract: any unsafe resolution → 400.
        raise HTTPException(400, exc.detail)

    async def _pin(next_host: str) -> str:
        try:
            return await asyncio.to_thread(_validate_resolved_host, next_host)
        except HTTPException as exc:
            raise HTTPException(400, exc.detail)

    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, verify=True) as client:
            final_status = 0
            final_body = b""
            current_url, current_host, current_ip = url, host, pinned_ip
            for _ in range(MAX_REDIRECTS):
                final_status, _final_headers, final_body = await _pinned_stream(
                    client, current_url, hostname=current_host, pinned_ip=current_ip
                )
                if final_status not in (301, 302, 303, 307, 308):
                    break
                location = _final_headers.get("location", "")
                if not location:
                    break
                next_url = urljoin(current_url, location)
                next_parsed = urlparse(next_url)
                if next_parsed.scheme not in ("http", "https"):
                    raise HTTPException(400, "Only http/https URLs supported")
                next_host = next_parsed.hostname or ""
                if not next_host:
                    raise HTTPException(400, "Address not allowed")
                current_url, current_host = next_url, next_host
                current_ip = await _pin(next_host)
            else:
                raise HTTPException(422, "Too many redirects")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "Could not fetch URL")
    if final_status == 0 or final_status >= 400:
        raise HTTPException(422, f"Could not fetch URL — status {final_status}")

    raw = final_body or b""
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        text = ""

    data = _extract_meta(text, url)
    data["safety"] = await check_link_safety(url)
    async with _lock:
        _preview_cache[url] = (time.time(), data)
    return data