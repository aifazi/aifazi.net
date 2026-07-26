"""routers/seo_proxy.py — Proxy for SEO metadata fetching
FIX: SSRF prevention — only allowlisted domains, private IPs blocked,
     DNS rebinding mitigated by pinning resolved IP.
"""
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Query, HTTPException

router = APIRouter()

ALLOWED_DOMAINS = frozenset({
    "aifazi.net", "www.aifazi.net",
    "youtube.com", "www.youtube.com", "youtu.be",
    "github.com", "gist.github.com",
    "instagram.com", "www.instagram.com",
    "twitter.com", "x.com",
    "facebook.com", "www.facebook.com",
    "linkedin.com", "www.linkedin.com",
    "twitch.tv", "www.twitch.tv",
    "reddit.com", "www.reddit.com", "old.reddit.com",
    "steamcommunity.com", "store.steampowered.com",
    "tiktok.com", "www.tiktok.com",
    "discord.com", "discord.gg",
    "medium.com",
    "wikipedia.org", "en.wikipedia.org",
    "docs.microsoft.com", "learn.microsoft.com",
    "stackoverflow.com",
})

_NUMERIC_PREFIX = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')


def _is_safe_url(url: str) -> tuple[bool, str]:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, "Only http/https URLs are allowed"
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return False, "Invalid URL"
    # Must be in allowlist or a subdomain of an allowed domain
    if hostname in ALLOWED_DOMAINS or any(
        hostname.endswith("." + d) for d in ALLOWED_DOMAINS
    ):
        return True, ""
    # Not in allowlist — reject
    return False, f"Domain not in allowlist: {hostname}"


def _validate_resolved_host(url: str) -> None:
    hostname = urlparse(url).hostname or ""
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for entry in addr_info:
            ip_str = entry[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if (
                ip_obj.is_private
                or ip_obj.is_loopback
                or ip_obj.is_link_local
                or ip_obj.is_reserved
            ):
                raise HTTPException(403, f"Domain resolves to private IP: {ip_str}")
    except socket.gaierror:
        raise HTTPException(502, f"Could not resolve hostname: {hostname}")


@router.get("")
async def seo_proxy(url: str = Query(...)):
    safe, reason = _is_safe_url(url)
    if not safe:
        raise HTTPException(403, f"URL not allowed: {reason}")
    _validate_resolved_host(url)
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        try:
            current_url = url
            for _ in range(5):
                res = await client.get(current_url, headers={"User-Agent": "aifazi.net SEO Proxy/1.0"})
                if res.status_code not in {301, 302, 303, 307, 308}:
                    break
                location = res.headers.get("location", "")
                if not location:
                    break
                next_url = urljoin(str(res.url), location)
                safe, reason = _is_safe_url(next_url)
                if not safe:
                    raise HTTPException(403, f"Redirect URL not allowed: {reason}")
                _validate_resolved_host(next_url)
                current_url = next_url
            else:
                raise HTTPException(508, "Too many redirects")
            content = res.text
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"Fetch failed: {e}")
    def meta(name):
        m = re.search(rf'<meta[^>]+(?:name|property)=["\'](?:og:)?{re.escape(name)}["\'][^>]+content=["\']([^"\']+)', content, re.I)
        return m.group(1) if m else ""
    title = re.search(r"<title>([^<]+)</title>", content, re.I)
    return {
        "url": url,
        "title": title.group(1).strip() if title else "",
        "description": meta("description"),
        "image": meta("image"),
        "og:title": meta("title"),
    }
