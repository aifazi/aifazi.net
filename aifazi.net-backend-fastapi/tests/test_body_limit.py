"""Tests for utils/body_limit.py (B7 chunked-body streaming guard).

The guard counts actual bytes for bodies without a Content-Length and aborts
at the cap; declared bodies are left to SecurityMiddleware's pre-parse check.
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.body_limit import BodySizeLimitMiddleware, BodyTooLarge


def _stream(method, headers, chunks):
    """Drive the middleware with a body-draining inner app.

    Returns the number of body bytes the inner app received; a cap breach
    propagates as BodyTooLarge from asyncio.run.
    """
    state = {"received": 0}

    async def inner(scope, receive, send):
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            state["received"] += len(message["body"])
            if not message.get("more_body"):
                break

    pending = list(chunks)

    async def receive():
        if pending:
            return {"type": "http.request", "body": pending.pop(0), "more_body": True}
        return {"type": "http.disconnect"}

    async def send(message):
        pass

    scope = {"type": "http", "method": method, "headers": headers}
    asyncio.run(BodySizeLimitMiddleware(inner)(scope, receive, send))
    return state["received"]


_JSON = [(b"content-type", b"application/json")]


def test_chunked_body_under_cap_passes(monkeypatch):
    monkeypatch.setattr("utils.body_limit.MAX_JSON_BODY_BYTES", 64)
    assert _stream("POST", _JSON, [b"a" * 32, b"b" * 31]) == 63


def test_chunked_body_at_exact_cap_passes(monkeypatch):
    monkeypatch.setattr("utils.body_limit.MAX_JSON_BODY_BYTES", 64)
    assert _stream("POST", _JSON, [b"a" * 64]) == 64


def test_chunked_body_over_cap_aborts(monkeypatch):
    monkeypatch.setattr("utils.body_limit.MAX_JSON_BODY_BYTES", 64)
    with pytest.raises(BodyTooLarge):
        _stream("POST", _JSON, [b"a" * 64, b"b"])


def test_cap_crossed_mid_stream_aborts(monkeypatch):
    monkeypatch.setattr("utils.body_limit.MAX_JSON_BODY_BYTES", 64)
    with pytest.raises(BodyTooLarge):
        _stream("POST", _JSON, [b"a" * 32, b"b" * 32, b"c"])


def test_multipart_uses_upload_cap(monkeypatch):
    monkeypatch.setattr("utils.body_limit.MAX_JSON_BODY_BYTES", 16)
    monkeypatch.setattr("utils.body_limit.MAX_UPLOAD_BODY_BYTES", 64)
    multipart = [(b"content-type", b"multipart/form-data; boundary=x")]
    assert _stream("POST", multipart, [b"a" * 64]) == 64
    with pytest.raises(BodyTooLarge):
        _stream("POST", multipart, [b"a" * 64, b"b"])


def test_declared_bodies_left_to_preparse_check(monkeypatch):
    """A Content-Length means h11 bounds the body — the guard must not wrap
    (and must not double-count) those requests."""
    monkeypatch.setattr("utils.body_limit.MAX_JSON_BODY_BYTES", 16)
    declared = _JSON + [(b"content-length", b"100")]
    assert _stream("POST", declared, [b"a" * 100]) == 100


def test_get_requests_untouched():
    assert _stream("GET", [], [b"a" * 10_000]) == 10_000


def test_non_http_scope_untouched():
    async def inner(scope, receive, send):
        pass

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):
        pass

    asyncio.run(BodySizeLimitMiddleware(inner)({"type": "lifespan"}, receive, send))
