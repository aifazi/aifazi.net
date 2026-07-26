"""
txadmin_service.py — Persistent txAdmin session + all API operations.

Auth (from txAdmin source):
  POST /auth/password → body {username, password}
  Response body: {csrfToken: "..."}
  Response header: Set-Cookie: txAdmin-session=...
  Every subsequent request needs BOTH Cookie + x-txadmin-csrftoken header.

Ban endpoints (confirmed from txAdmin source code):
  Online player:    POST /player/ban?mutex=current&netid={SERVER_ID}
                    body: {reason, duration}
  Offline (ids):    POST /history/addLegacyBan
                    body: {identifiers: ["license:xxx"], reason, duration}
  Unban:            POST /history/revokeAction
                    body: {actionId: "abc123"}

Duration string formats: "permanent" | "2 days" | "1 week" | "1 hour" etc.
"""
import os, time, asyncio, httpx, logging

log = logging.getLogger("txadmin")

TXADMIN_URL      = os.getenv("TXADMIN_URL",      "https://txadmin.aifazi.net")
TXADMIN_USERNAME = os.getenv("TXADMIN_USERNAME",  "")
TXADMIN_PASSWORD = os.getenv("TXADMIN_PASSWORD",  "")

# Module-level session (singleton per process)
_cookie:     str | None = None
_csrf:       str | None = None
_expires_at: float      = 0
_lock:       asyncio.Lock | None = None   # created lazily (Vercel cold-start safe)

SESSION_TTL = 82800   # 23 h


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


def _is_valid() -> bool:
    return bool(_cookie and _csrf and time.time() < _expires_at)


async def _login() -> bool:
    global _cookie, _csrf, _expires_at
    if not TXADMIN_USERNAME or not TXADMIN_PASSWORD:
        log.warning("TXADMIN_USERNAME / TXADMIN_PASSWORD not configured")
        return False
    log.info("Logging into txAdmin at %s …", TXADMIN_URL)
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as c:
            r = await c.post(f"{TXADMIN_URL}/auth/password",
                             json={"username": TXADMIN_USERNAME, "password": TXADMIN_PASSWORD},
                             headers={"Content-Type": "application/json"})
    except Exception as e:
        log.error("txAdmin login failed: %s", e); return False

    if r.status_code != 200:
        log.error("txAdmin login HTTP %d: %s", r.status_code, r.text[:200]); return False
    try:
        body = r.json()
    except Exception:
        log.error("txAdmin login: non-JSON response"); return False

    if body.get("error") or body.get("logout"):
        log.error("txAdmin login rejected: %s", body.get("error") or "logout=true"); return False

    csrf = body.get("csrfToken")
    if not csrf:
        log.error("txAdmin login: missing csrfToken"); return False

    raw_cookie = r.headers.get("set-cookie", "")
    cookie_val = raw_cookie.split(";")[0].strip() if raw_cookie else ""
    if not cookie_val:
        for name, val in r.cookies.items():
            cookie_val = f"{name}={val}"; break
    if not cookie_val:
        log.error("txAdmin login: no Set-Cookie header"); return False

    _cookie = cookie_val; _csrf = csrf; _expires_at = time.time() + SESSION_TTL
    log.info("txAdmin session OK (csrf=%s…)", csrf[:8])
    return True


async def _ensure_session() -> bool:
    if _is_valid(): return True
    async with _get_lock():
        if _is_valid(): return True
        return await _login()


async def request(
    method: str, path: str, payload: dict | None = None,
    *, params: dict | None = None, _retry: bool = False,
) -> tuple[bool, dict | None]:
    """Authenticated txAdmin request. Auto-retries once on session expiry."""
    global _cookie, _csrf, _expires_at
    if not await _ensure_session():
        return False, {"error": "txAdmin session unavailable"}

    headers = {
        "Content-Type":        "application/json",
        "Cookie":              _cookie,
        "x-txadmin-csrftoken": _csrf,
    }
    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as c:
        try:
            r = await c.request(method, f"{TXADMIN_URL}{path}",
                                json=payload, params=params, headers=headers)
        except Exception as e:
            log.error("txAdmin %s %s: %s", method, path, e)
            return False, {"error": str(e)}

    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}

    if body.get("logout"):
        _cookie = _csrf = None; _expires_at = 0
        if _retry:
            log.error("txAdmin double-logout on %s — abort", path); return False, body
        log.warning("txAdmin session expired, re-logging in…")
        if not await _login(): return False, {"error": "re-login failed"}
        return await request(method, path, payload, params=params, _retry=True)

    if r.status_code not in (200, 201):
        log.warning("txAdmin %s %s → HTTP %d: %s", method, path, r.status_code, str(body)[:200])
        return False, body
    return True, body


# ─── Whitelist ────────────────────────────────────────────────────────────────
async def add_whitelist_approval(identifier: str) -> tuple[bool, str]:
    ok, body = await request("POST", "/whitelist/approvals/add", {"identifier": identifier})
    if ok: return True, "added"
    err = (body or {}).get("error", "") or (body or {}).get("msg", "") or "unknown"
    if any(w in err.lower() for w in ("exist", "already", "duplicate")):
        return True, "already_whitelisted"
    return False, err

async def remove_whitelist_approval(identifier: str) -> tuple[bool, str]:
    ok, body = await request("POST", "/whitelist/approvals/remove", {"identifier": identifier})
    return (True, "removed") if ok else (False, (body or {}).get("error", "unknown"))


# ─── Bans ─────────────────────────────────────────────────────────────────────
async def ban_online_player(
    net_id: int, reason: str, duration: str = "permanent"
) -> tuple[bool, str | None]:
    """
    Ban an ONLINE player by their server netId.
    Uses POST /player/ban?mutex=current&netid={net_id}
    Returns (success, txadmin_action_id | error_message).
    txAdmin fires playerBanned event → Lua forwards → backend marks source="txadmin".
    """
    ok, body = await request(
        "POST", "/player/ban",
        {"reason": reason, "duration": duration},
        params={"mutex": "current", "netid": str(net_id)},
    )
    if ok:
        action_id = (body or {}).get("actionId")
        log.info("txAdmin online ban OK netid=%s actionId=%s", net_id, action_id)
        return True, action_id
    err = (body or {}).get("error", "") or str(body)[:200]
    return False, err


async def ban_by_identifiers(
    identifiers: list[str], player_name: str, reason: str, duration: str = "permanent"
) -> tuple[bool, str | None]:
    """
    Ban an OFFLINE player (or by known identifiers) via POST /history/addLegacyBan.
    identifiers: list of strings like ["license:abc", "steam:110000..."]
    Returns (success, txadmin_action_id | error_message).
    """
    ok, body = await request(
        "POST", "/history/addLegacyBan",
        {"identifiers": identifiers, "reason": reason, "duration": duration},
    )
    if ok:
        action_id = (body or {}).get("actionId")
        log.info("txAdmin legacy ban OK ids=%s actionId=%s", identifiers, action_id)
        return True, action_id
    err = (body or {}).get("error", "") or str(body)[:200]
    return False, err


async def revoke_ban(action_id: str) -> tuple[bool, str]:
    """
    Revoke (unban) a txAdmin ban by its actionId.
    Uses POST /history/revokeAction.
    Returns (success, message).
    """
    if not action_id:
        return False, "No txAdmin actionId stored — cannot revoke in txAdmin"
    ok, body = await request("POST", "/history/revokeAction", {"actionId": action_id})
    if ok:
        log.info("txAdmin revoke OK actionId=%s", action_id)
        return True, "revoked"
    err = (body or {}).get("error", "") or str(body)[:200]
    return False, err


# ─── Health ───────────────────────────────────────────────────────────────────
async def is_available() -> bool:
    if not TXADMIN_URL: return False
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get(f"{TXADMIN_URL}/auth/self",
                            headers={"Cookie": _cookie or "", "x-txadmin-csrftoken": _csrf or ""})
            return r.status_code in (200, 401, 403)
    except Exception:
        return False
