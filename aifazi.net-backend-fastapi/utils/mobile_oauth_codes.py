"""
utils/mobile_oauth_codes.py — One-time exchange codes for mobile OAuth deep links (H2 / C6).

Closes the H2 security item: mobile OAuth completion redirects no longer carry
access/refresh PASETO tokens in the URL fragment (where OS-level intent logs,
history, and proxy logs can capture them). They carry a one-time exchange code:

    aifazi:///oauth/callback/<provider>#code=<CODE>&dest=<DEST>[&state=<APP_STATE>]

Properties:
- The code is a PASETO v4 local token (auth purpose) with a 5-minute TTL that
  carries the authenticated user's identity, the provider that minted it, and
  the post-login destination. It cannot be used directly against any API.
  It is recognised by the `token_type: "mobile_oauth_code"` claim (NOT a
  `purpose` claim — `paseto_token.create_token` clobbers payload `purpose`
  with the PASETO purpose, the same reason access/refresh tokens use
  `token_type`).
- Single-use: the code's SHA-256 hash is stored in the `mobile_oauth_claims`
  table and the exchange atomically marks the claim consumed
  (update ... where consumed_at IS NULL), so only the FIRST exchange ever
  succeeds. An intercepted deep link is useless once the app has exchanged.
- Fail closed: if the claims table is missing or the DB is unavailable,
  issuing fails and the OAuth callback redirects with its usual
  `*_error=db` param instead of falling back to a token-in-fragment redirect.

Operator migration (paste into the Supabase SQL editor — same pattern as the
audit/email_settings tables; the backend never runs raw SQL outside the
admin-gated DB console):

    CREATE TABLE IF NOT EXISTS mobile_oauth_claims (
        code_hash   TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        provider    TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        consumed_at TIMESTAMPTZ
    );

Rows expire with their code (5-minute TTL in the PASETO payload); consumed or
expired rows can be purged lazily (DELETE WHERE consumed_at IS NOT NULL AND
created_at < now() - interval '1 day').
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from urllib.parse import quote

from database import supabase
from paseto_token import create_token as _paseto_create_token
from paseto_token import decode_token as _paseto_decode_token

log = logging.getLogger("mobile_oauth_codes")

CLAIMS_TABLE = "mobile_oauth_claims"
CODE_TTL_SECONDS = 5 * 60
CODE_TOKEN_TYPE = "mobile_oauth_code"
MAX_CODE_LEN = 4096


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def code_hash(code: str) -> str:
    """SHA-256 of the code — the claims table stores only the hash, never the code."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def issue_code(provider: str, user_id: str, username: str, role: str, dest: str,
               kind: str = "forum") -> str:
    """Mint a one-time code and record its claim row.

    Raises on any failure (PASETO_SECRET missing, claim insert failed) so the
    caller can fail closed with an error redirect instead of issuing a token
    in the URL.
    """
    payload = {
        "token_type": CODE_TOKEN_TYPE,
        "kind": kind,
        "provider": provider,
        "user_id": str(user_id),
        "username": str(username),
        "role": str(role),
        "dest": str(dest),
        "jti": secrets.token_hex(16),
    }
    code = _paseto_create_token(payload, expires_in=CODE_TTL_SECONDS, purpose="auth")
    supabase.table(CLAIMS_TABLE).insert({
        "code_hash": code_hash(code),
        "user_id": str(user_id),
        "provider": provider,
    }).execute()
    return code


def _consume(code: str) -> bool:
    """Atomically mark the claim consumed. True only for the first caller.

    The `consumed_at IS NULL` guard makes concurrent exchanges race-safe: the
    second updater's WHERE no longer matches, so it returns no rows.
    """
    try:
        res = (
            supabase.table(CLAIMS_TABLE)
            .update({"consumed_at": _now_iso()})
            .eq("code_hash", code_hash(code))
            .is_("consumed_at", "null")
            .select("code_hash")
            .execute()
        )
        return bool(res.data)
    except Exception as exc:
        log.error("mobile_oauth_codes: claim consume failed: %s", exc)
        return False


def exchange_code(code: str | None) -> dict | None:
    """Verify + atomically consume a one-time code. Returns the payload or None.

    Rejects: non-strings, oversized input, bad/expired PASETO, wrong token
    type, missing user claim, unknown codes, and already-consumed codes.
    """
    if not isinstance(code, str) or not code or len(code) > MAX_CODE_LEN:
        return None
    payload = _paseto_decode_token(code, purpose="auth")
    if not payload or payload.get("token_type") != CODE_TOKEN_TYPE:
        return None
    if not payload.get("user_id"):
        return None
    if not _consume(code):
        return None
    return payload


def mobile_fragment(code: str, dest: str, state: str = "") -> str:
    """Build the `#code=...&dest=...` fragment for a mobile deep link.

    `state` (the app-issued OAuth state, echoed back through the signed
    backend state) is appended last so the app's strict one-time-state check
    can verify the redirect belongs to its own flow. Never contains a token.
    """
    parts = [
        "code=" + quote(str(code), safe=""),
        "dest=" + quote(str(dest), safe="/"),
    ]
    state = str(state or "")
    if state:
        parts.append("state=" + quote(state, safe=""))
    return "#" + "&".join(parts)


def state_echo(extra: object | None) -> str:
    """`&state=<v>` fragment piece for the app-supplied OAuth state, or ''."""
    extra_dict = extra if isinstance(extra, dict) else {}
    state = str(extra_dict.get("state") or "")
    if not state:
        return ""
    return "&state=" + quote(state, safe="")
