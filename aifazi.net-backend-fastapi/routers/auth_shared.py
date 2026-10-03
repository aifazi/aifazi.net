"""auth_shared.py — shared helpers/constants for the auth sub-routers.

Extracted from routers/auth.py (god-file split): everything the auth
sub-routers (auth_login, auth_2fa, auth_profile, auth_sessions,
auth_register, auth_staff, auth_discord) and the OAuth providers
(github/steam/ldap/authentik) share. routers/auth.py is now a thin
assembly module that only includes the sub-routers.
"""
import asyncio
import base64
import io
import logging
import os
import re
import secrets
import urllib.parse as _urlparse
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
import pyotp
import qrcode
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field

from database import _escape_ilike, supabase
from dependencies import CookieHTTPBearer
from jwt_compat import jwt
from paseto_token import decode_token as _paseto_decode_token
from permissions import normalize_permissions, role_permissions
from utils.audit import record as _audit
from utils.audit import record_auth as _auth_log
from utils.email import render_template
from utils.email_queue import queue_email
from utils.auth_tokens import ADMIN_USERNAME

log = logging.getLogger("auth")

SECRET = os.environ.get("PASETO_SECRET", "")
ALGO   = "HS256"
# 020 — how long (seconds) a rotated-out previous-generation refresh token is
# still accepted, to tolerate a two-tab concurrent-refresh race. Replay of a
# stolen token is bounded to this window instead of its full 7-day lifetime.
_REFRESH_ROTATION_GRACE = 30
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
_IS_PRODUCTION_AUTH = os.getenv("ENV") == "production" or os.getenv("VERCEL", "") == "1"
if _IS_PRODUCTION_AUTH:
    if not ADMIN_PASSWORD_HASH:
        raise RuntimeError(
            "ADMIN_PASSWORD_HASH (bcrypt) is required in production. "
            "Set it instead of plaintext ADMIN_PASSWORD and redeploy."
        )
    if not ADMIN_PASSWORD_HASH.startswith(("$2b$", "$2a$", "$2y$")):
        raise RuntimeError("ADMIN_PASSWORD_HASH must be a bcrypt hash in production. Refusing to start.")
    ADMIN_PASSWORD = ADMIN_PASSWORD_HASH
elif ADMIN_PASSWORD_HASH:
    ADMIN_PASSWORD = ADMIN_PASSWORD_HASH
elif ADMIN_PASSWORD and not ADMIN_PASSWORD.startswith(("$2b$", "$2a$", "$2y$")):
    log.warning(
        "ADMIN_PASSWORD is plaintext (dev only): set ADMIN_PASSWORD_HASH to a bcrypt hash. "
        "Plaintext admin passwords are refused in production and will fail authentication."
    )
SITE_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
# Deep-link base the OAuth callbacks redirect to when the flow was started from
# the mobile app (`mobile=1`). Server-controlled; the app only accepts URLs under
# this exact prefix. Override via MOBILE_AUTH_URL if the scheme ever changes.
MOBILE_AUTH_URL = os.getenv("MOBILE_AUTH_URL", "aifazi:///oauth/callback").rstrip("/")

# C1 — Cookie domain derivation so the frontend Next.js middleware on `aifazi.net`
# can read the auth cookies issued by `api.aifazi.net`. Without an explicit
# `Domain=` attribute (default host-only), the cookie is locked to api.aifazi.net
# and the frontend can never see it. With `SameSite=strict` + cross-subdomain flow,
# the browser DROPS the cookie on Cross-Origin credentialed requests → the entire
# HttpOnly cookie mechanism was dead-on-arrival in the production topology.
# Lax + Domain=.aifazi.net lets top-level navigations and credentialed CORS fetches
# carry the cookie as expected.
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "")
if not COOKIE_DOMAIN:
    _fr_host = _urlparse.urlparse(SITE_URL).hostname or ""
    if _fr_host and _fr_host not in ("localhost", "127.0.0.1") and "." in _fr_host:
        parts = _fr_host.split(".")
        if len(parts) >= 2:
            COOKIE_DOMAIN = "." + ".".join(parts[-2:])

# Require explicit COOKIE_DOMAIN in production
if os.getenv("ENV") == "production" and not os.getenv("COOKIE_DOMAIN"):
    raise RuntimeError("COOKIE_DOMAIN is required in production. Set it in your deployment environment variables (e.g., .aifazi.net).")

# ── Password helpers ───────────────────────────────────────────────────────────
def _hash(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')

async def _hash_async(pw: str) -> str:
    return await asyncio.to_thread(_hash, pw)

def _verify(pw: str, hashed: str) -> bool:
    # Empty / non-bcrypt hashes (social-only accounts, legacy rows, plaintext
    # leftovers) must fail cleanly as a wrong password — NOT raise, which turned
    # a login attempt into a confusing "Password verification failed (bcrypt
    # error): Invalid salt" 500 for accounts that simply have no password set.
    if not hashed or not hashed.startswith(("$2a$", "$2b$", "$2y$")):
        return False
    try:
        return _bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception as exc:
        log.error("bcrypt._verify FAILED — this is the login bug: %s", exc, exc_info=True)
        return False

async def _verify_async(pw: str, hashed: str) -> bool:
    return await asyncio.to_thread(_verify, pw, hashed)

def _check_admin_password(submitted: str) -> bool:
    """Admin password verification. Requires a bcrypt hash (starting with $2b$, $2a$,
    or $2y$). Plaintext passwords are rejected — generate a hash with
    python -c \"import bcrypt; print(bcrypt.hashpw(b'yourpass', bcrypt.gensalt()).decode())\"
    and set it as ADMIN_PASSWORD in your environment."""
    if not ADMIN_PASSWORD:
        return False
    if not ADMIN_PASSWORD.startswith(("$2b$", "$2a$", "$2y$")):
        log.error("ADMIN_PASSWORD must be a bcrypt hash — refusing plaintext login")
        raise HTTPException(503, "Admin password must be a bcrypt hash")
    return _verify(submitted, ADMIN_PASSWORD)

# ── Staff models (shared with routers/auth_staff.py) ───────────────────────────
class StaffCreateBody(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    role: str
    forum_user_id: str | None = None
    module_permissions: dict | None = None

class StaffUpdateBody(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    role: str | None = None
    forum_user_id: str | None = None
    module_permissions: dict | None = None

# ── 2FA helpers ────────────────────────────────────────────────────────────────
def _get_admin_2fa():
    res = supabase.table("admin_2fa").select("*").eq("username", ADMIN_USERNAME).execute()
    return res.data[0] if res.data else None

def _upsert_admin_2fa(updates: dict):
    if _get_admin_2fa():
        supabase.table("admin_2fa").update(updates).eq("username", ADMIN_USERNAME).execute()
    else:
        supabase.table("admin_2fa").insert({"username": ADMIN_USERNAME, **updates}).execute()

# ── 2FA recovery codes ──────────────────────────────────────────────────────────
# One-time backup codes (bcrypt-hashed at rest). Stored in `recovery_codes`
# (jsonb array of hashes) on the users row or the admin_2fa row. Each code is
# single-use: verifying it removes it from the array. Plaintext codes are only
# returned once, at enable / explicit regenerate time.
_RECOVERY_CODE_COUNT = 8
_RECOVERY_CODE_RE = re.compile(r"^[A-Z2-7]{12}$")

def _gen_recovery_codes(n: int = _RECOVERY_CODE_COUNT) -> list[str]:
    out: list[str] = []
    while len(out) < n:
        code = "".join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567") for _ in range(12))
        fmt = f"{code[:4]}-{code[4:8]}-{code[8:]}"
        if fmt not in out:
            out.append(fmt)
    return out

def _recovery_codes_doc(user_type: str, user_id: str) -> dict:
    """Fetch the account's stored recovery-code hashes doc (dict of hash->used)."""
    if user_type == "admin":
        row = _get_admin_2fa() or {}
        raw = row.get("recovery_codes")
    else:
        try:
            res = supabase.table("users").select("recovery_codes").eq("id", user_id).limit(1).execute()
            raw = (res.data or [{}])[0].get("recovery_codes")
        except Exception:
            raw = None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        return {h: False for h in raw if isinstance(h, str)}
    return {}

def _store_recovery_codes(user_type: str, user_id: str, hashes: dict) -> None:
    if user_type == "admin":
        _upsert_admin_2fa({"recovery_codes": hashes})
    else:
        supabase.table("users").update({"recovery_codes": hashes}).eq("id", user_id).execute()

def _rotate_recovery_codes(user_type: str, user_id: str) -> list[str]:
    codes = _gen_recovery_codes()
    _store_recovery_codes(user_type, user_id, {_hash(c): False for c in codes})
    return codes

def _consume_recovery_code(user_type: str, user_id: str, code: str) -> bool:
    """Verify + consume a recovery code. Returns True if it was valid (and now used)."""
    normalized = (code or "").replace(" ", "").replace("-", "").upper()
    if not normalized or not _RECOVERY_CODE_RE.match(normalized):
        return False
    hashes = _recovery_codes_doc(user_type, user_id)
    if not hashes:
        return False
    for stored_hash, used in hashes.items():
        if used:
            continue
        try:
            if _bcrypt.checkpw(normalized.encode("utf-8"), stored_hash.encode("utf-8")):
                hashes[stored_hash] = True
                _store_recovery_codes(user_type, user_id, hashes)
                return True
        except Exception:
            continue
    return False

def _has_recovery_codes(user_type: str, user_id: str) -> bool:
    hashes = _recovery_codes_doc(user_type, user_id)
    return any(not used for used in hashes.values())

def _verify_2fa_entry(user_type: str, user_id: str, secret: str, code: str) -> bool:
    """True if the code is a valid TOTP code for the secret OR a valid recovery code."""
    code_clean = (code or "").replace(" ", "")
    if pyotp.TOTP(secret).verify(code_clean, valid_window=1):
        return True
    return _consume_recovery_code(user_type, user_id, code_clean)

def _clean_username(value: str) -> str:
    import re as _re
    cleaned = _re.sub(r"[^A-Za-z0-9_.-]+", "_", (value or "").strip()).strip("._-")
    return (cleaned[:30] or "staff")

# ── Email templates + queueing ─────────────────────────────────────────────────
def _email_layout(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title}</title>
<style>
  body {{ margin:0; padding:0; background:#f1f5f9; font-family:'Courier New',monospace; }}
  .outer {{ background:#f1f5f9; padding:40px 16px; }}
  .card  {{ max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:4px; overflow:hidden; }}
  .hdr   {{ background:#f8fafc; padding:24px 32px; border-bottom:1px solid #e2e8f0; }}
  .logo  {{ font-size:11px; letter-spacing:4px; color:#16a34a; text-transform:uppercase; font-weight:700; }}
  .bdy   {{ padding:36px 32px; color:#1e293b; }}
  .ftr   {{ padding:20px 32px; border-top:1px solid #e2e8f0; text-align:center; }}
  .ftr-txt {{ font-size:10px; color:#94a3b8; letter-spacing:2px; }}
  @media (prefers-color-scheme: dark) {{
    body, .outer {{ background:#0a0a0f !important; }}
    .card  {{ background:#111118 !important; border-color:#1e2030 !important; }}
    .hdr   {{ background:#0d0d14 !important; border-bottom-color:#1e2030 !important; }}
    .logo  {{ color:#00ff88 !important; }}
    .bdy   {{ color:#f1f5f9 !important; }}
    .bdy h1 {{ color:#f1f5f9 !important; }}
    .bdy p  {{ color:#94a3b8 !important; }}
    .bdy strong {{ color:#f1f5f9 !important; }}
    .ftr   {{ border-top-color:#1e2030 !important; }}
    .ftr-txt {{ color:#4a5568 !important; }}
  }}
</style>
</head>
<body>
<div class="outer">
  <div class="card">
    <div class="hdr"><span class="logo">aifazi.net</span></div>
    <div class="bdy">{body_html}</div>
    <div class="ftr"><span class="ftr-txt">IF YOU DIDN'T REQUEST THIS, IGNORE THIS EMAIL</span></div>
  </div>
</div>
</body>
</html>"""

def _verify_email_html(verify_url: str) -> str:
    body = f"""
    <h1 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 12px;">Verify your email</h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 28px;">
      Thanks for joining <strong style="color:#0f172a;">aifazi.net</strong>. Click below to activate your account.
      This link expires in <strong style="color:#0f172a;">24 hours</strong>.
    </p>
    <a href="{verify_url}" style="display:inline-block;background:#00ff88;color:#000;font-size:12px;font-weight:700;
       letter-spacing:3px;padding:14px 32px;text-decoration:none;text-transform:uppercase;">
      VERIFY EMAIL →
    </a>
    <p style="color:#4a5568;font-size:11px;margin:24px 0 0;">
      Or copy: <span style="color:#64748b;word-break:break-all;">{verify_url}</span>
    </p>"""
    return _email_layout("Verify your email — aifazi.net", body)

async def _queue_activation_email(email: str, verify_url: str, username: str = "") -> None:
    subject, html = render_template("account_activation", {
        "site_name": "aifazi.net",
        "username": username or email.split("@")[0],
        "activation_link": verify_url,
        "expires_in": "24 hours",
    })
    await queue_email(email, subject or "Verify your email - aifazi.net",
                      html or _verify_email_html(verify_url), f"Verify your aifazi.net account: {verify_url}", "account_activation")

def _normalized_email(value: str) -> str:
    return (value or "").strip().lower()

def _email_owner(email: str, *, exclude_forum_user_id: str | None = None, exclude_staff_id: str | None = None, exclude_admin: bool = False) -> dict | None:
    email = _normalized_email(email)
    if not email:
        return None
    needle = email.lower()
    users = supabase.table("users").select("id,email,username").ilike("email", _escape_ilike(email)).limit(10).execute()
    for row in users.data or []:
        if (row.get("email") or "").lower() == needle and str(row.get("id")) != str(exclude_forum_user_id or ""):
            return {"source": "forum", **row}
    staff = supabase.table("users").select("id,email,username").ilike("email", _escape_ilike(email)).limit(10).execute()
    for row in staff.data or []:
        if (row.get("email") or "").lower() == needle and str(row.get("id")) != str(exclude_staff_id or ""):
            return {"source": "staff", **row}
    admin_name = os.getenv("ADMIN_USERNAME", "admin")
    admins = supabase.table("admin_2fa").select("id,username,email").ilike("email", _escape_ilike(email)).limit(10).execute()
    for row in admins.data or []:
        if (row.get("email") or "").lower() == needle and not (exclude_admin and row.get("username") == admin_name):
            return {"source": "admin", **row}
    return None

def _ensure_email_available(email: str, *, exclude_forum_user_id: str | None = None, exclude_staff_id: str | None = None, exclude_admin: bool = False) -> None:
    if _email_owner(email, exclude_forum_user_id=exclude_forum_user_id, exclude_staff_id=exclude_staff_id, exclude_admin=exclude_admin):
        raise HTTPException(409, "Email is already in use.")

async def _queue_staff_email_verification(source: str, email: str, *, staff_id: str | None = None, admin_username: str | None = None) -> None:
    if not email:
        return
    token = jwt.encode({
        "purpose": "email_verify",
        "source": source,
        "staff_id": staff_id,
        "admin_username": admin_username,
        "email": _normalized_email(email),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }, SECRET, ALGO)
    verify_url = f"{SITE_URL}/forum/verify?token={token}"
    await _queue_activation_email(email, verify_url)

def _staff_public(row: dict) -> dict:
    perms = normalize_permissions(row.get("staff_permissions") or role_permissions(row.get("role")))
    return {
        "id": row.get("id"), "_id": row.get("id"), "username": row.get("username"),
        "email": row.get("email"), "role": row.get("role"), "created_at": row.get("created_at"),
        "createdAt": row.get("created_at"), "last_seen": row.get("last_seen"), "lastSeen": row.get("last_seen"),
        "module_permissions": perms, "permissions": perms,
    }

def _make_qr_b64(uri: str) -> str:
    try:
        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""

# ── Shared auth plumbing ───────────────────────────────────────────────────────
bearer = CookieHTTPBearer(auto_error=False)

def _get_forum_user(creds: HTTPAuthorizationCredentials | None) -> dict | None:
    if not creds:
        return None
    try:
        payload = _paseto_decode_token(creds.credentials, purpose="auth")
        if not payload:
            return None
        if payload.get("purpose") not in ("auth",) or payload.get("tfa_pending"):
            return None
        return payload
    except Exception:
        return None

def _record_user_activity(user_id: str, username: str, action: str, detail: str = "", ip: str = "") -> None:
    try:
        supabase.table("user_activity_logs").insert({
            "user_id": user_id, "username": username, "action": action, "detail": detail, "ip": ip,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass

def _find_user_by_ci(field: str, value: str, select: str = "*"):
    value = (value or "").strip()
    if not value:
        return None
    res = supabase.table("users").select(select).ilike(field, _escape_ilike(value)).limit(5).execute()
    needle = value.lower()
    return next((row for row in (res.data or []) if str(row.get(field, "")).lower() == needle), None)

def _identity_owner(field: str, value: str):
    value = (value or "").strip()
    if not value:
        return None
    res = supabase.table("users").select("id").eq(field, value).limit(1).execute()
    return res.data[0] if res.data else None

def _ensure_identity_available(field: str, value: str, current_user_id: str | None = None, label: str = "Identity") -> None:
    owner = _identity_owner(field, value)
    if owner and owner["id"] != current_user_id:
        raise HTTPException(409, f"{label} already linked to another user")

def _next_available_username(raw_username: str) -> str:
    import re as _re
    cleaned = _re.sub(r"[^A-Za-z0-9_.-]+", "_", (raw_username or "").strip()).strip("._-")
    base = (cleaned[:30] or "player")
    uname = base
    suffix = 0
    while _find_user_by_ci("username", uname, "id,username"):
        suffix += 1
        max_base = max(1, 30 - len(str(suffix)))
        uname = f"{base[:max_base]}{suffix}"
    return uname

def _steam64_to_hex(steam_id: str | None) -> str | None:
    if not steam_id:
        return None
    try:
        return f"steam:{hex(int(str(steam_id)))[2:].lower()}"
    except (TypeError, ValueError):
        return None

ACTIVE_IDENTITY_MESSAGE = "Your player identity is active. Contact an admin or open a ticket to change Discord or Steam."

def _active_identity_locked(user_id: str) -> bool:
    row = supabase.table("users").select("discord_id,steam_id").eq("id", user_id).limit(1).execute()
    if not row.data:
        return False
    user = row.data[0]
    filters: list[str] = []
    discord_id = str(user.get("discord_id") or "").strip()
    steam_hex = _steam64_to_hex(user.get("steam_id"))
    if discord_id:
        filters.append(f"discord_id.eq.{discord_id}")
    if steam_hex:
        filters.append(f"steam_hex.eq.{steam_hex}")
    if not filters:
        return False
    res = supabase.table("fivem_whitelist").select("id,last_played_at").eq("status", "approved").not_.is_("last_played_at", "null").or_(",".join(filters)).limit(1).execute()
    return bool(res.data)

def _upsert_forum_session(user_id: str, username: str, ip: str, ua: str) -> bool:
    """Track a login session. Returns True when this is a NEW device (first time
    this IP+UA is seen for the account) — used to fire a new-device email alert."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        existing = supabase.table("forum_sessions").select("id").eq("user_id", user_id).eq("ip", ip).eq("user_agent", ua).execute()
        if existing.data:
            supabase.table("forum_sessions").update({"last_active": now}).eq("id", existing.data[0]["id"]).execute()
            return False
        supabase.table("forum_sessions").insert({"user_id": user_id, "username": username, "ip": ip, "user_agent": ua, "last_active": now, "created_at": now}).execute()
        return True
    except Exception:
        return False

def _send_new_device_alert(username: str, email: str, ip: str, ua: str) -> None:
    """Email the account owner when a sign-in happens from a device we've never
    seen before. Best-effort — a failure never blocks the login response."""
    if not email:
        return
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    device = (ua or "unknown device")[:120]
    body = f"""
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h2 style="color:#00ff88;margin:0 0 8px">New sign-in to your account</h2>
  <p style="color:#8b949e;font-size:14px">We noticed a new sign-in for <strong style="color:#e6edf3">@{username}</strong>.</p>
  <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin:16px 0">
    <div style="color:#8b949e;font-size:12px;margin-bottom:4px">TIME · <span style="color:#e6edf3">{now}</span></div>
    <div style="color:#8b949e;font-size:12px;margin-bottom:4px">IP · <span style="color:#e6edf3">{ip or "unknown"}</span></div>
    <div style="color:#8b949e;font-size:12px">DEVICE · <span style="color:#e6edf3">{device}</span></div>
  </div>
  <p style="color:#8b949e;font-size:13px">If this was you, you're all set. If not, change your password and enable 2FA, then revoke the session from your profile.</p>
</div>"""
    try:
        import asyncio as _asio
        try:
            _loop = _asio.get_running_loop()
        except RuntimeError:
            _loop = None
        _coro = queue_email(email, "New sign-in to your aifazi.net account", body, f"New sign-in: @{username}", "security_alert")
        if _loop is not None:
            _loop.create_task(_coro)
        else:
            _asio.run(_coro)
    except Exception:
        pass
