"""OAuth state validation to prevent login-CSRF + open-redirect on Discord/Steam OAuth.

Previously the `state` query parameter was just a transport for the `dest` path:
the router issued `state = "<nonce>:<dest>"` but never validated that the nonce
matched anything, so an attacker could drive a victim's browser through an OAuth
completion flow of the attacker's choice (login-CSRF) and the `dest` could redirect
to attacker-controlled URLs (open-redirect).

This module issues a HMAC-SHA256-signed, time-bound state token. The signature is
verified at the callback; any mismatch / expiry fails closed. The signed payload
carries the requested `dest` (already sanitised by `_safe_relative_path`) so the
caller cannot smuggle absolute URLs through.

Secret selection (prefer the dedicated OAUTH_STATE_SECRET, then fall back to the
auth secret since both live server-side and rotate together).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time

log = logging.getLogger("oauth_state")

_OAUTH_STATE_SECRET = (
    os.getenv("OAUTH_STATE_SECRET")
    or os.getenv("PASETO_SECRET")
    or os.getenv("JWT_SECRET", "")
)
_STATE_TTL_S = 600  # 10 minutes — OAuth must round-trip within this window


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _b64u_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _safe_relative_path(value: str | None, default: str = "/profile") -> str:
    """Reject anything that isn't a same-origin relative path starting with '/'."""
    if not value or not isinstance(value, str):
        return default
    # Must start with '/' and NOT start with '//' (protocol-relative)
    if not value.startswith("/") or value.startswith("//"):
        return default
    # No scheme separators, no backslashes (Windows-style phishing)
    if "://" in value or "\\" in value:
        return default
    # Reject control chars / whitespace that some browsers coerce into escapes
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in value):
        return default
    return value


def make_oauth_state(provider: str, dest: str = "/profile", mobile: bool = False) -> str:
    """Issue a signed state token: `<base64url(payload)>.<hex HMAC-SHA256>`.

    `mobile=True` marks the flow as app-driven so the callback redirects back to
    the mobile deep link (`aifazi://...`) instead of the web frontend. It is part
    of the signed payload, so an attacker cannot flip a web flow into a custom
    scheme redirect (that would open an arbitrary-scheme redirect primitive).

    Raises RuntimeError if no signing secret is configured (fail closed at issue time
    so we never send an unsigned state to Discord/Steam).
    """
    if not _OAUTH_STATE_SECRET:
        raise RuntimeError(
            "OAuth state signing requires OAUTH_STATE_SECRET (or PASETO_SECRET/JWT_SECRET fallback). "
            "Configure it in Vercel env vars."
        )
    safe_dest = _safe_relative_path(dest)
    payload = {"p": provider, "d": safe_dest, "t": int(time.time())}
    if mobile:
        payload["m"] = 1
    data = json.dumps(payload, separators=(",", ":"))
    body = _b64u(data.encode("utf-8"))
    sig = hmac.new(_OAUTH_STATE_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_oauth_state_full(state: str | None, provider: str) -> dict:
    """Verify signature + TTL + provider claim. Returns `{"dest": ..., "mobile": bool}`.

    Raises ValueError on any mismatch / expiry so callers can fail closed:
        try:
            payload = verify_oauth_state_full(state, "discord")
            dest, mobile = payload["dest"], payload["mobile"]
        except ValueError:
            return RedirectResponse(f"{front}/login?oauth_error=state")
    """
    if not state or not isinstance(state, str) or "." not in state:
        raise ValueError("malformed state")
    body, _, sig = state.rpartition(".")
    if not body or not sig:
        raise ValueError("malformed state")
    expected = hmac.new(_OAUTH_STATE_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad signature")
    try:
        data = json.loads(_b64u_decode(body).decode("utf-8"))
    except Exception:
        raise ValueError("bad body")
    if data.get("p") != provider:
        raise ValueError("provider mismatch")
    issued_at = int(data.get("t", 0))
    if issued_at <= 0 or int(time.time()) - issued_at > _STATE_TTL_S:
        raise ValueError("expired")
    return {
        "dest": _safe_relative_path(data.get("d", "/profile")),
        "mobile": bool(data.get("m")),
    }


def verify_oauth_state(state: str | None, provider: str) -> str:
    """Verify signature + TTL + provider claim. Returns the validated `dest` path.

    Raises ValueError on any mismatch / expiry so callers can fail closed:
        try:
            dest = verify_oauth_state(state, "discord")
        except ValueError:
            return RedirectResponse(f"{front}/login?oauth_error=state")
    """
    return verify_oauth_state_full(state, provider)["dest"]