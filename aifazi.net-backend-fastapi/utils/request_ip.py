"""
utils/request_ip.py — authoritative client-IP extraction.

The backend is served behind Cloudflare → Railway. Forwarding headers from the
client are untrusted:

- `X-Forwarded-For` / `x-vercel-forwarded-for`: attacker-controlled when the
  origin is directly reachable (Railway) — trusting them lets a client rotate
  IPs freely and bypass the login brute-force limiter and ip_bans.
- `CF-Connecting-IP`: set AND stripped/replaced by Cloudflare on every request
  that transits it; a client cannot spoof it through Cloudflare. It is only
  trusted when `CF-Ray` proves the request actually came via Cloudflare.
- `request.client.host`: the socket peer (the Cloudflare/Railway edge). Never
  spoofable, but shared by all clients behind the edge (coarse rate limiting).
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import Request


def client_ip(request: "Request") -> str:
    if request.headers.get("cf-ray"):
        cip = request.headers.get("cf-connecting-ip", "").strip()
        if cip:
            return cip
    host = request.client.host if request.client else ""
    return host or "unknown"
