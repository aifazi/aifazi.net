"""routers/seo_proxy.py — Proxy for SEO metadata fetching
FIX: SSRF prevention — only allowlisted domains, private IPs blocked,
H20: DNS rebinding actually mitigated by pinning the validated IP into the
     httpx request via a custom transport (the previous getaddrinfo probe was
     non-binding — httpx re-resolved separately, classic TOCTOU). Also drop
     link-local / multicast / unspecified / cloud-metadata 169.254.0.0/16.
"""
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query

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

# H20 — AWS / GCP / Azure cloud metadata IPs must NEVER be fetchable.
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("169.254.0.0/16"),       # link-local + AWS IMDS
    ipaddress.ip_network("0.0.0.0/8"),            # "this host" / unspecified
    ipaddress.ip_network("::/128"),               # IPv6 unspecified
    ipaddress.ip_network("fe80::/10"),           # IPv6 link-local
    ipaddress.ip_network("ff00::/8"),            # IPv6 multicast
    ipaddress.ip_network("fc00::/7"),            # IPv6 ULA
]


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
    return False, f"Domain not in allowlist: {hostname}"


def _validate_resolved_host(hostname: str) -> str:
    """Resolve hostname and validate every returned IP. Returns the first safe
    IP string so the caller can pin it into an httpx request.

    H20 — the previous version discarded the resolved IP and let httpx re-resolve
    independently, leaving a DNS-rebinding TOCTOU window between validation and
    request. Now the caller passes the validated IP to httpx via a Host-header
    rewrite + URL-IP substitution.
    """
    hostname = (hostname or "").lower()
    if not hostname:
        raise HTTPException(400, "Invalid hostname")
    if _NUMERIC_PREFIX.match(hostname):
        raise HTTPException(403, "Direct IP URLs are not allowed")
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise HTTPException(502, f"Could not resolve hostname: {hostname}")
    safe_ip: str | None = None
    for entry in addr_info:
        ip_str = entry[4][0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
            or ip_obj.is_unspecified
            or any(ip_obj in net for net in _BLOCKED_NETWORKS)
        ):
            raise HTTPException(403, f"Domain resolves to blocked IP: {ip_str}")
        if safe_ip is None:
            safe_ip = ip_str  # first safe address wins
    if safe_ip is None:
        raise HTTPException(502, f"Hostname has no usable address: {hostname}")
    return safe_ip


def _pinned_get(client: httpx.AsyncClient, url: str, *, hostname: str, pinned_ip: str) -> httpx.Response:
    """H20 — GET the URL but connect to the PINNED IP instead of re-resolving.
    We substitute the IP into the URL's netloc and rewrite the Host header to
    the original hostname so SNI + virtual host routing still work."""
    parsed = urlparse(url)
    port = parsed.port
    netloc = pinned_ip if not port else f"{pinned_ip}:{port}"
    pinned_url = parsed._replace(netloc=netloc).geturl()
    return client.get(
        pinned_url,
        headers={
            "User-Agent": "aifazi.net SEO Proxy/1.0",
            "Host": hostname,  # restore the original host for SNI / vhost matching
        },
    )


@router.get("")
async def seo_proxy(url: str = Query(...)):
    safe, reason = _is_safe_url(url)
    if not safe:
        raise HTTPException(403, f"URL not allowed: {reason}")
    hostname = urlparse(url).hostname or ""
    pinned_ip = _validate_resolved_host(hostname)
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, verify=True) as client:
        try:
            current_url = url
            current_host = hostname
            current_ip = pinned_ip
            for _ in range(5):
                res = await _pinned_get(client, current_url, hostname=current_host, pinned_ip=current_ip)
                if res.status_code not in {301, 302, 303, 307, 308}:
                    break
                location = res.headers.get("location", "")
                if not location:
                    break
                next_url = urljoin(str(res.url), location)
                safe, reason = _is_safe_url(next_url)
                if not safe:
                    raise HTTPException(403, f"Redirect URL not allowed: {reason}")
                next_host = urlparse(next_url).hostname or ""
                next_ip = _validate_resolved_host(next_host)  # re-pin per redirect
                current_url = next_url
                current_host = next_host
                current_ip = next_ip
            else:
                raise HTTPException(508, "Too many redirects")
            content = res.text
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"Fetch failed: {e}")
    def meta(name):
        m = re.search(rf'<meta[^>]+(?:name|property)=["\'](?:og:)?{re.escape(name)}["\'][^>]+content=["\']([^"\']+)', content, re.IGNORECASE)
        return m.group(1) if m else ""
    title = re.search(r"<title>([^<]+)</title>", content, re.IGNORECASE)
    return {
        "url": url,
        "title": title.group(1).strip() if title else "",
        "description": meta("description"),
        "image": meta("image"),
        "og:title": meta("title"),
    }
