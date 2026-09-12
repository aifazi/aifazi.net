"""
routers/ldap_oauth.py — LLDAP-backed authentication for aifazi.net + OAuth2 for other apps.

First-party:
  POST /api/auth/ldap/login
      Body: { "username": "admin" | "user@aifazi.net", "password": "..." }
      → LLDAP bind, provision/link forum user, set PASETO cookies (same as /auth/login).

OAuth2 (authorization code) for third-party apps:
  GET  /api/auth/oauth/authorize
  POST /api/auth/oauth/token
  GET  /api/auth/oauth/userinfo
  GET  /.well-known/oauth-authorization-server

Clients are configured via OAUTH_CLIENTS JSON env:
  {"myapp": {"secret": "...", "redirect_uris": ["https://app.example.com/callback"],
             "name": "My App"}}
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Form, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse as _Redir
from pydantic import BaseModel, Field

from database import supabase
from routers.auth import (
    _audit,
    _auth_log,
    _find_user_by_ci,
    _record_user_activity,
    _set_auth_cookies,
    _upsert_forum_session,
    make_forum_token,
    make_refresh_token,
)
from utils.ldap_client import (
    LdapAuthFailed,
    LdapUnavailable,
    LdapUser,
    bind_user,
    healthcheck as ldap_healthcheck,
)

log = logging.getLogger("ldap_oauth")
router = APIRouter()

API_URL = (os.getenv("API_URL") or "https://api.aifazi.net").rstrip("/")
SITE_URL = (os.getenv("SITE_URL") or "https://aifazi.net").rstrip("/")

# ── OAuth clients ───────────────────────────────────────────────────────────────

def _load_clients() -> dict[str, dict[str, Any]]:
    """Clients from admin portal (site_config) first, then OAUTH_CLIENTS env."""
    clients: dict[str, dict[str, Any]] = {}
    try:
        from routers.oauth_admin import get_oauth_config
        cfg = get_oauth_config()
        if cfg.get("enabled", True):
            for cid, c in (cfg.get("clients") or {}).items():
                if isinstance(c, dict):
                    clients[cid] = c
    except Exception as exc:
        log.debug("OAuth clients DB load skipped: %s", exc)
    raw = os.getenv("OAUTH_CLIENTS", "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                # env does not override portal-managed clients
                for k, v in data.items():
                    clients.setdefault(k, v)
        except Exception:
            log.error("OAUTH_CLIENTS is not valid JSON")
    return clients


def _get_client(client_id: str) -> dict[str, Any] | None:
    return _load_clients().get(client_id)


# In-memory auth codes (single-process; fine for this deployment).
# code → {client_id, user_id, username, role, redirect_uri, scope, exp, code_challenge, code_challenge_method}
_auth_codes: dict[str, dict[str, Any]] = {}
_AUTH_CODE_TTL = 120  # seconds

# access_token → user payload (OAuth API access for third-party apps)
_oauth_tokens: dict[str, dict[str, Any]] = {}
_OAUTH_TOKEN_TTL = 3600


def _purge_expired() -> None:
    now = time.time()
    for store, key in ((_auth_codes, "exp"), (_oauth_tokens, "exp")):
        dead = [k for k, v in store.items() if v.get(key, 0) < now]
        for k in dead:
            store.pop(k, None)


# ── Forum user provisioning from LLDAP ──────────────────────────────────────────

def _next_username(base: str) -> str:
    base = "".join(c for c in (base or "user").lower() if c.isalnum() or c in "_-")[:24] or "user"
    uname = base
    n = 0
    while _find_user_by_ci("username", uname, "id,username"):
        n += 1
        uname = f"{base}{n}"
    return uname


def _ensure_forum_user(ldap_user: LdapUser) -> dict:
    """Find or create the Supabase forum user for an LLDAP identity."""
    now = datetime.now(timezone.utc).isoformat()
    email = (ldap_user.email or "").strip().lower()
    user = None
    if email:
        user = _find_user_by_ci("email", email, "*")
    if not user:
        user = _find_user_by_ci("username", ldap_user.uid, "*")
    if user:
        updates = {"last_seen": now}
        if email and not user.get("email"):
            updates["email"] = email
        if ldap_user.display_name and not user.get("display_name"):
            updates["display_name"] = ldap_user.display_name
        try:
            supabase.table("users").update(updates).eq("id", user["id"]).execute()
        except Exception:
            pass
        return {**user, **updates}

    uname = _next_username(ldap_user.uid)
    row = supabase.table("users").insert({
        "username": uname,
        "email": email or f"{uname}@aifazi.net",
        "password_hash": "",
        "email_verified": True,  # LLDAP is the identity source of truth
        "role": "user",
        "display_name": ldap_user.display_name or ldap_user.uid,
        "created_at": now,
        "last_seen": now,
    }).execute()
    if not row.data:
        raise HTTPException(500, "Failed to provision user")
    return row.data[0]


# ── First-party: LLDAP login for aifazi.net ─────────────────────────────────────

class LdapLoginBody(BaseModel):
    username: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)


@router.get("/ldap/health")
async def ldap_health():
    return {"ok": ldap_healthcheck(), "url": os.getenv("LLDAP_URL", "ldap://lldap:3890")}


@router.post("/ldap/login")
async def ldap_login(body: LdapLoginBody, request: Request, response: Response):
    """Login aifazi.net using LLDAP credentials (LDAP bind)."""
    client_ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    try:
        ldap_user = bind_user(body.username, body.password)
    except LdapAuthFailed:
        _audit("unknown", "login_failed", target=body.username, ip=client_ip)
        _auth_log(body.username, success=False, ip=client_ip, user_agent=ua,
                  role="user", reason="ldap_invalid_credentials")
        raise HTTPException(400, "Invalid credentials")
    except LdapUnavailable as exc:
        log.error("LLDAP unavailable on login: %s", exc)
        raise HTTPException(503, "Directory unavailable — try again shortly")

    user = _ensure_forum_user(ldap_user)
    if user.get("banned"):
        _auth_log(user["username"], success=False, ip=client_ip, user_agent=ua,
                  role=user.get("role", ""), reason="account_suspended")
        raise HTTPException(403, f"Account suspended: {user.get('ban_reason', '')}")

    role = user.get("role") or "user"
    token = make_forum_token(user["id"], user["username"], role)
    refresh = make_refresh_token(
        {"id": user["id"], "username": user["username"], "role": role}, 60 * 24 * 7
    )
    try:
        supabase.table("users").update({
            "refresh_token": refresh,
            "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user["id"]).execute()
    except Exception:
        pass

    _auth_log(user["username"], success=True, ip=client_ip, user_agent=ua,
              role=role, reason="ldap_login")
    _record_user_activity(user["id"], user["username"], "ldap_login", f"IP: {client_ip}", client_ip)
    try:
        _upsert_forum_session(user["id"], user["username"], client_ip, ua)
    except Exception:
        pass
    _set_auth_cookies(response, token, refresh)
    return {
        "token": token,
        "refreshToken": refresh,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user.get("email") or ldap_user.email,
            "role": role,
            "display_name": ldap_user.display_name or user.get("display_name") or "",
            "groups": ldap_user.groups,
            "provider": "lldap",
        },
    }


# ── OAuth2 authorization code flow ──────────────────────────────────────────────

_LOGIN_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in — aifazi</title>
<style>
body{{font-family:system-ui,sans-serif;background:#0b0f14;color:#c9d1d9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.card{{background:#111820;border:1px solid #1e2a38;border-radius:14px;padding:28px;width:340px;box-shadow:0 12px 40px rgba(0,0,0,.4)}}
h1{{font-size:18px;margin:0 0 4px;color:#b56cff}}
p{{font-size:13px;color:#8b949e;margin:0 0 18px}}
label{{display:block;font-size:12px;margin-bottom:6px;color:#8b949e}}
input{{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #1e2a38;background:#0b0f14;color:#c9d1d9;margin-bottom:12px;font-size:14px}}
button{{width:100%;padding:11px;border:none;border-radius:8px;background:linear-gradient(135deg,#b56cff,#9333ea);color:#fff;font-weight:600;cursor:pointer;font-size:14px}}
button:hover{{filter:brightness(1.1)}}
.err{{color:#f85149;font-size:13px;margin-bottom:10px}}
.brand{{font-family:ui-monospace,monospace;letter-spacing:2px;font-size:12px;text-transform:uppercase;color:#22d3ee;margin-bottom:16px}}
</style></head><body>
<div class="card">
  <div class="brand">AIFAZI ID</div>
  <h1>Sign in with LLDAP</h1>
  <p>{app_name} wants to access your account.</p>
  {error_html}
  <form method="post" action="{action}">
    <input type="hidden" name="client_id" value="{client_id}">
    <input type="hidden" name="redirect_uri" value="{redirect_uri}">
    <input type="hidden" name="state" value="{state}">
    <input type="hidden" name="scope" value="{scope}">
    <input type="hidden" name="code_challenge" value="{code_challenge}">
    <input type="hidden" name="code_challenge_method" value="{code_challenge_method}">
    <label>Email or username</label>
    <input name="username" autocomplete="username" required autofocus>
    <label>Password</label>
    <input name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Continue</button>
  </form>
</div></body></html>"""


def _verify_pkce(verifier: str, challenge: str, method: str) -> bool:
    if method.lower() == "s256":
        import base64
        import hashlib
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return secrets.compare_digest(expected, challenge)
    # plain
    return secrets.compare_digest(verifier, challenge)


@router.get("/oauth/authorize")
async def oauth_authorize(
    request: Request,
    response: Response,
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    response_type: str = Query("code"),
    scope: str = Query("openid profile email"),
    state: str = Query(""),
    code_challenge: str = Query(""),
    code_challenge_method: str = Query("S256"),
):
    client = _get_client(client_id)
    if not client:
        raise HTTPException(400, "Unknown client_id")
    if redirect_uri not in (client.get("redirect_uris") or []):
        raise HTTPException(400, "Invalid redirect_uri")
    if response_type != "code":
        raise HTTPException(400, "Only response_type=code is supported")

    # If already logged in via aifazi cookie, skip the form
    token = request.cookies.get("auth_token") or ""
    if token:
        from paseto_token import decode_token
        try:
            payload = decode_token(token, purpose="auth") or {}
        except Exception:
            payload = {}
        if payload.get("id") and not payload.get("tfa_pending"):
            code = secrets.token_urlsafe(32)
            _purge_expired()
            _auth_codes[code] = {
                "client_id": client_id,
                "user_id": str(payload["id"]),
                "username": payload.get("username") or "",
                "role": payload.get("role") or "user",
                "redirect_uri": redirect_uri,
                "scope": scope,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method or "S256",
                "exp": time.time() + _AUTH_CODE_TTL,
            }
            q = {"code": code}
            if state:
                q["state"] = state
            sep = "&" if "?" in redirect_uri else "?"
            return _Redir(f"{redirect_uri}{sep}{urlencode(q)}")

    app_name = client.get("name") or client_id
    html = _LOGIN_PAGE.format(
        app_name=app_name,
        action=f"{API_URL}/api/auth/oauth/authorize",
        client_id=client_id,
        redirect_uri=redirect_uri,
        state=state,
        scope=scope,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method or "S256",
        error_html="",
    )
    return HTMLResponse(html)


@router.post("/oauth/authorize")
async def oauth_authorize_post(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    state: str = Form(""),
    scope: str = Form("openid profile email"),
    code_challenge: str = Form(""),
    code_challenge_method: str = Form("S256"),
):
    client = _get_client(client_id)
    if not client or redirect_uri not in (client.get("redirect_uris") or []):
        raise HTTPException(400, "Invalid client or redirect_uri")
    try:
        ldap_user = bind_user(username, password)
    except LdapAuthFailed:
        html = _LOGIN_PAGE.format(
            app_name=client.get("name") or client_id,
            action=f"{API_URL}/api/auth/oauth/authorize",
            client_id=client_id, redirect_uri=redirect_uri, state=state,
            scope=scope, code_challenge=code_challenge,
            code_challenge_method=code_challenge_method or "S256",
            error_html='<div class="err">Invalid username or password</div>',
        )
        return HTMLResponse(html, status_code=401)
    except LdapUnavailable:
        raise HTTPException(503, "Directory unavailable")

    user = _ensure_forum_user(ldap_user)
    code = secrets.token_urlsafe(32)
    _purge_expired()
    _auth_codes[code] = {
        "client_id": client_id,
        "user_id": str(user["id"]),
        "username": user["username"],
        "role": user.get("role") or "user",
        "redirect_uri": redirect_uri,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method or "S256",
        "exp": time.time() + _AUTH_CODE_TTL,
    }
    # Also set first-party cookies so the browser is signed into aifazi.net
    token = make_forum_token(user["id"], user["username"], user.get("role") or "user")
    refresh = make_refresh_token(
        {"id": user["id"], "username": user["username"], "role": user.get("role") or "user"},
        60 * 24 * 7,
    )
    try:
        supabase.table("users").update({
            "refresh_token": refresh,
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user["id"]).execute()
    except Exception:
        pass
    _set_auth_cookies(response, token, refresh)

    q = {"code": code}
    if state:
        q["state"] = state
    sep = "&" if "?" in redirect_uri else "?"
    return _Redir(f"{redirect_uri}{sep}{urlencode(q)}")


@router.post("/oauth/token")
async def oauth_token(request: Request):
    """OAuth2 token endpoint — authorization_code + password grants."""
    ctype = (request.headers.get("content-type") or "").lower()
    if "application/x-www-form-urlencoded" in ctype or "multipart/form-data" in ctype:
        form = await request.form()
        data = {k: str(v) for k, v in form.items()}
    else:
        data = await request.json()

    # HTTP Basic client auth is also accepted
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("basic "):
        import base64
        try:
            raw = base64.b64decode(auth[6:]).decode()
            cid, _, csec = raw.partition(":")
            data.setdefault("client_id", cid)
            data.setdefault("client_secret", csec)
        except Exception:
            pass

    grant_type = data.get("grant_type") or ""
    client_id = data.get("client_id") or ""
    client_secret = data.get("client_secret") or ""

    if grant_type == "password":
        # Resource-owner password: any public/confidential client, or no client for first-party
        uname = data.get("username") or ""
        pw = data.get("password") or ""
        if not uname or not pw:
            raise HTTPException(400, "username and password required")
        try:
            ldap_user = bind_user(uname, pw)
        except LdapAuthFailed:
            raise HTTPException(401, "invalid_grant")
        except LdapUnavailable:
            raise HTTPException(503, "Directory unavailable")
        user = _ensure_forum_user(ldap_user)
        _purge_expired()
        access = secrets.token_urlsafe(32)
        _oauth_tokens[access] = {
            "user_id": str(user["id"]),
            "username": user["username"],
            "email": user.get("email") or ldap_user.email,
            "role": user.get("role") or "user",
            "groups": ldap_user.groups,
            "scope": data.get("scope") or "openid profile email",
            "exp": time.time() + _OAUTH_TOKEN_TTL,
        }
        return JSONResponse({
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": _OAUTH_TOKEN_TTL,
            "scope": data.get("scope") or "openid profile email",
        })

    if grant_type != "authorization_code":
        raise HTTPException(400, "unsupported_grant_type")

    code = data.get("code") or ""
    rec = _auth_codes.pop(code, None)
    if not rec or rec.get("exp", 0) < time.time():
        raise HTTPException(400, "invalid_grant")
    client = _get_client(rec["client_id"])
    if not client:
        raise HTTPException(400, "invalid_client")
    # Confidential clients must present a secret; public clients may omit it
    if client.get("secret"):
        if not client_secret or not secrets.compare_digest(str(client.get("secret")), client_secret):
            raise HTTPException(401, "invalid_client")
    if client_id and client_id != rec["client_id"]:
        raise HTTPException(400, "invalid_client")
    if data.get("redirect_uri") and data["redirect_uri"] != rec["redirect_uri"]:
        raise HTTPException(400, "invalid_grant")
    if rec.get("code_challenge"):
        verifier = data.get("code_verifier") or ""
        if not verifier or not _verify_pkce(verifier, rec["code_challenge"], rec.get("code_challenge_method") or "S256"):
            raise HTTPException(400, "invalid_grant")

    _purge_expired()
    access = secrets.token_urlsafe(32)
    _oauth_tokens[access] = {
        "user_id": rec["user_id"],
        "username": rec["username"],
        "role": rec["role"],
        "scope": rec.get("scope") or "openid profile email",
        "client_id": rec["client_id"],
        "exp": time.time() + _OAUTH_TOKEN_TTL,
    }
    return JSONResponse({
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": _OAUTH_TOKEN_TTL,
        "scope": rec.get("scope") or "openid profile email",
    })


@router.get("/oauth/userinfo")
async def oauth_userinfo(request: Request):
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = auth[7:].strip()
    rec = _oauth_tokens.get(token)
    if not rec or rec.get("exp", 0) < time.time():
        raise HTTPException(401, "invalid_token")
    claims: dict[str, Any] = {
        "sub": rec["user_id"],
        "preferred_username": rec.get("username"),
    }
    if "email" in (rec.get("scope") or "") or True:
        if rec.get("email"):
            claims["email"] = rec["email"]
            claims["email_verified"] = True
    if rec.get("groups"):
        claims["groups"] = rec["groups"]
    if rec.get("role"):
        claims["role"] = rec["role"]
    return JSONResponse(claims)


@router.post("/oauth/revoke")
async def oauth_revoke(request: Request):
    try:
        data = await request.json()
    except Exception:
        form = await request.form()
        data = {k: str(v) for k, v in form.items()}
    token = data.get("token") or ""
    _oauth_tokens.pop(token, None)
    return JSONResponse({"revoked": True})


@router.get("/oauth/.well-known/oauth-authorization-server")
async def oauth_metadata():
    return JSONResponse({
        "issuer": API_URL,
        "authorization_endpoint": f"{API_URL}/api/auth/oauth/authorize",
        "token_endpoint": f"{API_URL}/api/auth/oauth/token",
        "userinfo_endpoint": f"{API_URL}/api/auth/oauth/userinfo",
        "revocation_endpoint": f"{API_URL}/api/auth/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "password"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "scopes_supported": ["openid", "profile", "email"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
    })
