"""routers/stalwart_admin.py — Stalwart queue inspector (admin-only JMAP proxy).

Mounted at /api/admin/mail/stalwart in main.py:
    GET  /queue          → list queued messages [{queueId, from, to, nextRetry, expires}]
    POST /queue/action   → {queueId, action: retry|drop, confirm} (drop needs confirm:true)

Proxies Stalwart's JMAP management methods over HTTP with Basic auth:
    STALWART_URL            (default http://stalwart:8080 — internal Docker host)
    STALWART_JMAP_URL       (default <STALWART_URL>/jmap — override if yours differs)
    STALWART_ADMIN_USER     (default admin)
    STALWART_ADMIN_PASSWORD (required — fail-closed 503 when unset)

The exact JMAP queue method names vary across Stalwart versions, so every call
is defensive: unknown methods / unreachable hosts surface as clear 502/503
messages (frontend shows a "Stalwart unreachable" state, never a crash), and
per-message actions always return per-action {ok, error} instead of 500ing.
No new deps (httpx), no new DB tables, all mutations audited.
"""
import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from dependencies import require_admin
from utils.audit import record as _audit

router = APIRouter()
logger = logging.getLogger("stalwart_admin")


def _creds() -> tuple[str, str, str]:
    """Return (jmap_url, user, password) or raise 503 when not configured."""
    password = os.getenv("STALWART_ADMIN_PASSWORD", "")
    if not password:
        raise HTTPException(
            503,
            "STALWART_ADMIN_PASSWORD is not configured — "
            "set it to enable the Stalwart queue inspector",
        )
    base = os.getenv("STALWART_URL", "http://stalwart:8080").rstrip("/")
    jmap_url = os.getenv("STALWART_JMAP_URL", f"{base}/jmap")
    return jmap_url, os.getenv("STALWART_ADMIN_USER", "admin"), password


async def _jmap(calls: list) -> list:
    """POST JMAP methodCalls, return methodResponses. Raises HTTPException
    (503 unreachable/auth-unset, 502 bad response) with a human message."""
    jmap_url, user, password = _creds()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                jmap_url,
                json={"using": ["urn:ietf:params:jmap:core"], "methodCalls": calls},
                auth=(user, password),
            )
    except httpx.RequestError as e:
        raise HTTPException(503, f"Stalwart unreachable at {jmap_url}: {type(e).__name__}")
    if r.status_code in (401, 403):
        raise HTTPException(502, "Stalwart rejected admin credentials — check STALWART_ADMIN_USER/PASSWORD")
    if r.status_code >= 400:
        raise HTTPException(502, f"Stalwart returned HTTP {r.status_code}")
    try:
        data = r.json()
    except Exception:
        raise HTTPException(502, "Stalwart returned a non-JSON response")
    return data.get("methodResponses") or []


def _jmap_error(responses: list, call_id: str) -> str | None:
    """Return the error type+description for a call id, or None on success."""
    for name, payload, cid in responses:
        if cid != call_id:
            continue
        if name == "error" or name.endswith("/error"):
            return f"{(payload or {}).get('type', 'error')}: {(payload or {}).get('description', '')}".strip()
    return None


def _first_arg(responses: list, call_id: str) -> dict:
    for name, payload, cid in responses:
        if cid == call_id and not (name == "error" or name.endswith("/error")):
            return payload or {}
    return {}


@router.get("/queue")
async def stalwart_queue(user: dict = Depends(require_admin)):
    """List queued messages via x:QueuedMessage/query + x:QueuedMessage/get."""
    q = await _jmap([["x:QueuedMessage/query", {"accountId": "admin", "limit": 50}, "q"]])
    err = _jmap_error(q, "q")
    if err:
        raise HTTPException(502, f"Stalwart queue query failed: {err}")
    ids = _first_arg(q, "q").get("ids") or []
    if not ids:
        return {"queue": []}
    g = await _jmap([["x:QueuedMessage/get", {"accountId": "admin", "ids": ids}, "g"]])
    err = _jmap_error(g, "g")
    if err:
        raise HTTPException(502, f"Stalwart queue fetch failed: {err}")
    items = _first_arg(g, "g").get("list") or []
    out = []
    for m in items:
        if not isinstance(m, dict):
            continue
        to = m.get("to") or m.get("recipients") or m.get("envelopeTo") or []
        if isinstance(to, list):
            to = ", ".join(str(t) for t in to[:5])
        out.append({
            "queueId": str(m.get("id") or m.get("queueId") or ""),
            "from": str(m.get("from") or m.get("sender") or m.get("envelopeFrom") or ""),
            "to": str(to or ""),
            "nextRetry": m.get("nextRetry") or m.get("next_retry") or m.get("retryAt"),
            "expires": m.get("expires") or m.get("expiresAt") or m.get("expiry"),
        })
    return {"queue": [o for o in out if o["queueId"]]}


class QueueActionBody(BaseModel):
    queueId: str = ""
    action: str = ""
    confirm: bool = False


@router.post("/queue/action")
async def stalwart_queue_action(body: QueueActionBody, request: Request, user: dict = Depends(require_admin)):
    """retry = bump nextRetry to now via QueuedMessage/set update;
    drop = QueuedMessage/destroy. Always returns per-action {ok, error}."""
    action = (body.action or "").strip().lower()
    qid = (body.queueId or "").strip()
    actor = str(user.get("username") or "admin")
    ip = request.client.host if request.client else ""

    def _fail(msg: str) -> dict:
        _audit(actor, f"stalwart_queue_{action or 'action'}", target=qid,
               details={"ok": False, "error": msg[:200]}, ip=ip)
        return {"ok": False, "action": action, "queueId": qid, "error": msg}

    if action not in ("retry", "drop"):
        raise HTTPException(400, "action must be retry or drop")
    if not qid:
        raise HTTPException(422, "queueId is required")
    if action == "drop" and not body.confirm:
        raise HTTPException(400, "drop requires confirm:true")
    try:
        now = datetime.now(timezone.utc).isoformat()
        if action == "retry":
            # Documented Stalwart pattern: QueuedMessage/set update nextRetry.
            calls = [["x:QueuedMessage/set",
                      {"accountId": "admin", "update": {qid: {"nextRetry": now}}}, "a"]]
        else:
            calls = [["x:QueuedMessage/destroy", {"accountId": "admin", "ids": [qid]}, "a"]]
        responses = await _jmap(calls)
    except HTTPException as e:
        return _fail(str(e.detail))
    except Exception as e:
        logger.warning("stalwart_queue_action %s %s failed: %s", action, qid, e)
        return _fail(f"{type(e).__name__}: {e}")
    err = _jmap_error(responses, "a")
    if err:
        return _fail(f"Stalwart rejected {action}: {err}")
    _audit(actor, f"stalwart_queue_{action}", target=qid, details={"ok": True}, ip=ip)
    return {"ok": True, "action": action, "queueId": qid}
