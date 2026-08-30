"""
routers/auth.py — Staff authentication + management
FIX #3: Admin self-update now handles plain-text ADMIN_PASSWORD (mirrors login() logic).
FIX #4: Refresh token is validated against DB before issuing a new access token.
FIX #5: bcrypt errors are no longer silently swallowed — logged and surfaced as 500.
"""
import asyncio
import base64
import hmac as _hmac
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
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import RedirectResponse as _Redir
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field

from database import safe_search_term, supabase
from dependencies import (
    CookieHTTPBearer,
    get_current_user,
    require_admin,
    require_staff,
)
from jwt_compat import JWTError, jwt
from paseto_token import create_token as _paseto_create_token, decode_token as _paseto_decode_token
from permissions import (
    ACTIONS,
    MODULES,
    ROLE_PERMISSION_PRESETS,
    normalize_permissions,
    resolve_staff_access,
    role_permissions,
)
from utils.audit import record as _audit
from utils.audit import record_auth as _auth_log
from utils.email import render_template
from utils.email_queue import queue_email

try:
    import httpx as _httpx
except ImportError:
    _httpx = None

log = logging.getLogger("auth")
router = APIRouter()

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

SECRET = os.environ.get("PASETO_SECRET", "")
ALGO   = "HS256"
# 020 — how long (seconds) a rotated-out previous-generation refresh token is
# still accepted, to tolerate a two-tab concurrent-refresh race. Replay of a
# stolen token is bounded to this window instead of its full 7-day lifetime.
_REFRESH_ROTATION_GRACE = 30
# Admin gate secret — must be explicitly set. Never falls back to INTERNAL_API_SECRET
# (which would let any internal service forge admin gate tokens).
ADMIN_GATE_SECRET = os.getenv("ADMIN_GATE_SECRET") or ""
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
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
    raise RuntimeError("COOKIE_DOMAIN is required in production. Set it in Railway environment variables (e.g., .aifazi.net).")

# OAuth state helper for C2 (login-CSRF / open-redirect).
from utils.oauth_state import (
    _safe_relative_path,
    make_oauth_state,
    verify_oauth_state_full,
)

def make_token(payload: dict, expires_minutes: int = 60 * 24) -> str:
    """Mint an ACCESS token (PASETO v4 local). Carries `token_type: "access"`."""
    if not SECRET:
        raise HTTPException(503, "PASETO_SECRET is not configured")
    data = payload.copy()
    data["token_type"] = "access"
    return _paseto_create_token(data, expires_in=expires_minutes * 60, purpose="auth")


def make_refresh_token(payload: dict, expires_minutes: int = 60 * 24 * 7) -> str:
    """Mint a REFRESH token (PASETO v4 local). Distinguished by `token_type: "refresh"`."""
    if not SECRET:
        raise HTTPException(503, "PASETO_SECRET is not configured")
    data = payload.copy()
    data["token_type"] = "refresh"
    return _paseto_create_token(data, expires_in=expires_minutes * 60, purpose="auth")


def make_admin_gate_token(payload: dict, expires_minutes: int = 60 * 24) -> str:
    if not ADMIN_GATE_SECRET:
        raise HTTPException(503, "Admin gate secret is not configured")
    data = {
        "username": payload.get("username"),
        "role": payload.get("role"),
        "purpose": "admin_gate",
    }
    if payload.get("id"):
        data["id"] = payload.get("id")
    if payload.get("staff_id"):
        data["staff_id"] = payload.get("staff_id")
    # Use PASETO for admin gate token too (proxy.ts expects PASETO).
    # H4 — pass ADMIN_GATE_SECRET explicitly instead of mutating the
    # process-global os.environ["PASETO_SECRET"]. The old env-var swap raced
    # concurrent make_token() calls: a login happening during the swap window
    # could mint an access token with the admin-gate secret (or an admin-gate
    # token with the access secret), a subtle cross-role trust break.
    return _paseto_create_token(data, expires_in=expires_minutes * 60, purpose="admin_gate", secret=ADMIN_GATE_SECRET)

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

# ── Models ─────────────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str

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

class AdminSelfUpdateBody(BaseModel):
    username:        str | None = None
    email:           EmailStr | None = None
    currentPassword: str | None = None
    newPassword:     str | None = None
    newUsername:     str | None = None  # display name override; login still uses ADMIN_USERNAME env var

class RefreshBody(BaseModel):
    refreshToken: str | None = None   # #2 — now optional; preferred path is HttpOnly cookie

class DeleteAccountBody(BaseModel):
    password: str  # required — prevents accidental/stolen-token account deletion

class TwoFAEnableBody(BaseModel):
    code: str

class TwoFADisableBody(BaseModel):
    password: str
    code: str | None = None   # optional — only checked if 2FA is currently active

class TwoFAVerifyBody(BaseModel):
    partial_token: str
    code: str

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
    out = []
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

def _admin_profile_overrides() -> dict:
    row = _get_admin_2fa() or {}
    return {
        "email": row.get("email") or row.get("email_override") or "",
        "email_verified": bool(row.get("email_verified")),
        "bio": row.get("profile_bio") or "",
        "avatar": row.get("profile_avatar") or "",
        "username_override": row.get("username_override") or ADMIN_USERNAME,
    }

def _clean_username(value: str) -> str:
    import re as _re
    cleaned = _re.sub(r"[^A-Za-z0-9_.-]+", "_", (value or "").strip()).strip("._-")
    return (cleaned[:30] or "staff")

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
    users = supabase.table("users").select("id,email,username").ilike("email", email).limit(10).execute()
    for row in users.data or []:
        if (row.get("email") or "").lower() == needle and str(row.get("id")) != str(exclude_forum_user_id or ""):
            return {"source": "forum", **row}
    staff = supabase.table("users").select("id,email,username").ilike("email", email).limit(10).execute()
    for row in staff.data or []:
        if (row.get("email") or "").lower() == needle and str(row.get("id")) != str(exclude_staff_id or ""):
            return {"source": "staff", **row}
    admin_name = os.getenv("ADMIN_USERNAME", "admin")
    admins = supabase.table("admin_2fa").select("id,username,email").ilike("email", email).limit(10).execute()
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

# ── Forum-specific helpers ──────────────────────────────────────────────────────

bearer = CookieHTTPBearer(auto_error=False)

def make_forum_token(user_id: str, username: str, role: str) -> str:
    return _paseto_create_token({"id": user_id, "username": username, "role": role, "token_type": "access"}, expires_in=7 * 86400, purpose="auth")

def make_forum_2fa_token(user_id: str, username: str, role: str, provider: str = "password") -> str:
    return _paseto_create_token({"id": user_id, "username": username, "role": role, "tfa_pending": True, "provider": provider}, expires_in=5 * 60, purpose="auth")

def _staff_profile_from_payload(payload: dict) -> dict:
    role = payload.get("role", "")
    username = payload.get("username", "")
    user_id = payload.get("id")
    access = resolve_staff_access(payload)
    if access and access.get("staff_row"):
        s = access["staff_row"]
        return {
            "_id": s.get("forum_user_id") or s.get("id"), "id": s.get("forum_user_id") or s.get("id"),
            "staff_id": s.get("id"), "forum_user_id": s.get("forum_user_id"),
            "username": s.get("username") or username, "email": s.get("email") or "",
            "role": s.get("role") or role, "avatar": s.get("profile_avatar") or "", "bio": s.get("profile_bio") or "",
            "email_verified": bool(s.get("email_verified")), "has_password": bool(s.get("password_hash", True)),
            "banned": bool(s.get("banned")), "created_at": s.get("created_at"), "createdAt": s.get("created_at"),
            "last_seen": s.get("last_seen"), "lastSeen": s.get("last_seen"),
            "_staff": True, "staff_account": True, "admin_access": (s.get("role") or role) == "admin",
            "permissions": normalize_permissions(access.get("permissions")), "module_permissions": normalize_permissions(access.get("permissions")),
            "account_source": "linked_staff" if s.get("forum_user_id") else "staff",
        }
    if role == "admin" and not user_id:
        ov = _admin_profile_overrides()
        return {
            "_id": "env_admin", "id": "env_admin", "username": ov.get("username") or username, "email": ov.get("email") or "",
            "role": "admin", "avatar": ov.get("avatar") or "", "bio": ov.get("bio") or "",
            "email_verified": bool(ov.get("email_verified")), "has_password": True, "banned": False,
            "created_at": ov.get("created_at"), "createdAt": ov.get("created_at"), "last_seen": ov.get("last_seen"), "lastSeen": ov.get("last_seen"),
            "_staff": True, "staff_account": True, "admin_access": True, "_legacy": True, "account_source": "env_admin",
            "permissions": role_permissions("admin"), "module_permissions": role_permissions("admin"),
        }
    return {
        "_id": user_id, "id": user_id, "username": username, "email": "", "role": role, "avatar": "", "bio": "",
        "email_verified": True, "has_password": True, "banned": False, "created_at": None, "createdAt": None,
        "last_seen": None, "lastSeen": None, "_staff": True, "staff_account": True, "admin_access": role == "admin",
        "_legacy": not bool(user_id), "permissions": role_permissions(role), "module_permissions": role_permissions(role), "account_source": "staff",
    }

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

def _is_staff_payload(payload: dict | None) -> bool:
    return bool(payload and payload.get("role") in ("admin", "moderator", "editor", "chat"))

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
    res = supabase.table("users").select(select).ilike(field, value).limit(5).execute()
    needle = value.lower()
    return next((row for row in (res.data or []) if str(row.get(field, "")).lower() == needle), None)

def _username_owner(username: str, exclude_id: str | None = None) -> dict | None:
    res = supabase.table("users").select("id,username").ilike("username", username).limit(10).execute()
    for row in res.data or []:
        if (row.get("username") or "").lower() == username.lower() and str(row.get("id")) != str(exclude_id or ""):
            return row
    return None

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

def _reset_email_html(reset_url: str) -> str:
    body = f"""
    <h1 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 12px;">Reset your password</h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 28px;">
      We received a request to reset your <strong style="color:#0f172a;">aifazi.net</strong> password.
      This link expires in <strong style="color:#0f172a;">1 hour</strong>.
    </p>
    <a href="{reset_url}" style="display:inline-block;background:#00e5ff;color:#000;font-size:12px;font-weight:700;
       letter-spacing:3px;padding:14px 32px;text-decoration:none;text-transform:uppercase;">
      RESET PASSWORD →
    </a>
    <p style="color:#4a5568;font-size:11px;margin:24px 0 0;">
      Or copy: <span style="color:#64748b;word-break:break-all;">{reset_url}</span>
    </p>"""
    return _email_layout("Reset your password — aifazi.net", body)

def _find_username_email_html(username: str) -> str:
    body = f"""
    <h1 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 12px;">Your username</h1>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">
      You requested a username reminder for your <strong style="color:#0f172a;">aifazi.net</strong> account.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:20px 24px;margin:0 0 28px;">
      <div style="font-size:10px;letter-spacing:3px;color:#94a3b8;margin-bottom:8px;">YOUR USERNAME</div>
      <div style="font-size:26px;font-weight:700;color:#16a34a;font-family:'Courier New',monospace;letter-spacing:2px;">{username}</div>
    </div>
    <a href="{SITE_URL}/login" style="display:inline-block;background:#00ff88;color:#000;font-size:12px;font-weight:700;
       letter-spacing:3px;padding:14px 32px;text-decoration:none;text-transform:uppercase;">
      SIGN IN →
    </a>
    <p style="color:#4a5568;font-size:11px;margin:24px 0 0;">
      Forgot your password too? Visit <a href="{SITE_URL}/forum/forgot-password" style="color:#64748b;">{SITE_URL}/forum/forgot-password</a>
    </p>"""
    return _email_layout("Your username — aifazi.net", body)

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
        _asio.get_event_loop().create_task(
            queue_email(email, "New sign-in to your aifazi.net account", body, f"New sign-in: @{username}", "security_alert")
        )
    except Exception:
        try:
            import asyncio as _asio
            _asio.get_event_loop().run_until_complete(
                queue_email(email, "New sign-in to your aifazi.net account", body, f"New sign-in: @{username}", "security_alert")
            )
        except Exception:
            pass

def _make_discord_link_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=10)
    return _paseto_create_token({"id": user_id, "purpose": "discord_link"}, expires_in=10 * 60, purpose="auth")

def _decode_discord_link_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        payload = _paseto_decode_token(token, purpose="auth")
        if not payload:
            return None
        return payload if payload.get("purpose") == "discord_link" else None
    except Exception:
        return None

def _discord_oauth_url(state: str) -> str:
    _DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
    _DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", f"{os.getenv('API_URL', 'https://api.aifazi.net')}/api/auth/discord/callback")
    params = _urlparse.urlencode({"client_id": _DISCORD_CLIENT_ID, "redirect_uri": _DISCORD_REDIRECT_URI, "response_type": "code", "scope": "identify email", "state": state})
    return f"https://discord.com/oauth2/authorize?{params}"

# ── Forum-specific model classes ────────────────────────────────────────────────

class RegisterBody(BaseModel):
    username: str
    email: EmailStr
    password: str

class ForgotBody(BaseModel):
    identifier: str

class FindUsernameBody(BaseModel):
    email: EmailStr

class ResetBody(BaseModel):
    token: str
    password: str = Field(min_length=8)

class ResendBody(BaseModel):
    email: str

class ProfileBody(BaseModel):
    username: str
    bio: str = ""
    avatar: str = ""
    email: EmailStr | None = None

class ChangePasswordBody(BaseModel):
    current_password: str | None = None
    new_password: str
    code: str = ""  # required (TOTP or recovery code) when 2FA is enabled

# SQL migration (run once in Supabase):
#   CREATE TABLE IF NOT EXISTS admin_2fa (
#       id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
#       totp_secret TEXT, enabled BOOLEAN DEFAULT FALSE);
#   ALTER TABLE staff_users
#       ADD COLUMN IF NOT EXISTS totp_secret TEXT,
#       ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;

def _set_auth_cookies(response: Response, access: str, refresh: str):
    """Set auth cookies via Set-Cookie headers.
    auth_token: HttpOnly Secure cookie containing the PASETO access token.
    refresh_token: HttpOnly Secure cookie for token refresh.
    admin_session: HttpOnly signed gate token for Next.js Edge middleware.
      It carries purpose=admin_gate and is rejected by backend bearer auth.
    """
    is_prod = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "production").lower() == "production"
    response.set_cookie(
        key="auth_token", value=access,
        httponly=True, secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24, path="/",
    )
    response.set_cookie(
        key="refresh_token", value=refresh,
        httponly=True, secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24 * 7, path="/",
    )
    # Decode PASETO access token for admin gate
    access_payload = _paseto_decode_token(access, purpose="auth") or {}
    response.set_cookie(
        key="admin_session", value=make_admin_gate_token(access_payload, 60 * 24 * 7),
        httponly=True,
        secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24 * 7, path="/",
    )

def _set_admin_gate_cookie(response: Response, gate_token: str):
    is_prod = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "production").lower() == "production"
    response.set_cookie(
        key="admin_session", value=gate_token,
        httponly=True,
        secure=is_prod, samesite="lax",
        domain=COOKIE_DOMAIN or None,
        max_age=60 * 60 * 24 * 7, path="/",
    )

# ── Admin login ─────────────────────────────────────────────────────────────────
@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    client_ip = request.client.host if request.client else ""
    user_agent = request.headers.get("user-agent", "")

    # ── 1. Admin login ──────────────────────────────────────────────────────────
    if body.username and body.username == ADMIN_USERNAME:
        if not _check_admin_password(body.password):
            _audit("unknown", "login_failed", target=body.username, ip=client_ip)
            _auth_log(body.username, success=False, ip=client_ip, user_agent=user_agent,
                      role="admin", reason="wrong_password")
            raise HTTPException(400, "Invalid credentials")
        fu = supabase.table("users").select("id").eq("username", ADMIN_USERNAME).limit(1).execute()
        if fu.data:
            forum_id = fu.data[0]["id"]
        else:
            now = datetime.now(timezone.utc).isoformat()
            fu2 = supabase.table("users").insert({
                "username": ADMIN_USERNAME, "email": f"{ADMIN_USERNAME}@aifazi.net",
                "email_verified": True, "role": "admin", "password_hash": "",
                "created_at": now, "last_seen": now,
            }).execute()
            forum_id = fu2.data[0]["id"] if fu2.data else None
        token = make_token({"username": ADMIN_USERNAME, "role": "admin", "id": forum_id})
        refresh = make_refresh_token({"username": ADMIN_USERNAME, "role": "admin", "id": forum_id}, 60 * 24 * 7)
        # H4 — persist the admin refresh token so /refresh can validate + rotate it.
        # (The admin token carries id=forum_id, so without this the refresh check
        # hits the users row, finds no stored token, and 401s after 24h.)
        if forum_id:
            supabase.table("users").update({
                "refresh_token": refresh,
                "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }).eq("id", forum_id).execute()
        _audit(ADMIN_USERNAME, "admin_login", target="admin_panel",
               details={"role": "admin"}, ip=client_ip)
        _auth_log(ADMIN_USERNAME, success=True, ip=client_ip, user_agent=user_agent, role="admin")
        row = _get_admin_2fa()
        if row and row.get("enabled") and row.get("totp_secret"):
            partial = make_token({"username": ADMIN_USERNAME, "role": "admin", "id": forum_id, "tfa_pending": True}, 5)
            return {"requires_2fa": True, "partial_token": partial}
        if forum_id and _upsert_forum_session(forum_id, ADMIN_USERNAME, client_ip, user_agent):
            _send_new_device_alert(ADMIN_USERNAME, (row or {}).get("email") or f"{ADMIN_USERNAME}@aifazi.net", client_ip, user_agent)
        _set_auth_cookies(response, token, refresh)
        return {"token": token, "refreshToken": refresh, "user": {"username": ADMIN_USERNAME, "role": "admin"}}

    # ── 2. Staff login (by username) ──────────────────────────────────────────
    if body.username:
        res = supabase.table("users").select("*").eq("username", body.username).execute()
        staff = res.data[0] if res.data else None
        if staff and staff.get("role") in ("admin", "moderator", "editor", "chat"):
            if not _verify(body.password, staff["password_hash"]):
                _audit("unknown", "login_failed", target=body.username, ip=client_ip)
                _auth_log(body.username, success=False, ip=client_ip, user_agent=user_agent,
                          role="", reason="wrong_password")
                raise HTTPException(400, "Invalid credentials")
            if staff.get("banned"):
                _auth_log(body.username, success=False, ip=client_ip, user_agent=user_agent,
                          role=staff.get("role", ""), reason="account_suspended")
                raise HTTPException(403, "Account suspended")

            perms = normalize_permissions(staff.get("staff_permissions") or role_permissions(staff.get("role")))
            token   = make_token({"username": staff["username"], "role": staff["role"], "id": staff["id"], "permissions": perms})
            refresh = make_refresh_token({"username": staff["username"], "role": staff["role"], "id": staff["id"], "permissions": perms}, 60 * 24 * 7)

            supabase.table("users").update({
                "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
            }).eq("id", staff["id"]).execute()
            _audit(staff["username"], "staff_login", target="admin_panel",
                   details={"role": staff["role"]}, ip=client_ip)
            _auth_log(staff["username"], success=True, ip=client_ip, user_agent=user_agent,
                      role=staff.get("role", ""))
            if staff.get("totp_enabled") and staff.get("totp_secret"):
                partial = make_token({"username": staff["username"], "role": staff["role"], "id": staff["id"], "tfa_pending": True}, 5)
                return {"requires_2fa": True, "partial_token": partial}
            if _upsert_forum_session(staff["id"], staff["username"], client_ip, user_agent):
                _send_new_device_alert(staff["username"], staff.get("email") or "", client_ip, user_agent)
            _set_auth_cookies(response, token, refresh)
            return {"token": token, "refreshToken": refresh, "user": {"username": staff["username"], "role": staff["role"], "permissions": perms}}

    # ── 3. Forum login (by email or username) ─────────────────────────────────
    identifier = body.email or body.username or ""
    if not identifier:
        raise HTTPException(400, "Email or username is required")

    if "@" in identifier:
        user = _find_user_by_ci("email", identifier, "*")
    else:
        user = _find_user_by_ci("username", identifier, "*")
        if not user:
            user = _find_user_by_ci("email", identifier, "*")

    if not user:
        raise HTTPException(400, "Invalid credentials")
    if not _verify(body.password, user["password_hash"]):
        _auth_log(user["username"], success=False, ip=client_ip, user_agent=user_agent,
                  role=user.get("role", ""), reason="wrong_password")
        raise HTTPException(400, "Invalid credentials")
    if user.get("banned"):
        _auth_log(user["username"], success=False, ip=client_ip, user_agent=user_agent,
                  role=user.get("role", ""), reason="account_suspended")
        raise HTTPException(403, f"Account suspended: {user.get('ban_reason', '')}")
    if not user.get("email_verified"):
        raise HTTPException(403, "Email not verified")

    # C3 — enforce 2FA for forum users too. The TOTP check was previously only
    # in the staff branch (and historically in the parallel forum_auth.py, since
    # retired and folded into this router), so a user who enabled 2FA could
    # still log in with password-only via this endpoint —
    # the primary login path used by the web app.
    if user.get("totp_enabled") and user.get("totp_secret"):
        _auth_log(user["username"], success=True, ip=client_ip, user_agent=user_agent,
                  role=user.get("role", ""), reason="2fa_required")
        return {
            "requires_2fa": True,
            "partial_token": make_token({
                "username": user["username"], "role": user.get("role", "user"),
                "id": user["id"], "tfa_pending": True,
            }, 5),
            "verify_path": "/auth/2fa/verify",
            "user_type": "forum",
        }

    _auth_log(user["username"], success=True, ip=client_ip, user_agent=user_agent,
              role=user.get("role", ""), reason="login_success")
    _record_user_activity(user["id"], user["username"], "login", f"IP: {client_ip}", client_ip)
    if _upsert_forum_session(user["id"], user["username"], client_ip, user_agent):
        _send_new_device_alert(user["username"], user.get("email") or "", client_ip, user_agent)
    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    refresh = make_refresh_token({"id": user["id"], "username": user["username"], "role": user.get("role", "user")}, 60 * 24 * 7)
    # H4 — persist the refresh token so /refresh can validate + rotate it.
    supabase.table("users").update({
        "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
    }).eq("id", user["id"]).execute()
    _set_auth_cookies(response, token, refresh)
    return {
        "token": token,
        "refreshToken": refresh,
        "user": {
            "id": user["id"], "username": user["username"],
            "email": user["email"], "role": user.get("role", "user"),
            "avatar": user.get("avatar", ""), "bio": user.get("bio", ""),
        },
    }

# ── Refresh token ── FIX #4: validate against DB ────────────────────────────────
@router.post("/refresh")
async def refresh(request: Request, response: Response, body: RefreshBody = RefreshBody()):
    # #2 — prefer HttpOnly cookie; fall back to body for older clients
    token_str = request.cookies.get("refresh_token") or body.refreshToken or ""
    if not token_str:
        raise HTTPException(401, "No refresh token provided")
    try:
        payload = _paseto_decode_token(token_str, purpose="auth")
        if not payload:
            raise HTTPException(401, "Invalid refresh token")
    except Exception:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("purpose") not in ("auth",) or payload.get("tfa_pending"):
        raise HTTPException(401, "Invalid refresh token")
    # H4 — access tokens must never be replayed as refresh tokens.
    if payload.get("token_type") == "access":
        raise HTTPException(401, "Access token cannot be used as a refresh token")

    user_id = payload.get("id")
    username = payload.get("username")

    if not user_id:
        if username != ADMIN_USERNAME:
            raise HTTPException(401, "Invalid refresh token")
    else:
        row = supabase.table("users").select("refresh_token,previous_refresh_token,refresh_rotated_at").eq("id", user_id).execute()
        stored = (row.data[0].get("refresh_token") if row.data else None) or ""
        previous = (row.data[0].get("previous_refresh_token") if row.data else None) or ""
        rotated_at = (row.data[0].get("refresh_rotated_at") if row.data else None) or None
        # Explicit revocation (logout / password reset) sets the stored token to
        # NULL — the session must stay dead.
        if not stored:
            raise HTTPException(401, "Refresh token revoked or invalid")
        # H4/020 — timing-safe compare against the CURRENT token. A matching
        # current token rotates normally (current -> previous, issue fresh).
        # A token matching the PREVIOUS generation is accepted ONLY within a
        # short grace window after the rotation — this keeps the two-tab
        # concurrent-refresh race working while bounding replay of a stolen,
        # rotated-out token to seconds instead of its full 7-day lifetime.
        refresh_accepted = _hmac.compare_digest(stored, token_str)
        if not refresh_accepted and previous:
            refresh_accepted = _hmac.compare_digest(previous, token_str)
            age_s = _REFRESH_ROTATION_GRACE + 1
            if rotated_at:
                try:
                    age_s = (datetime.now(timezone.utc) - datetime.fromisoformat(str(rotated_at))).total_seconds()
                except Exception:
                    age_s = _REFRESH_ROTATION_GRACE + 1
            if age_s > _REFRESH_ROTATION_GRACE:
                log.warning("auth refresh: rejecting rotated-out refresh token for user=%s (age=%.0fs)", user_id, age_s)
                refresh_accepted = False
            else:
                log.info("auth refresh: accepting previous-generation token within grace window (rotation race) for user=%s", user_id)
        if not refresh_accepted:
            raise HTTPException(401, "Invalid refresh token")

    new_access = make_token({k: v for k, v in payload.items() if k != "exp"})
    new_refresh = make_refresh_token({k: v for k, v in payload.items() if k != "exp"}, 60 * 24 * 7)
    # H4/020 — rotate server-side so a leaked/stolen token is invalid after one use.
    if user_id:
        supabase.table("users").update({
            "previous_refresh_token": token_str,
            "refresh_token": new_refresh,
            "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", user_id).execute()
    _set_auth_cookies(response, new_access, new_refresh)  # rotate both cookies
    return {"token": new_access, "refreshToken": new_refresh}

# ── Logout ──────────────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(request: Request, response: Response):
    auth_header = request.headers.get("authorization", "")
    token_str = auth_header.replace("Bearer ", "", 1) if auth_header.startswith("Bearer ") else ""
    try:
        user = _paseto_decode_token(token_str, purpose="auth") if token_str else {}
    except Exception:
        user = {}
    if user.get("id"):
        supabase.table("users").update({"refresh_token": None}).eq("id", user["id"]).execute()
    # M8 — the Set-Cookie used domain=COOKIE_DOMAIN (.aifazi.net); deletion MUST
    # match it, otherwise the browser treats the delete as a host-only cookie and
    # the domain-scoped auth_token/admin_session/refresh_token survive logout.
    response.delete_cookie("auth_token", path="/", domain=COOKIE_DOMAIN or None)
    response.delete_cookie("admin_session", path="/", domain=COOKIE_DOMAIN or None)
    response.delete_cookie("refresh_token", path="/", domain=COOKIE_DOMAIN or None)
    return {"message": "Logged out"}

# ── Verify token ───────────────────────────────────────────────────────────────
@router.get("/verify")
async def verify_token(user: dict = Depends(get_current_user)):
    access = resolve_staff_access(user)
    if not access:
        return {"valid": False, "user": {
            "username": user.get("username", ""),
            "role": user.get("role", "user"),
            "permissions": [],
            "staff_account": False,
        }}
    return {"valid": True, "user": {
        "username": access.get("username") or user.get("username"),
        "role": access.get("role") or user.get("role"),
        "permissions": normalize_permissions(access.get("permissions")),
        "staff_account": True,
    }}

@router.post("/session-migrate")
async def session_migrate(request: Request, response: Response, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """H4 — mint HttpOnly auth cookies for a valid Bearer-only session.

    Pre-migration sessions kept their JWT in localStorage and never had the
    auth_token/refresh_token cookies set. The frontend calls this once after a
    successful legacy-Bearer /auth/me so it can drop the localStorage token:
    the refresh_token cookie then keeps the session alive across reloads.
    """
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id") or payload.get("sub")
    if not user_id:
        raise HTTPException(400, "Token has no user id — re-login to migrate")
    token = make_forum_token(user_id, payload.get("username") or "", payload.get("role") or "user")
    refresh = make_refresh_token({"id": user_id, "username": payload.get("username") or "", "role": payload.get("role") or "user"}, 60 * 24 * 7)
    try:
        supabase.table("users").update({
            "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
        }).eq("id", user_id).execute()
    except Exception:
        pass
    _set_auth_cookies(response, token, refresh)
    return {"ok": True}

@router.get("/admin-gate-token")
async def admin_gate_token(response: Response, user: dict = Depends(require_staff)):
    """Issue a signed admin shell gate for already-authenticated staff accounts.

    Linked forum staff log in with the normal forum token, so they do not get the
    admin_session cookie from /auth/login. The Next.js middleware cannot read
    localStorage, so the Admin Portal button calls this endpoint before routing.
    """
    payload = {
        "username": user.get("username"),
        "role": user.get("role"),
        "id": user.get("id"),
        "staff_id": user.get("staff_id") or user.get("id"),
    }
    token = make_admin_gate_token(payload, 60 * 24 * 7)
    _set_admin_gate_cookie(response, token)
    return {"message": "Admin portal access ready"}

@router.get("/permissions")
async def permissions_catalog(_: dict = Depends(require_admin)):
    return {"modules": MODULES, "actions": list(ACTIONS), "presets": {k: normalize_permissions(v) for k, v in ROLE_PERMISSION_PRESETS.items()}}

# ── Get all staff ───────────────────────────────────────────────────────────────
@router.get("/staff")
async def get_staff(_: dict = Depends(require_admin)):
    res = supabase.table("users").select("id,username,email,role,created_at,last_seen,staff_permissions").in_("role", ["admin","moderator","editor","chat"]).limit(500).execute()
    return [_staff_public(r) for r in (res.data or [])]

@router.get("/staff/search-users")
async def search_staff_users(q: str = "", _: dict = Depends(require_admin)):
    query = safe_search_term(q)
    if len(query) < 2:
        return {"users": []}
    try:
        res = supabase.table("users").select("id,username,email,avatar,role,discord_id,discord_username,steam_id,steam_username").or_(
            f"username.ilike.%{query}%,email.ilike.%{query}%,discord_username.ilike.%{query}%,discord_id.ilike.%{query}%,steam_username.ilike.%{query}%"
        ).limit(10).execute()
        users = res.data or []
    except Exception:
        users = []
    return {"users": users}

# ── Create staff ────────────────────────────────────────────────────────────────
@router.post("/staff")
async def create_staff(body: StaffCreateBody, request: Request, admin: dict = Depends(require_admin)):
    if body.role not in ("moderator", "editor", "chat"):
        raise HTTPException(400, "Invalid role")
    perms = normalize_permissions(body.module_permissions or role_permissions(body.role))
    username = _clean_username(body.username or "")
    email = _normalized_email(str(body.email or ""))
    if not username or len(username) < 3:
        raise HTTPException(400, "Username is required")
    if email:
        _ensure_email_available(email)
    existing = supabase.table("users").select("id").ilike("username", username).limit(5).execute()
    if any((r.get("username") or "").lower() == username.lower() for r in (existing.data or [])):
        raise HTTPException(409, "Username already exists")
    payload = {"username": username, "email": email, "email_verified": False, "role": body.role, "created_by": "admin", "staff_permissions": perms}
    if not body.password or len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not email:
        raise HTTPException(400, "Email is required")
    payload["password_hash"] = _hash(body.password)
    res = supabase.table("users").insert(payload).execute()
    if email:
        await _queue_staff_email_verification("staff", email, staff_id=res.data[0]["id"])
    _audit(admin.get("username", "admin"), "staff_create", target=username, details={"role": body.role}, ip=request.client.host if request.client else "")
    return _staff_public(res.data[0])

# ── Update staff ────────────────────────────────────────────────────────────────
@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, body: StaffUpdateBody, _: dict = Depends(require_admin)):
    updates: dict = {}
    if body.username:  updates["username"]      = _clean_username(body.username)
    if body.email is not None:
        current = supabase.table("users").select("email,email_verified").eq("id", staff_id).limit(1).execute()
        current_row = (current.data or [{}])[0]
        email = _normalized_email(str(body.email))
        _ensure_email_available(email, exclude_staff_id=staff_id)
        updates["email"] = email
        updates["email_verified"] = bool(current_row.get("email_verified")) if email == _normalized_email(current_row.get("email") or "") else False
    if body.role:
        if body.role not in ("moderator", "editor", "chat"):
            raise HTTPException(400, "Invalid role")
        updates["role"] = body.role
    if body.module_permissions is not None:
        updates["staff_permissions"] = normalize_permissions(body.module_permissions)
    elif body.role:
        updates["staff_permissions"] = role_permissions(body.role)
    if body.password:
        updates["password_hash"] = _hash(body.password)
    if not updates:
        raise HTTPException(400, "Nothing to update")
    res = supabase.table("users").update(updates).eq("id", staff_id).execute()
    if not res.data:
        raise HTTPException(404, "Staff member not found")
    row = res.data[0]
    if body.email is not None and row.get("email") and not row.get("email_verified"):
        await _queue_staff_email_verification("staff", row["email"], staff_id=staff_id)
    return _staff_public(row)

# ── Delete staff ────────────────────────────────────────────────────────────────
@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, request: Request, admin: dict = Depends(require_admin)):
    row = supabase.table("users").select("username,role").eq("id", staff_id).execute()
    target_name = row.data[0]["username"] if row.data else staff_id
    supabase.table("users").update({"role": "member", "staff_permissions": {}}).eq("id", staff_id).execute()
    _audit(admin.get("username", "admin"), "staff_delete", target=target_name,
           details={}, ip=request.client.host if request.client else "")
    return {"message": "Deleted"}

# ── Admin self-update ── FIX #3: use _check_admin_password() ───────────────────
@router.put("/me")
async def update_self(body: AdminSelfUpdateBody, request: Request, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    client_ip = request.client.host if request.client else ""

    # ── Username change ──────────────────────────────────────────────────────
    if getattr(body, "newUsername", None):
        if not body.currentPassword or not _check_admin_password(body.currentPassword):
            raise HTTPException(400, "Current password incorrect")
        new_uname = body.newUsername.strip()
        if len(new_uname) < 3:
            raise HTTPException(400, "Username must be at least 3 characters")
        # Env-based admin login/display username is controlled by ADMIN_USERNAME.
        # Do not write username_override here; older production schemas may not have that column.
        _audit("admin", "admin_username_change", target=new_uname, ip=client_ip)
        return {
            "message": "Admin username is controlled by the deployment environment.",
            "env_note": "The login username is set by ADMIN_USERNAME in your Vercel environment variables. "
                        "Update that variable to '{new_uname}' to use it for login. "
                        "Until then, your old username still works for logging in.",
            "new_username": new_uname,
        }

    if body.email is not None:
        if body.currentPassword and not _check_admin_password(body.currentPassword):
            raise HTTPException(400, "Current password incorrect")
        email = _normalized_email(str(body.email))
        current = _get_admin_2fa() or {}
        current_email = _normalized_email(current.get("email") or "")
        _ensure_email_available(email, exclude_admin=True)
        email_verified = bool(current.get("email_verified")) if email == current_email else False
        _upsert_admin_2fa({"email": email, "email_verified": email_verified})
        if email and not email_verified:
            await _queue_staff_email_verification("admin", email, admin_username=ADMIN_USERNAME)
        _audit("admin", "admin_email_update", target=email, ip=client_ip)
        return {"message": "Email connected." if email_verified else "Email changed. Check your inbox to verify it.", "email": email, "email_verified": email_verified}

    # ── Password change ──────────────────────────────────────────────────────
    if body.newPassword:
        if not body.currentPassword or not _check_admin_password(body.currentPassword):
            raise HTTPException(400, "Current password incorrect")
        new_hash = _hash(body.newPassword)
        _audit("admin", "admin_password_change", ip=client_ip)
        return {"message": "Password updated."}
    return {"message": "No changes"}


# ── Active sessions — list, heartbeat, revoke ───────────────────────────────────
def _session_id_from_token(token_str: str) -> str | None:
    """Derive a stable session identifier from the PASETO token."""
    try:
        p = _paseto_decode_token(token_str, purpose="auth")
        if not p:
            return None
        return p.get("jti") or f"{p.get('username','?')}-{p.get('iat','?')}"
    except Exception:
        return None


@router.get("/sessions")
async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
    """Return all active sessions for the current user."""
    username = user.get("username")
    # Mark current session as active
    token_str = (request.headers.get("Authorization") or "").replace("Bearer ", "")
    try:
        rows = supabase.table("admin_sessions") \
            .select("*") \
            .eq("username", username) \
            .order("last_active", desc=True) \
            .execute()
        sessions = rows.data or []
        # Tag which one is current based on IP + user-agent match
        client_ip = request.client.host if request.client else ""
        ua = request.headers.get("user-agent", "")
        for s in sessions:
            s["current"] = (s.get("ip") == client_ip and s.get("user_agent") == ua)
        return {"sessions": sessions, "total": len(sessions)}
    except Exception as exc:
        return {"sessions": [], "total": 0, "error": str(exc)}


@router.post("/sessions/heartbeat")
async def session_heartbeat(request: Request, user: dict = Depends(get_current_user)):
    """Called periodically to keep session alive and detect conflicts."""
    username = user.get("username")
    client_ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    now = datetime.now(timezone.utc).isoformat()
    try:
        # Upsert this session
        existing = supabase.table("admin_sessions") \
            .select("id") \
            .eq("username", username) \
            .eq("ip", client_ip) \
            .eq("user_agent", ua) \
            .execute()
        if existing.data:
            supabase.table("admin_sessions") \
                .update({"last_active": now}) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
        else:
            supabase.table("admin_sessions").insert({
                "user_id":    user.get("id") or "admin",
                "username":   username,
                "role":       user.get("role", ""),
                "ip":         client_ip,
                "user_agent": ua,
                "last_active": now,
            }).execute()
        # Check for other concurrent sessions (logged in from another device)
        all_sessions = supabase.table("admin_sessions") \
            .select("id,ip,user_agent,last_active") \
            .eq("username", username) \
            .execute()
        others = [s for s in (all_sessions.data or [])
                  if not (s.get("ip") == client_ip and s.get("user_agent") == ua)]
        # Prune stale sessions (inactive > 30 min)
        stale_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        for s in others:
            if s.get("last_active", "") < stale_cutoff:
                supabase.table("admin_sessions").delete().eq("id", s["id"]).execute()
        active_others = [s for s in others if s.get("last_active", "") >= stale_cutoff]
        return {
            "ok": True,
            "concurrent_sessions": len(active_others),
            "conflict": len(active_others) > 0,
            "others": [{"ip": s["ip"], "last_active": s["last_active"]} for s in active_others],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, user: dict = Depends(get_current_user)):
    """Revoke a specific session by ID."""
    username = user.get("username")
    # Ensure user can only revoke their own sessions
    row = supabase.table("admin_sessions").select("username").eq("id", session_id).execute()
    if not row.data or row.data[0].get("username") != username:
        raise HTTPException(404, "Session not found")
    supabase.table("admin_sessions").delete().eq("id", session_id).execute()
    _audit(username, "session_revoked", target=session_id)
    return {"revoked": True}


@router.delete("/sessions")
async def revoke_all_other_sessions(request: Request, user: dict = Depends(get_current_user)):
    """Revoke all sessions except the current one."""
    username = user.get("username")
    client_ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    # Delete all sessions for this user EXCEPT current IP+UA
    all_rows = supabase.table("admin_sessions") \
        .select("id,ip,user_agent") \
        .eq("username", username) \
        .execute()
    to_delete = [s["id"] for s in (all_rows.data or [])
                 if not (s.get("ip") == client_ip and s.get("user_agent") == ua)]
    if to_delete:
        supabase.table("admin_sessions").delete().in_("id", to_delete).execute()
    _audit(username, "sessions_revoke_all", details={"count": len(to_delete)})
    return {"revoked": len(to_delete)}

# ── 2FA routes ─────────────────────────────────────────────────────────────────
@router.get("/2fa/status")
async def tfa_status(user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        row = _get_admin_2fa()
        return {
            "enabled": bool(row and row.get("enabled")),
            "recovery_codes": _has_recovery_codes("admin", ""),
        }
    res = supabase.table("users").select("totp_enabled").eq("id", user["id"]).execute()
    return {
        "enabled": bool(res.data and res.data[0].get("totp_enabled")),
        "recovery_codes": _has_recovery_codes("user", user["id"]),
    }

@router.post("/2fa/setup")
async def tfa_setup(user: dict = Depends(get_current_user)):
    secret = pyotp.random_base32()
    label  = user.get("username", ADMIN_USERNAME)
    uri    = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name="aifazi.net")
    if user.get("role") == "admin":
        _upsert_admin_2fa({"totp_secret": secret, "enabled": False})
    else:
        supabase.table("users").update(
            {"totp_secret": secret, "totp_enabled": False}
        ).eq("id", user["id"]).execute()
    return {"secret": secret, "otpauth_uri": uri, "qr_image": _make_qr_b64(uri)}

@router.post("/2fa/enable")
async def tfa_enable(body: TwoFAEnableBody, user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        row = _get_admin_2fa()
        if not row or not row.get("totp_secret"):
            raise HTTPException(400, "Call /2fa/setup first")
        if not pyotp.TOTP(row["totp_secret"]).verify(body.code, valid_window=1):
            raise HTTPException(400, "Invalid code")
        _upsert_admin_2fa({"enabled": True})
        recovery = _rotate_recovery_codes("admin", "")
    else:
        res = supabase.table("users").select("totp_secret").eq("id", user["id"]).execute()
        if not res.data or not res.data[0].get("totp_secret"):
            raise HTTPException(400, "Call /2fa/setup first")
        if not pyotp.TOTP(res.data[0]["totp_secret"]).verify(body.code, valid_window=1):
            raise HTTPException(400, "Invalid code")
        supabase.table("users").update({"totp_enabled": True}).eq("id", user["id"]).execute()
        recovery = _rotate_recovery_codes("user", user["id"])
    _audit(user.get("username"), "2fa_enabled")
    return {"enabled": True, "recovery_codes": recovery}

# Alias: frontend calls /2fa/confirm → same logic as /2fa/enable
@router.post("/2fa/confirm")
async def tfa_confirm(body: TwoFAEnableBody, user: dict = Depends(get_current_user)):
    return await tfa_enable(body, user)

@router.post("/2fa/disable")
async def tfa_disable(body: TwoFADisableBody, user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        if not _check_admin_password(body.password):
            raise HTTPException(400, "Invalid password")
        row = _get_admin_2fa()
        if row and row.get("enabled") and row.get("totp_secret"):
            if not _verify_2fa_entry("admin", "", row["totp_secret"], body.code):
                raise HTTPException(400, "Invalid 2FA code")
        _upsert_admin_2fa({"enabled": False, "totp_secret": None, "recovery_codes": None})
    else:
        res = supabase.table("users").select(
            "password_hash,totp_secret,totp_enabled"
        ).eq("id", user["id"]).execute()
        if not res.data:
            raise HTTPException(404, "Not found")
        s = res.data[0]
        if not _verify(body.password, s["password_hash"]):
            raise HTTPException(400, "Invalid password")
        if s.get("totp_enabled") and s.get("totp_secret"):
            if not _verify_2fa_entry("user", user["id"], s["totp_secret"], body.code):
                raise HTTPException(400, "Invalid 2FA code")
        supabase.table("users").update(
            {"totp_enabled": False, "totp_secret": None, "recovery_codes": None}
        ).eq("id", user["id"]).execute()
    _audit(user.get("username"), "2fa_disabled")
    return {"enabled": False}

class RecoveryCodesBody(BaseModel):
    password: str = ""
    code: str = ""

@router.post("/2fa/recovery-codes")
async def tfa_recovery_codes(body: RecoveryCodesBody, user: dict = Depends(get_current_user)):
    """Regenerate recovery codes. Requires the account password AND a valid 2FA
    entry (TOTP or an existing recovery code) so a stolen session alone can't
    mint new backup codes. Old codes are invalidated on success."""
    if user.get("role") == "admin":
        if not _check_admin_password(body.password):
            raise HTTPException(400, "Invalid password")
        row = _get_admin_2fa()
        secret = (row or {}).get("totp_secret")
        if secret and not _verify_2fa_entry("admin", "", secret, body.code):
            raise HTTPException(400, "Invalid 2FA code")
    else:
        res = supabase.table("users").select(
            "password_hash,totp_secret,totp_enabled"
        ).eq("id", user["id"]).execute()
        if not res.data:
            raise HTTPException(404, "Not found")
        s = res.data[0]
        if not _verify(body.password, s["password_hash"]):
            raise HTTPException(400, "Invalid password")
        if s.get("totp_enabled") and s.get("totp_secret"):
            if not _verify_2fa_entry("user", user["id"], s["totp_secret"], body.code):
                raise HTTPException(400, "Invalid 2FA code")
    codes = _rotate_recovery_codes("admin" if user.get("role") == "admin" else "user",
                                   "" if user.get("role") == "admin" else user["id"])
    _audit(user.get("username"), "2fa_recovery_codes_rotated")
    return {"recovery_codes": codes}

# 2FA brute-force lockout (distributed via Redis, in-memory fallback)
# The middleware rate limit keys on IP+path, so a distributed attacker can
# rotate IPs and keep guessing forever. Add a per-account sliding counter:
# 5 failed codes inside the window locks this account's 2FA for the rest of
# the window (15 minutes). A successful verify clears the counter.
from utils.rate_limit import (
    _2fa_clear_fails_redis as _2fa_clear_fails,
)
from utils.rate_limit import (
    _2fa_locked_redis as _2fa_locked,
)
from utils.rate_limit import (
    _2fa_record_fail_redis as _2fa_record_fail,
)


@router.post("/2fa/verify")
async def tfa_verify(body: TwoFAVerifyBody, request: Request, response: Response):
    try:
        payload = _paseto_decode_token(body.partial_token, purpose="auth")
        if not payload:
            raise HTTPException(401, "Invalid or expired token")
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    if not payload.get("tfa_pending"):
        raise HTTPException(400, "Not a 2FA challenge token")
    username = payload.get("username") or "unknown"
    role     = payload.get("role")
    user_id  = payload.get("id")
    ip = request.client.host if request.client else ""
    if _2fa_locked(username):
        raise HTTPException(429, "Too many failed 2FA attempts. Try again later.")
    if role == "admin":
        row = _get_admin_2fa()
        if not row or not row.get("totp_secret"):
            raise HTTPException(500, "2FA not configured on server")
        if not _verify_2fa_entry("admin", "", row["totp_secret"], body.code):
            _2fa_record_fail(username)
            _audit(username, "2fa_failed", ip=ip)
            raise HTTPException(400, "Invalid code")
        token   = make_token({"username": username, "role": role})
        refresh = make_refresh_token({"username": username, "role": role}, 60 * 24 * 7)
        # H4 — mint the admin tokens with the forum id so /refresh can validate
        # + rotate + revoke them like any other account. Without id the refresh
        # check skips the DB and a leaked token can never be invalidated.
        forum_id = None
        try:
            fr = supabase.table("users").select("id").eq("username", ADMIN_USERNAME).limit(1).execute()
            if fr.data:
                forum_id = fr.data[0]["id"]
        except Exception:
            pass
        token = make_token({"username": username, "role": role, "id": forum_id})
        refresh = make_refresh_token({"username": username, "role": role, "id": forum_id}, 60 * 24 * 7)
        if forum_id:
            try:
                supabase.table("users").update({
                    "refresh_token": refresh,
                    "refresh_rotated_at": datetime.now(timezone.utc).isoformat(),
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                }).eq("id", forum_id).execute()
            except Exception:
                pass
        _2fa_clear_fails(username)
        _audit(username, "admin_login_2fa", target="admin_panel", ip=ip)
        if forum_id and _upsert_forum_session(forum_id, username, ip, request.headers.get("user-agent", "")):
            _send_new_device_alert(username, (row or {}).get("email") or f"{ADMIN_USERNAME}@aifazi.net", ip, request.headers.get("user-agent", ""))
        _set_auth_cookies(response, token, refresh)  # #1 #2
        return {"token": token, "refreshToken": refresh, "user": {"username": username, "role": role}}
    else:
        res = supabase.table("users").select("*").eq("id", user_id).execute()
        if not res.data:
            raise HTTPException(404, "User not found")
        s = res.data[0]
        if not _verify_2fa_entry("user", user_id, s["totp_secret"], body.code):
            _2fa_record_fail(username)
            _audit(username, "2fa_failed", ip=ip)
            raise HTTPException(400, "Invalid code")
        token   = make_token({"username": s["username"], "role": s["role"], "id": s["id"]})
        refresh = make_refresh_token({"username": s["username"], "role": s["role"], "id": s["id"]}, 60 * 24 * 7)
        supabase.table("users").update({
            "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
        }).eq("id", s["id"]).execute()
        _2fa_clear_fails(username)
        _audit(username, "staff_login_2fa", target="admin_panel", ip=ip)
        if _upsert_forum_session(s["id"], s["username"], ip, request.headers.get("user-agent", "")):
            _send_new_device_alert(s["username"], s.get("email") or "", ip, request.headers.get("user-agent", ""))
        _set_auth_cookies(response, token, refresh)  # #1 #2
        return {"token": token, "refreshToken": refresh, "user": {"username": username, "role": role}}

# -- Config check -- � verify Vercel env vars (protected by CRON_SECRET) ----------
@router.get("/config-check")
async def config_check(request: Request, _=Depends(require_admin)):
    """Admin-only diagnostic — reveals no secret values."""
    pw = ADMIN_PASSWORD
    bcrypt_ok = False
    bcrypt_error = None
    try:
        test_hash = _bcrypt.hashpw(b"test", _bcrypt.gensalt())
        bcrypt_ok = _bcrypt.checkpw(b"test", test_hash)
    except Exception as exc:
        bcrypt_error = str(exc)

    return {
        "admin_password_is_set": bool(pw),
        "jwt_secret_is_set":  bool(SECRET),
        "bcrypt_working":     bcrypt_ok,
        "bcrypt_error":       bcrypt_error,
    }

# ── Forum auth endpoints ────────────────────────────────────────────────────────

@router.get("/check-username")
async def check_username(username: str):
    username = (username or "").strip()
    if not username or len(username) < 3:
        return {"available": False, "suggestion": None}
    taken = bool(_username_owner(username))
    if not taken:
        return {"available": True, "suggestion": None}
    import re as _re
    base = _re.sub(r"\d+$", "", username)[:28]
    for n in range(1, 100):
        candidate = f"{base}{n}"
        if not _find_user_by_ci("username", candidate, "id,username"):
            return {"available": False, "suggestion": candidate}
    return {"available": False, "suggestion": None}

@router.get("/check-email")
async def check_email(email: EmailStr, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    access = resolve_staff_access(payload)
    owner = _email_owner(
        str(email),
        exclude_forum_user_id=payload.get("id"),
        exclude_staff_id=(access or {}).get("staff_id") if access and not (access or {}).get("forum_user_id") else None,
        exclude_admin=bool(access and access.get("role") == "admin" and not payload.get("id")),
    )
    return {"available": owner is None}

@router.post("/resend-verification")
async def resend_verification(body: ResendBody):
    identifier = body.email.strip()
    if "@" in identifier:
        res = supabase.table("users").select("*").eq("email", identifier).execute()
    else:
        res = supabase.table("users").select("*").eq("username", identifier).execute()
    # Anti-enumeration: always answer with the same generic message whether the
    # account exists, is verified, or does not exist at all.
    if not res.data or res.data[0].get("email_verified"):
        return {"message": "If that account exists, a verification link was sent"}
    user = res.data[0]
    verify_token = secrets.token_urlsafe(32)
    verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    supabase.table("users").update({"verify_token": verify_token, "verify_expires": verify_expires}).eq("id", user["id"]).execute()
    verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
    await _queue_activation_email(user["email"], verify_url, user.get("username") or "")
    return {"message": "If that account exists, a verification link was sent"}

# ── Verify status (used by the "waiting for activation" screen on /login) ──────
@router.get("/verify-status")
async def verify_status(email: str):
    """Return whether the account for this email has been verified yet.
    The /login VerifyWaiting screen polls this every 3s after registration and
    auto-advances once the user clicks the email link."""
    res = supabase.table("users").select("email_verified").ilike("email", email.strip()).limit(1).execute()
    verified = bool(res.data and res.data[0].get("email_verified"))
    return {"verified": verified}

@router.post("/register")
async def register(body: RegisterBody):
    pw = body.password
    if len(pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    email = _normalized_email(str(body.email))
    username = _clean_username(body.username)
    email_owner = _find_user_by_ci("email", email, "id,email,email_verified")
    if email_owner:
        # Anti-enumeration: an existing email must not reveal whether it is
        # verified or whether the account is complete. If the email was already
        # registered but never activated, re-send the activation link; either
        # way respond with a generic "registered" success so the client shows
        # the standard "check your email" screen for both outcomes.
        existing = email_owner
        if not existing.get("email_verified"):
            verify_token = secrets.token_urlsafe(32)
            verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
            supabase.table("users").update({"verify_token": verify_token, "verify_expires": verify_expires}).eq("id", existing["id"]).execute()
            verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
            await _queue_activation_email(email, verify_url, existing.get("username") or "")
        return {"message": "Registered — check your email to verify"}
    if _find_user_by_ci("username", username, "id,username"):
        # Same generic response as a successful registration: do not reveal
        # which field collided (username/email) to a probing caller.
        raise HTTPException(409, "That username or email is already registered")
    verify_token = secrets.token_urlsafe(32)
    verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    try:
        hashed = _hash(pw)
    except Exception:
        raise HTTPException(400, "Password could not be processed.")
    res = supabase.table("users").insert({
        "username": username, "email": email, "password_hash": hashed,
        "verify_token": verify_token, "verify_expires": verify_expires,
    }).execute()
    verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
    await _queue_activation_email(email, verify_url, username)
    return {"message": "Registered — check your email to verify"}

@router.post("/forgot")
async def forgot(body: ForgotBody):
    identifier = body.identifier.strip()
    if not identifier:
        return {"message": "If that account exists, a reset link was sent"}
    if "@" in identifier:
        res = supabase.table("users").select("id,email,username").eq("email", identifier).execute()
    else:
        res = supabase.table("users").select("id,email,username").eq("username", identifier).execute()
        if not res.data:
            res = supabase.table("users").select("id,email,username").eq("email", identifier).execute()
    if not res.data:
        return {"message": "If that account exists, a reset link was sent"}
    user = res.data[0]
    reset_token = secrets.token_urlsafe(32)
    reset_expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    supabase.table("users").update({"reset_token": reset_token, "reset_expires": reset_expires}).eq("id", user["id"]).execute()
    reset_url = f"{SITE_URL}/forum/reset?token={reset_token}"
    subject, html = render_template("password_reset", {
        "site_name": "aifazi.net", "username": user.get("username") or "there", "reset_link": reset_url, "expires_in": "1 hour",
    })
    await queue_email(user["email"], subject or "Reset your password - aifazi.net",
                      html or _reset_email_html(reset_url), f"Reset your aifazi.net password: {reset_url}", "password_reset")
    return {"message": "If that account exists, a reset link was sent"}

@router.post("/find-username")
async def find_username(body: FindUsernameBody):
    res = supabase.table("users").select("id,email,username").eq("email", body.email.strip()).execute()
    if res.data:
        user = res.data[0]
        await queue_email(user["email"], "Your username - aifazi.net", _find_username_email_html(user["username"]), f"Your aifazi.net username is: {user['username']}")
    return {"message": "If that email is registered, your username has been sent to your inbox."}

@router.post("/reset")
async def reset(body: ResetBody):
    res = supabase.table("users").select("*").eq("reset_token", body.token).execute()
    if not res.data:
        raise HTTPException(400, "Invalid or expired token")
    user = res.data[0]
    expires = datetime.fromisoformat(user["reset_expires"].replace("Z", "+00:00"))
    if expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Token expired")
    hashed = _hash(body.password)
    # C3 — revoke any previously-issued refresh token on password change so a
    # stolen/old refresh cookie can't silently re-login after a reset.
    supabase.table("users").update({
        "password_hash": hashed, "reset_token": None, "reset_expires": None,
        "refresh_token": None,
    }).eq("id", user["id"]).execute()
    return {"message": "Password reset successfully"}

@router.get("/me")
async def get_current_user_profile(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = _paseto_decode_token(creds.credentials, purpose="auth")
        if not payload:
            raise HTTPException(401, "Invalid or expired token")
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user_id = payload.get("id")
    if not user_id:
        return _staff_profile_from_payload(payload)
    res = supabase.table("users").select(
        "id,username,email,role,avatar,bio,email_verified,banned,created_at,last_seen,"
        "discord_id,discord_username,discord_avatar,steam_id,steam_username,steam_avatar,"
        "github_id,github_username,github_avatar,totp_enabled,"
        "pending_email,pending_email_verified"
    ).eq("id", user_id).execute()
    if not res.data:
        if payload.get("role") in ("admin", "moderator", "editor", "chat"):
            return _staff_profile_from_payload(payload)
        raise HTTPException(404, "User not found")
    u = res.data[0]
    pw_res = supabase.table("users").select("password_hash").eq("id", user_id).limit(1).execute()
    has_password = bool(pw_res.data and pw_res.data[0].get("password_hash"))
    staff_access = resolve_staff_access({**payload, "id": u["id"], "username": u.get("username"), "email": u.get("email")})
    steam_hex = _steam64_to_hex(u.get("steam_id"))
    return {
        "_id": u["id"], "username": u["username"], "email": u["email"],
        "pending_email": u.get("pending_email") or None,
        "role": (staff_access or {}).get("role") or u["role"],
        "avatar": u.get("avatar", ""), "bio": u.get("bio", ""),
        "email_verified": u.get("email_verified", False), "has_password": has_password,
        "banned": u.get("banned", False), "created_at": u.get("created_at"), "createdAt": u.get("created_at"),
        "last_seen": u.get("last_seen"), "lastSeen": u.get("last_seen"),
        "discord_id": u.get("discord_id"), "discord_username": u.get("discord_username"), "discord_avatar": u.get("discord_avatar"),
        "steam_id": u.get("steam_id"), "steam_username": u.get("steam_username"), "steam_avatar": u.get("steam_avatar"),
        "github_id": u.get("github_id"), "github_username": u.get("github_username"), "github_avatar": u.get("github_avatar"),
        "steam_hex": steam_hex, "active_identity_locked": _active_identity_locked(u["id"]),
        "two_factor_enabled": bool(u.get("totp_enabled")),
        "_staff": bool(staff_access), "staff_account": bool(staff_access),
        "admin_access": bool(staff_access and staff_access.get("role") == "admin"),
        "staff_id": (staff_access or {}).get("staff_id"),
        "permissions": normalize_permissions((staff_access or {}).get("permissions")),
        "module_permissions": normalize_permissions((staff_access or {}).get("permissions")),
        "account_source": "linked_staff" if staff_access else "forum",
    }

@router.put("/profile")
async def update_profile(body: ProfileBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    username = _clean_username(body.username)
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters.")
    user_id = payload.get("id")
    access = resolve_staff_access(payload)
    if access and access.get("role") == "admin" and not user_id:
        admin_name = os.getenv("ADMIN_USERNAME", "admin")
        patch = {"profile_bio": (body.bio or "").strip()[:1000], "profile_avatar": (body.avatar or "").strip()[:500], "updated_at": datetime.now(timezone.utc).isoformat()}
        if body.email is not None:
            email = _normalized_email(str(body.email))
            current = supabase.table("admin_2fa").select("email,email_verified").eq("username", admin_name).limit(1).execute()
            current_row = (current.data or [{}])[0]
            current_email = _normalized_email(current_row.get("email") or "")
            _ensure_email_available(email, exclude_admin=True)
            patch["email"] = email
            patch["email_verified"] = bool(current_row.get("email_verified")) if email == current_email else False
        cur = supabase.table("admin_2fa").select("id").eq("username", admin_name).limit(1).execute()
        if cur.data:
            supabase.table("admin_2fa").update(patch).eq("username", admin_name).execute()
        else:
            supabase.table("admin_2fa").insert({"username": admin_name, **patch}).execute()
        if body.email is not None and patch.get("email") and not patch.get("email_verified"):
            await _queue_staff_email_verification("admin", patch["email"], admin_username=admin_name)
        return {"ok": True, "email_verification_sent": bool(body.email is not None and patch.get("email") and not patch.get("email_verified")), "user": _staff_profile_from_payload(payload)}
    if access and access.get("staff_id") and not access.get("forum_user_id"):
        patch = {"username": username, "profile_bio": (body.bio or "").strip()[:1000], "profile_avatar": (body.avatar or "").strip()[:500], "last_seen": datetime.now(timezone.utc).isoformat()}
        if body.email is not None:
            email = _normalized_email(str(body.email))
            current = supabase.table("users").select("email,email_verified").eq("id", access["staff_id"]).limit(1).execute()
            current_row = (current.data or [{}])[0]
            current_email = _normalized_email(current_row.get("email") or "")
            _ensure_email_available(email, exclude_staff_id=access["staff_id"])
            patch["email"] = email
            patch["email_verified"] = bool(current_row.get("email_verified")) if email == current_email else False
        res = supabase.table("users").update(patch).eq("id", access["staff_id"]).execute()
        if not res.data:
            raise HTTPException(404, "Staff user not found")
        if body.email is not None and patch.get("email") and not patch.get("email_verified"):
            await _queue_staff_email_verification("staff", patch["email"], staff_id=access["staff_id"])
        return {"ok": True, "email_verification_sent": bool(body.email is not None and patch.get("email") and not patch.get("email_verified")), "user": _staff_profile_from_payload({**payload, "username": username})}
    if not user_id:
        raise HTTPException(400, "A user profile is required")
    owner = _username_owner(username, user_id)
    if owner:
        raise HTTPException(409, "Username is already taken.")
    current = supabase.table("users").select("email").eq("id", user_id).limit(1).execute()
    current_email = _normalized_email((current.data or [{}])[0].get("email") or "")
    patch = {"username": username, "bio": (body.bio or "").strip()[:1000], "avatar": (body.avatar or "").strip()[:500], "last_seen": datetime.now(timezone.utc).isoformat()}
    email_changed = False
    if body.email is not None:
        email = _normalized_email(str(body.email))
        if email != current_email:
            _ensure_email_available(email, exclude_forum_user_id=user_id)
            patch.update({"pending_email": email, "pending_email_verified": False})
            email_changed = True
            patch.pop("email", None)
    if body.email is not None and not email_changed and current_email:
        patch["pending_email"] = None
        patch["pending_email_verified"] = None
    res = supabase.table("users").update(patch).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    user = res.data[0]
    if email_changed:
        verify_token = secrets.token_urlsafe(32)
        verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        supabase.table("users").update({"verify_token": verify_token, "verify_expires": verify_expires}).eq("id", user_id).execute()
        verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
        await _queue_activation_email(email, verify_url)
    _record_user_activity(user_id, username, "profile_update")
    return {"ok": True, "email_verification_sent": email_changed, "user": {"_id": user["id"], "id": user["id"], "username": user["username"], "email": user.get("email"), "pending_email": user.get("pending_email") or None, "email_verified": user.get("email_verified", False), "role": (access or {}).get("role") or user.get("role", "user"), "avatar": user.get("avatar") or "", "bio": user.get("bio") or "", "_staff": bool(access), "staff_account": bool(access), "permissions": normalize_permissions((access or {}).get("permissions"))}}

_AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_AVATAR_MAGIC = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),
]

@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    """Upload a profile avatar image (image/jpeg|png|gif|webp, max 5 MB).

    Reuses the shared CDN media upload (upload_media) so avatars land in the
    active provider, then points users.avatar at the public URL.
    """
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")

    content = await file.read()
    if len(content) > _AVATAR_MAX_BYTES:
        raise HTTPException(413, "Avatar image must be 5 MB or smaller")
    if not content:
        raise HTTPException(400, "Empty file")

    mimetype = ''
    for magic, mime in _AVATAR_MAGIC:
        if content.startswith(magic):
            if magic == b"RIFF" and len(content) >= 12:
                mimetype = "image/webp" if content[8:12] == b"WEBP" else ''
            else:
                mimetype = mime
            break
    if not mimetype:
        raise HTTPException(415, "Avatar must be a JPEG, PNG, GIF, or WebP image (SVG is not allowed)")

    user_id = payload.get("id")
    access = resolve_staff_access(payload)
    if access and access.get("role") == "admin" and not user_id:
        admin_name = os.getenv("ADMIN_USERNAME", "admin")
        raise HTTPException(400, "Admin avatars are configured in the staff profile settings")
    if access and access.get("staff_id") and not access.get("forum_user_id"):
        target_id = access["staff_id"]
        col = "profile_avatar"
    else:
        if not user_id:
            raise HTTPException(400, "A user profile is required")
        target_id = user_id
        col = "avatar"

    safe = (file.filename or 'img').replace('\\', '/').rsplit('/', 1)[-1].replace('..', '').replace('/', '_')[:60] or 'img'
    filename = f"avatar_{secrets.token_hex(8)}_{safe}"
    from routers.cdn_upload import upload_media
    url, storage_path, provider = await upload_media(
        content, filename, mimetype, folder="avatars"
    )

    res = supabase.table("users").update({col: url[:500]}).eq("id", target_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")

    return {
        "ok": True,
        "url": url,
        "storage_path": storage_path,
        "provider": provider,
        "user": {"_id": res.data[0]["id"], "id": res.data[0]["id"], "username": res.data[0].get("username"), "avatar": res.data[0].get("avatar") or ""},
    }

@router.post("/change-password")
async def change_password(body: ChangePasswordBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if not body.new_password or len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    access = resolve_staff_access(payload)
    user_id = payload.get("id")
    if access and access.get("role") == "admin" and not user_id:
        admin_pw = os.getenv("ADMIN_PASSWORD", "")
        ok = False
        if admin_pw.startswith(("$2b$", "$2a$", "$2y$")):
            ok = _verify(body.current_password or "", admin_pw)
        else:
            ok = _hmac.compare_digest((body.current_password or "").encode(), admin_pw.encode())
        if not ok:
            raise HTTPException(400, "Current password incorrect")
        _row = _get_admin_2fa()
        if _row and _row.get("enabled") and _row.get("totp_secret"):
            if not _verify_2fa_entry("admin", "", _row["totp_secret"], body.code):
                raise HTTPException(400, "2FA code required to change password")
        return {"message": "Password hash generated. Update ADMIN_PASSWORD in Vercel.", "bcrypt_hash": _hash(body.new_password)}
    if access and access.get("staff_id") and not access.get("forum_user_id"):
        row = supabase.table("users").select("password_hash,totp_secret,totp_enabled").eq("id", access["staff_id"]).limit(1).execute()
        if not row.data or not _verify(body.current_password or "", row.data[0].get("password_hash") or ""):
            raise HTTPException(400, "Current password incorrect")
        if row.data[0].get("totp_enabled") and row.data[0].get("totp_secret"):
            if not _verify_2fa_entry("user", access["staff_id"], row.data[0]["totp_secret"], body.code):
                raise HTTPException(400, "2FA code required to change password")
        supabase.table("users").update({"password_hash": _hash(body.new_password), "refresh_token": None, "previous_refresh_token": None}).eq("id", access["staff_id"]).execute()
        return {"message": "Password updated"}
    if not user_id:
        raise HTTPException(400, "A user account is required")
    row = supabase.table("users").select("password_hash,totp_secret,totp_enabled").eq("id", user_id).limit(1).execute()
    if not row.data or not _verify(body.current_password or "", row.data[0].get("password_hash") or ""):
        raise HTTPException(400, "Current password incorrect")
    if row.data[0].get("totp_enabled") and row.data[0].get("totp_secret"):
        if not _verify_2fa_entry("user", user_id, row.data[0]["totp_secret"], body.code):
            raise HTTPException(400, "2FA code required to change password")
    supabase.table("users").update({"password_hash": _hash(body.new_password), "refresh_token": None, "previous_refresh_token": None}).eq("id", user_id).execute()
    _record_user_activity(user_id, payload.get("username", ""), "password_change")
    return {"message": "Password updated"}

@router.delete("/account")
async def delete_own_account(body: DeleteAccountBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Delete the authenticated user's account. Requires password re-confirmation
    for password-based accounts. OAuth-only accounts (no password) require the
    user to set a password first via /auth/change-password."""
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    row = supabase.table("users").select("id,username,password_hash").eq("id", payload["id"]).execute()
    if not row.data:
        raise HTTPException(404, "User not found")
    user = row.data[0]
    # Require password re-confirmation before destructive account deletion
    if not body.password:
        raise HTTPException(400, "Password confirmation is required to delete your account")
    if not user.get("password_hash"):
        raise HTTPException(400, "OAuth-only accounts must set a password before deletion. Use /auth/change-password first.")
    if not _verify(body.password, user["password_hash"]):
        raise HTTPException(400, "Password incorrect")
    for table in ("forum_sessions", "user_activity_logs"):
        try:
            supabase.table(table).delete().eq("user_id", user["id"]).execute()
        except Exception:
            pass
    try:
        supabase.table("users").delete().eq("id", user["id"]).execute()
    except Exception:
        raise HTTPException(409, "Account has linked content and could not be deleted automatically")
    return {"deleted": True}

async def _verify_email_token(token: str):
    res = supabase.table("users").select("*").eq("verify_token", token).execute()
    if not res.data:
        try:
            payload = _paseto_decode_token(token, purpose="email_verify")
            if not payload:
                raise HTTPException(400, "Invalid or expired token")
        except Exception:
            raise HTTPException(400, "Invalid or expired token")
        if payload.get("purpose") != "email_verify":
            raise HTTPException(400, "Invalid or expired token")
        email = _normalized_email(payload.get("email") or "")
        source = payload.get("source")
        if source == "staff" and payload.get("staff_id"):
            supabase.table("users").update({"email_verified": True}).eq("id", payload["staff_id"]).eq("email", email).execute()
            return {"message": "Email verified"}
        if source == "admin":
            admin_name = payload.get("admin_username") or os.getenv("ADMIN_USERNAME", "admin")
            supabase.table("admin_2fa").update({"email_verified": True}).eq("username", admin_name).eq("email", email).execute()
            return {"message": "Email verified"}
        raise HTTPException(400, "Invalid or expired token")
    user = res.data[0]
    expires = datetime.fromisoformat(user["verify_expires"].replace("Z", "+00:00"))
    if expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Token expired")
    update_patch = {"email_verified": True, "verify_token": None, "verify_expires": None}
    if user.get("pending_email"):
        update_patch["email"] = user["pending_email"]
        update_patch["pending_email"] = None
        update_patch["pending_email_verified"] = None
    supabase.table("users").update(update_patch).eq("id", user["id"]).execute()
    return {"message": "Email verified"}

@router.post("/forgot-password")
async def forgot_password_alias(body: ForgotBody):
    return await forgot(body)

@router.post("/reset-password/{token}")
async def reset_password_alias(token: str, body: dict):
    password = body.get("password", "")
    if not password or len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    return await reset(ResetBody(token=token, password=password))

@router.get("/verify-email")
async def verify_email_query(token: str):
    return await _verify_email_token(token)

@router.get("/verify-email/{token}")
async def verify_email_alias(token: str):
    return await _verify_email_token(token)

@router.get("/activity")
async def user_activity_log(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    try:
        rows = supabase.table("user_activity_logs").select("action,detail,ip,created_at").eq("user_id", payload["id"]).order("created_at", desc=True).limit(50).execute()
        return rows.data or []
    except Exception:
        return []

@router.get("/my-tickets")
async def user_my_tickets(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_res = supabase.table("users").select("email").eq("id", payload["id"]).execute()
    email = (user_res.data[0].get("email", "") if user_res.data else "") or ""
    user_id = payload.get("id", "")
    select_cols = "id,ticket_id,subject,status,priority,created_at,updated_at,response,responded_at,category,email,user_id"
    seen: dict[str, dict] = {}
    try:
        res = supabase.table("helpdesk_tickets").select(select_cols).eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()
        for t in (res.data or []):
            if t["id"] in seen:
                continue
            t_uid = str(t.get("user_id") or "")
            t_em = (t.get("email") or "").strip().lower()
            if t_uid and t_em:
                if t_uid == user_id and t_em == email.lower():
                    seen[t["id"]] = t
            elif t_uid and t_uid == user_id or t_em and t_em == email.lower():
                seen[t["id"]] = t
    except Exception:
        pass
    if email:
        try:
            res_email = supabase.table("helpdesk_tickets").select(select_cols).eq("email", email).order("created_at", desc=True).limit(100).execute()
            for t in (res_email.data or []):
                if t["id"] in seen:
                    continue
                t_uid = str(t.get("user_id") or "")
                t_em = (t.get("email") or "").strip().lower()
                if t_uid and t_em:
                    if t_uid == user_id and t_em == email.lower():
                        seen[t["id"]] = t
                elif t_uid and t_uid == user_id or t_em and t_em == email.lower():
                    seen[t["id"]] = t
        except Exception:
            pass
    tickets = sorted(seen.values(), key=lambda t: t.get("created_at", ""), reverse=True)
    for t in tickets:
        t.pop("email", None)
        t.pop("user_id", None)
    return tickets

@router.get("/discord/login")
async def discord_login(dest: str = "/forum/profile", mobile: int = 0):
    _DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
    if not _DISCORD_CLIENT_ID:
        raise HTTPException(500, "Discord OAuth not configured — set DISCORD_CLIENT_ID")
    # C2 — Sign the dest into the OAuth state so the callback can verify state hasn't
    # been tampered with and the dest is a same-origin relative path. The previous
    # implementation just sent `dest` as the state verbatim → open redirect + login-CSRF.
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    state = make_oauth_state("discord", safe_dest, mobile=bool(mobile))
    return _Redir(_discord_oauth_url(state))

@router.get("/discord/connect-url")
async def discord_connect_url(dest: str = "/profile", creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    _DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
    if not _DISCORD_CLIENT_ID:
        raise HTTPException(500, "Discord OAuth not configured — set DISCORD_CLIENT_ID")
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    link_token = _make_discord_link_token(payload["id"])
    # C2 — connect-mode state carries the signed link_token (already CSRF-safe), so we
    # only need to sanitise the dest before bundling it.
    safe_dest = _safe_relative_path(dest, default="/profile")
    state = f"connect:{link_token}:{safe_dest}"
    return {"url": _discord_oauth_url(state)}

@router.get("/discord/callback")
async def discord_callback(code: str = None, state: str = None, error: str = None):
    _DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
    _DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
    _DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", f"{os.getenv('API_URL', 'https://api.aifazi.net')}/api/auth/discord/callback")
    state_value = _urlparse.unquote(state or "") if state else ""
    dest = "/forum/profile"
    mode = "login"
    link_payload = None
    _st = {"dest": dest, "mobile": False}
    if state_value.startswith("connect:"):
        parts = state_value.split(":", 2)
        if len(parts) != 3:
            return _Redir(f"{SITE_URL}/profile?discord_error=link")
        mode = "connect"
        link_payload = _decode_discord_link_token(parts[1])
        dest = _safe_relative_path(parts[2], default="/forum/profile")
        if not link_payload:
            return _Redir(f"{SITE_URL}/profile?discord_error=link")
    else:
        # C2 — verify the signed state token. Fail closed on any mismatch (login-CSRF).
        try:
            _st = verify_oauth_state_full(state_value, "discord")
            dest = _st["dest"]
        except ValueError:
            front = SITE_URL
            return _Redir(f"{front}/login?discord_error=state")
    front = SITE_URL
    # Mobile flows carry `m` inside the signed state — so only flows the server
    # explicitly started with mobile=1 can redirect to the aifazi:// deep link.
    if _st.get("mobile"):
        front = f"{MOBILE_AUTH_URL}/discord"
    # Mobile targets strip the web-only `/login` path so the app sees a clean
    # `aifazi:///oauth/callback/discord?/...#...` URL under the redirect base.
    m_login = "" if _st.get("mobile") else "/login"
    if error or not code:
        return _Redir(f"{front}{m_login}?discord_error=1")
    if not _httpx:
        return _Redir(f"{front}{m_login}?discord_error=cfg")
    try:
        async with _httpx.AsyncClient() as c:
            tok = await c.post("https://discord.com/api/oauth2/token", data={
                "client_id": _DISCORD_CLIENT_ID, "client_secret": _DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code", "code": code, "redirect_uri": _DISCORD_REDIRECT_URI,
            }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=10)
        if tok.status_code != 200:
            return _Redir(f"{front}{m_login}?discord_error=2")
        access_token = tok.json().get("access_token")
    except Exception:
        return _Redir(f"{front}{m_login}?discord_error=2")
    try:
        async with _httpx.AsyncClient() as c:
            me = await c.get("https://discord.com/api/users/@me", headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        if me.status_code != 200:
            return _Redir(f"{front}{m_login}?discord_error=3")
        d = me.json()
        discord_id = str(d["id"])
        discord_username = d.get("username", "")
        discord_avatar = f"https://cdn.discordapp.com/avatars/{discord_id}/{d['avatar']}.png" if d.get("avatar") else f"https://cdn.discordapp.com/embed/avatars/{int(discord_id) % 5}.png"
        discord_email = d.get("email", "")
    except Exception:
        return _Redir(f"{front}{m_login}?discord_error=3")
    try:
        if mode == "connect":
            current_user_id = link_payload["id"]
            if _active_identity_locked(current_user_id):
                safe_dest = dest if str(dest).startswith("/") else "/profile"
                sep = "&" if "?" in safe_dest else "?"
                return _Redir(f"{front}{safe_dest}{sep}discord_error=identity_locked")
            ex = supabase.table("users").select("id,username").eq("discord_id", discord_id).execute()
            if ex.data and ex.data[0]["id"] != current_user_id:
                safe_dest = dest if str(dest).startswith("/") else "/profile"
                sep = "&" if "?" in safe_dest else "?"
                return _Redir(f"{front}{safe_dest}{sep}discord_error=duplicate")
            row = supabase.table("users").select("*").eq("id", current_user_id).execute()
            if not row.data:
                return _Redir(f"{front}/login?discord_error=missing")
            user = row.data[0]
            supabase.table("users").update({
                "discord_username": discord_username, "discord_avatar": discord_avatar,
                "last_seen": datetime.now(timezone.utc).isoformat(), "discord_id": discord_id,
            }).eq("id", current_user_id).execute()
            user = {**user, "discord_id": discord_id, "discord_username": discord_username, "discord_avatar": discord_avatar}
        else:
            ex = supabase.table("users").select("*").eq("discord_id", discord_id).execute()
            if ex.data:
                user = ex.data[0]
                supabase.table("users").update({
                    "discord_username": discord_username, "discord_avatar": discord_avatar,
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                }).eq("id", user["id"]).execute()
            else:
                user = None
                if discord_email:
                    user = _find_user_by_ci("email", discord_email, "*")
                    if user and not user.get("email_verified"):
                        # Do NOT auto-link to an account whose email is unverified:
                        # a Discord account using that (unclaimed/bouncing) address
                        # could otherwise hijack the victim's forum account.
                        log.warning("discord callback: refusing email-match link to unverified account for %s", discord_email)
                        safe_dest = dest if str(dest).startswith("/") else "/profile"
                        sep = "&" if "?" in safe_dest else "?"
                        return _Redir(f"{front}{safe_dest}{sep}discord_error=email_unverified")
                    if user:
                        _ensure_identity_available("discord_id", discord_id, user["id"], "Discord account")
                        supabase.table("users").update({
                            "discord_id": discord_id, "discord_username": discord_username,
                            "discord_avatar": discord_avatar, "last_seen": datetime.now(timezone.utc).isoformat(),
                        }).eq("id", user["id"]).execute()
                if not user:
                    uname = _next_available_username(discord_username or f"discord_{discord_id[-6:]}")
                    row = supabase.table("users").insert({
                        "username": uname, "email": _normalized_email(discord_email) or f"{discord_id}@discord.placeholder",
                        "password_hash": "", "email_verified": True,
                        "discord_id": discord_id, "discord_username": discord_username, "discord_avatar": discord_avatar,
                        "role": "user", "created_at": datetime.now(timezone.utc).isoformat(),
                        "last_seen": datetime.now(timezone.utc).isoformat(),
                    }).execute()
                    user = row.data[0]
                    if discord_email and not discord_email.endswith("@discord.placeholder"):
                        welcome_html = f"""<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h2 style="color:#00ff88;margin-bottom:8px">Welcome to aifazi.net! 🎉</h2>
  <p style="color:#8b949e">Your Discord account <strong style="color:#e6edf3">@{discord_username}</strong> has been linked and your forum account is ready.</p>
  <a href="{SITE_URL}/forum/profile" style="display:inline-block;background:#00ff88;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Go to your profile →</a>
</div>"""
                        try:
                            subject, html = render_template("discord_welcome", {
                                "site_name": "aifazi.net", "username": uname, "discord_username": discord_username,
                                "profile_url": f"{SITE_URL}/forum/profile", "frontend_url": SITE_URL,
                            })
                            await queue_email(discord_email,
                                subject or "Welcome to aifazi.net — your account is ready!",
                                html or welcome_html, f"Welcome to aifazi.net! Your account @{uname} is ready.",
                                "discord_welcome")
                        except Exception:
                            pass
    except Exception:
        return _Redir(f"{front}{m_login}?discord_error=db")
    if user.get("banned"):
        return _Redir(f"{front}{m_login}?discord_error=banned")
    if mode != "connect" and user.get("totp_enabled") and user.get("totp_secret"):
        partial = make_forum_2fa_token(user["id"], user["username"], user.get("role", "user"), "discord")
        safe_dest = _urlparse.quote(dest, safe="/")
        safe_user = _urlparse.quote(user.get("username") or "")
        safe_partial = _urlparse.quote(partial, safe="")
        return _Redir(f"{front}{m_login}#twofa=forum&partial_token={safe_partial}&username={safe_user}&next={safe_dest}")
    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    refresh = make_refresh_token({"id": user["id"], "username": user["username"], "role": user.get("role", "user")}, 60 * 24 * 7)
    try:
        supabase.table("users").update({
            "refresh_token": refresh, "refresh_rotated_at": datetime.now(timezone.utc).isoformat(), "last_seen": datetime.now(timezone.utc).isoformat()
        }).eq("id", user["id"]).execute()
    except Exception:
        pass
    _record_user_activity(user["id"], user["username"], "discord_connect" if mode == "connect" else "discord_login", f"discord_id={discord_id}")
    safe_dest = _urlparse.quote(dest, safe="/")
    if _st.get("mobile"):
        # App deep link: deliver the refresh token in the fragment (the app has no
        # cookie jar), skip HttpOnly cookies, and let the app store both tokens.
        return _Redir(f"{front}#token={token}&refresh={refresh}&dest={safe_dest}")
    # M9 — deliver the token as a URL hash fragment, NOT a query param, so it
    # never lands in server logs or Referer headers. The frontend callback
    # (DiscordAuthCallback.jsx) already reads the fragment first.
    # H4 — also set HttpOnly auth cookies so the session survives without
    # localStorage; the fragment token stays as a legacy fallback.
    resp = _Redir(f"{front}/auth/discord-callback#token={token}&dest={safe_dest}")
    _set_auth_cookies(resp, token, refresh)
    return resp

@router.post("/discord/connect")
async def discord_connect(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    # H3 — linking a Discord account by a client-supplied discord_id is an
    # unauthenticated identity claim (a user could claim a victim's Discord ID
    # and hijack their whitelist identity). Linking is ONLY done by the verified
    # Discord OAuth callback (mode=connect), which carries a signed link_token.
    # This legacy raw endpoint is disabled — fail closed.
    raise HTTPException(400, "Direct Discord linking is disabled. Use the Discord OAuth connect flow (GET /discord/connect-url).")

@router.delete("/discord/disconnect")
async def discord_disconnect(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(400, "A player account is required to disconnect Discord")
    if _active_identity_locked(user_id):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    ur = supabase.table("users").select("password_hash").eq("id", user_id).execute()
    if not ur.data or not ur.data[0].get("password_hash"):
        raise HTTPException(400, "Email/password login is required before disconnecting Discord")
    supabase.table("users").update({"discord_id": None, "discord_username": None, "discord_avatar": None}).eq("id", user_id).execute()
    _record_user_activity(user_id, payload.get("username", ""), "discord_disconnect")
    return {"ok": True}

@router.get("/discord/whitelist-status")
async def discord_whitelist_status(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id")
    if not user_id and _is_staff_payload(payload):
        return {"has_discord": False, "discord_id": None, "application": None, "active_identity_locked": False, "staff_account": True, "admin_access": payload.get("role") == "admin", "preview_only": True}
    if not user_id:
        raise HTTPException(400, "A player account is required for whitelist status")
    ur = supabase.table("users").select("discord_id,discord_username").eq("id", user_id).execute()
    if not ur.data:
        raise HTTPException(404, "User not found")
    discord_id = ur.data[0].get("discord_id")
    if not discord_id:
        return {"has_discord": False, "application": None, "active_identity_locked": _active_identity_locked(user_id)}
    base_fields = "id,status,txadmin_synced,character_name,fivem_id,discord_id,discord_name,applied_at,reviewed_at,reviewer_note"
    try:
        wl = supabase.table("fivem_whitelist").select(base_fields + ",fivem_license,steam_hex,priority_tier,priority_level,priority_expires_at,last_played_at,last_played_name").eq("discord_id", discord_id).order("applied_at", desc=True).limit(1).execute()
    except Exception as exc:
        if "last_played" not in str(exc):
            raise
        wl = supabase.table("fivem_whitelist").select(base_fields + ",fivem_license,steam_hex,priority_tier,priority_level,priority_expires_at").eq("discord_id", discord_id).order("applied_at", desc=True).limit(1).execute()
    app = wl.data[0] if wl.data else None
    if app:
        if app["status"] == "approved" and app.get("last_played_at"):
            app["display_status"] = "active"
        elif app["status"] == "approved" and not app.get("txadmin_synced"):
            app["display_status"] = "syncing"
        else:
            app["display_status"] = app["status"]
        app["submitted_at"] = app.get("applied_at")
        app["denial_reason"] = app.get("reviewer_note")
    return {"has_discord": True, "discord_id": discord_id, "application": app, "active_identity_locked": _active_identity_locked(user_id)}

@router.get("/lookup")
async def lookup_user(username: str, _: dict = Depends(require_staff)):
    if not username or len(username.strip()) < 2:
        return {"found": False}
    res = supabase.table("users").select("id,username,email,avatar,discord_id,discord_username,discord_avatar").ilike("username", f"%{safe_search_term(username.strip())}%").limit(5).execute()
    if not res.data:
        return {"found": False}
    users = res.data
    exact = next((u for u in users if u["username"].lower() == username.strip().lower()), None)
    u = exact or users[0]
    return {"found": True, "id": u["id"], "username": u["username"], "email": u.get("email"), "avatar": u.get("avatar") or u.get("discord_avatar"), "discord_id": u.get("discord_id"), "discord_username": u.get("discord_username")}
