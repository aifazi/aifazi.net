"""Streaming request-body size cap (B7).

SecurityMiddleware rejects oversized bodies on the declared Content-Length
before FastAPI buffers them; this middleware bounds bodies that stream
without a declared length (chunked transfer-encoding), which would otherwise
be readable into RAM up to the proxy's edge limit. Multipart uses a higher
cap because the file tools accept up to 50MB uploads.
"""
from __future__ import annotations

MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
MAX_UPLOAD_BODY_BYTES = 55 * 1024 * 1024


class BodyTooLarge(Exception):
    """Raised from the guarded receive channel when a body exceeds its cap."""


class BodySizeLimitMiddleware:
    """Wrap the ASGI receive channel for chunked POST/PUT/PATCH bodies.

    Counts actual bytes as they stream and aborts (BodyTooLarge → 413 via the
    app's exception handler) the moment the cap is crossed. Requests with a
    Content-Length are left alone — that path is already bounded by the
    declared-length check in SecurityMiddleware, and h11 enforces the length.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] == "http"
            and scope["method"] in ("POST", "PUT", "PATCH")
            and not any(k == b"content-length" for k, _ in scope.get("headers", []))
        ):
            headers = {
                k.decode("latin-1").lower(): v.decode("latin-1")
                for k, v in scope.get("headers", [])
            }
            limit = (
                MAX_UPLOAD_BODY_BYTES
                if headers.get("content-type", "").startswith("multipart/")
                else MAX_JSON_BODY_BYTES
            )
            received = 0
            orig_receive = receive

            async def limited_receive():
                nonlocal received
                message = await orig_receive()
                if message["type"] == "http.request":
                    received += len(message.get("body") or b"")
                    if received > limit:
                        raise BodyTooLarge()
                return message

            receive = limited_receive
        await self.app(scope, receive, send)
