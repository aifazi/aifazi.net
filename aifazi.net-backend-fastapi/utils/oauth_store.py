"""
utils/oauth_store.py — Redis-backed OAuth authorization codes + access tokens.

Falls back to in-memory maps when Redis is unavailable (single-process dev).
Keys expire via Redis TTL so a restart does not strand valid codes forever.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

log = logging.getLogger("oauth_store")

_AUTH_CODE_PREFIX = "oauth:code:"
_ACCESS_TOKEN_PREFIX = "oauth:token:"

# Fallback when Redis is down
_mem_codes: dict[str, str] = {}  # key → JSON payload
_mem_tokens: dict[str, str] = {}
_mem_exp: dict[str, float] = {}


def _redis():
    try:
        from utils.rate_limit import _get_redis, _redis_available
        client = _get_redis()
        if client and _redis_available:
            return client
    except Exception as exc:
        log.debug("OAuth store Redis unavailable: %s", exc)
    return None


def _purge_mem() -> None:
    now = time.time()
    for store in (_mem_codes, _mem_tokens):
        dead = [k for k in list(store) if _mem_exp.get(k, 0) < now]
        for k in dead:
            store.pop(k, None)
            _mem_exp.pop(k, None)


def put_auth_code(code: str, payload: dict[str, Any], ttl: int) -> None:
    raw = json.dumps(payload)
    r = _redis()
    if r:
        try:
            r.setex(_AUTH_CODE_PREFIX + code, ttl, raw)
            return
        except Exception as exc:
            log.warning("Redis put_auth_code failed: %s", exc)
    _purge_mem()
    _mem_codes[code] = raw
    _mem_exp[_AUTH_CODE_PREFIX + code] = time.time() + ttl


def pop_auth_code(code: str) -> dict[str, Any] | None:
    """Consume a code (single-use). Returns payload or None."""
    key = _AUTH_CODE_PREFIX + code
    r = _redis()
    if r:
        try:
            raw = r.get(key)
            if raw is not None:
                r.delete(key)
                return json.loads(raw)
            return None
        except Exception as exc:
            log.warning("Redis pop_auth_code failed: %s", exc)
    _purge_mem()
    raw = _mem_codes.pop(code, None)
    _mem_exp.pop(key, None)
    return json.loads(raw) if raw else None


def put_access_token(token: str, payload: dict[str, Any], ttl: int) -> None:
    raw = json.dumps(payload)
    r = _redis()
    if r:
        try:
            r.setex(_ACCESS_TOKEN_PREFIX + token, ttl, raw)
            return
        except Exception as exc:
            log.warning("Redis put_access_token failed: %s", exc)
    _purge_mem()
    _mem_tokens[token] = raw
    _mem_exp[_ACCESS_TOKEN_PREFIX + token] = time.time() + ttl


def get_access_token(token: str) -> dict[str, Any] | None:
    key = _ACCESS_TOKEN_PREFIX + token
    r = _redis()
    if r:
        try:
            raw = r.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            log.warning("Redis get_access_token failed: %s", exc)
    _purge_mem()
    raw = _mem_tokens.get(token)
    if not raw or _mem_exp.get(key, 0) < time.time():
        _mem_tokens.pop(token, None)
        _mem_exp.pop(key, None)
        return None
    return json.loads(raw)


def revoke_access_token(token: str) -> None:
    r = _redis()
    if r:
        try:
            r.delete(_ACCESS_TOKEN_PREFIX + token)
            return
        except Exception as exc:
            log.warning("Redis revoke_access_token failed: %s", exc)
    _mem_tokens.pop(token, None)
    _mem_exp.pop(_ACCESS_TOKEN_PREFIX + token, None)
