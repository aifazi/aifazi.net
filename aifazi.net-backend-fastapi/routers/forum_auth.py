"""
routers/forum_auth.py — Forum-user authentication surface.

H1 / DEPRECATION NOTICE (audit 2026-07):
─────────────────────────────────────────
This router is a NEAR-DUPLICATE of routers/auth.py. The two files implement ~30
of the same endpoints (login/register/forgot/reset/2fa/discord/sessions/lookup/
me/profile/change-password/account). auth.py is the canonical, evolving router
and includes several features THIS file is out of sync with:

  • pending_email re-verification flow (auth.py only)
  • /refresh + /logout endpoints            (only registered in auth.py)
  • _raise_if_account_locked on /profile    (only auth.py)
  • Admin gate cookie issuance on 2FA verify (only auth.py)
  • divergent TwoFADisableBody shape        (forum_auth allows code-only for OAuth accounts)

DUPLICATION RISKS:
  • Rate-limit buckets split /auth/login + /forum/auth/login = 10 attempts/min
    per IP instead of the documented 5.
  • Bug fixes applied to auth.py frequently do NOT propagate here.

RECOMMENDATION: collapse both routers into a single auth.py with prefix-based
routing, OR delete forum_auth.py and have the frontend target /api/auth/* only.
README §"Authentication" already misrepresents the two-router split.

FIX #11: SITE_URL now uses FRONTEND_URL directly for local dev support.
"""
import os, re, secrets, asyncio, bcrypt as _bcrypt, pyotp, qrcode, io, base64
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from jwt_compat import jwt, JWTError
from database import supabase
from utils.email import send_email, render_template
from utils.email_queue import queue_email
from utils.audit import record as _audit, record_auth as _auth_log
from dependencies import require_staff
from permissions import normalize_permissions, role_permissions, resolve_staff_access
from utils.oauth_state import make_oauth_state, verify_oauth_state, _safe_relative_path

router = APIRouter()

# FIX #11: No domain restriction — developers can set FRONTEND_URL=http://localhost:3000
SITE_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")

def _hash(password: str) -> str:
    return _bcrypt.hashpw(password.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')

async def _hash_async(password: str) -> str:
    return await asyncio.to_thread(_hash, password)

def _verify(password: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

async def _verify_async(password: str, hashed: str) -> bool:
    return await asyncio.to_thread(_verify, password, hashed)

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
    await queue_email(email, subject or "Verify your email - aifazi.net", html or _verify_email_html(verify_url), f"Verify your aifazi.net account: {verify_url}", "account_activation")

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


SECRET = os.getenv("PASETO_SECRET", os.getenv("JWT_SECRET", ""))
ALGO   = "HS256"
bearer = HTTPBearer(auto_error=False)

def make_forum_token(user_id: str, username: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode({"id": user_id, "username": username, "role": role, "exp": exp}, SECRET, ALGO)


def make_forum_2fa_token(user_id: str, username: str, role: str, provider: str = "password") -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode({
        "id": user_id,
        "username": username,
        "role": role,
        "tfa_pending": True,
        "provider": provider,
        "exp": exp,
    }, SECRET, ALGO)


def _make_qr_b64(uri: str) -> str:
    try:
        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


def _admin_profile_overrides() -> dict:
    try:
        admin_name = os.getenv("ADMIN_USERNAME", "admin")
        row = supabase.table("admin_2fa").select("*").eq("username", admin_name).limit(1).execute()
        data = (row.data or [{}])[0]
        return {
            "username": data.get("username_override") or admin_name,
            "email": data.get("email") or data.get("email_override") or "",
            "email_verified": bool(data.get("email_verified")),
            "bio": data.get("profile_bio") or "",
            "avatar": data.get("profile_avatar") or "",
            "created_at": data.get("created_at"),
            "last_seen": data.get("updated_at"),
        }
    except Exception:
        return {"username": os.getenv("ADMIN_USERNAME", "admin"), "email": "", "email_verified": False, "bio": "", "avatar": ""}


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
    """Decode bearer token and return user dict, or None if invalid.

    C3 — also re-resolves the user's banned flag from the DB (cached 60s via
    dependencies._user_cache) so a freshly-banned forum user can't keep operating
    on a JWT issued before the ban. Without this re-check, the JWT they received at
    login-time would continue to authenticate every forum_auth endpoint until
    natural token expiry (7 days for forum tokens).
    """
    if not creds:
        return None
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGO])
        if payload.get("purpose") or payload.get("tfa_pending"):
            return None
        # Refresh banned/role/email from DB via the shared 60s cache. Audit identified
        # that _get_forum_user was the only bearer-dep that DIDN'T enforce banned state.
        try:
            from dependencies import _enrich_user
            payload = _enrich_user(payload)
            if payload.get("banned"):
                raise HTTPException(403, f"Account suspended: {payload.get('ban_reason') or ''}")
        except HTTPException:
            raise
        except Exception:
            pass   # _enrich_user best-effort — JWT itself already verified
        return payload
    except JWTError:
        return None


def _is_staff_payload(payload: dict | None) -> bool:
    return bool(payload and payload.get("role") in ("admin", "moderator", "editor", "chat"))


def _record_user_activity(user_id: str, username: str, action: str, detail: str = "", ip: str = "") -> None:
    """Insert a row into user_activity_logs. Never raises."""
    try:
        supabase.table("user_activity_logs").insert({
            "user_id":   user_id,
            "username":  username,
            "action":    action,
            "detail":    detail,
            "ip":        ip,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass   # activity logging is best-effort


def _clean_username(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", (value or "").strip()).strip("._-")
    return (cleaned[:30] or "player")


def _find_user_by_ci(field: str, value: str, select: str = "*"):
    value = (value or "").strip()
    if not value:
        return None
    res = supabase.table("users").select(select).ilike(field, value).limit(5).execute()
    needle = value.lower()
    return next((row for row in (res.data or []) if str(row.get(field, "")).lower() == needle), None)


def _normalized_email(value: str) -> str:
    return (value or "").strip().lower()


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
    base = _clean_username(raw_username)
    uname = base
    suffix = 0
    while _find_user_by_ci("username", uname, "id,username"):
        suffix += 1
        max_base = max(1, 30 - len(str(suffix)))
        uname = f"{base[:max_base]}{suffix}"
    return uname


class RegisterBody(BaseModel):
    username: str
    email: EmailStr
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

class ForgotBody(BaseModel):
    # Accept email OR username — we detect which one it is
    identifier: str   # email address OR username

class FindUsernameBody(BaseModel):
    email: EmailStr

class ResetBody(BaseModel):
    token: str
    password: str

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

class TwoFAEnableBody(BaseModel):
    code: str

class TwoFADisableBody(BaseModel):
    password: str | None = None
    code: str

class TwoFAVerifyBody(BaseModel):
    partial_token: str
    code: str


ACTIVE_IDENTITY_MESSAGE = "Your player identity is active. Contact an admin or open a ticket to change Discord or Steam."


def _steam64_to_hex(steam_id: str | None) -> str | None:
    if not steam_id:
        return None
    try:
        return f"steam:{hex(int(str(steam_id)))[2:].lower()}"
    except (TypeError, ValueError):
        return None


def _username_owner(username: str, exclude_id: str | None = None) -> dict | None:
    res = supabase.table("users").select("id,username").ilike("username", username).limit(10).execute()
    for row in res.data or []:
        if (row.get("username") or "").lower() == username.lower() and str(row.get("id")) != str(exclude_id or ""):
            return row
    return None


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


async def _queue_forum_email_verification(user_id: str, email: str) -> None:
    if not email:
        return
    verify_token = secrets.token_urlsafe(32)
    verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    supabase.table("users").update({
        "verify_token": verify_token,
        "verify_expires": verify_expires,
    }).eq("id", user_id).execute()
    verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
    await _queue_activation_email(email, verify_url)


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
    res = (
        supabase.table("fivem_whitelist")
        .select("id,last_played_at")
        .eq("status", "approved")
        .not_.is_("last_played_at", "null")
        .or_(",".join(filters))
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _account_lock(user_id: str | None) -> tuple[bool, str]:
    if not user_id:
        return False, ""
    try:
        row = supabase.table("users").select("banned,ban_reason").eq("id", user_id).limit(1).execute()
        if row.data and row.data[0].get("banned"):
            return True, row.data[0].get("ban_reason") or ""
    except Exception:
        return False, ""
    return False, ""


def _raise_if_account_locked(user_id: str | None) -> None:
    locked, reason = _account_lock(user_id)
    if locked:
        detail = "Account locked. Contact support if you believe this is a mistake."
        if reason:
            detail = f"{detail} Reason: {reason}"
        raise HTTPException(423, detail)

@router.get("/check-username")
async def check_username(username: str):
    """Public endpoint — checks if a username is available.
    Returns { available: bool, suggestion: str | null }"""
    username = (username or "").strip()
    if not username or len(username) < 3:
        return {"available": False, "suggestion": None}
    taken = bool(_username_owner(username))
    if not taken:
        return {"available": True, "suggestion": None}
    # Build a suggestion: try username1, username2 … username9
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
    if not res.data:
        return {"message": "If that account exists, a verification link was sent"}
    user = res.data[0]
    if user.get("email_verified"):
        return {"message": "Email is already verified"}
    verify_token = secrets.token_urlsafe(32)
    verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    supabase.table("users").update({
        "verify_token": verify_token, "verify_expires": verify_expires
    }).eq("id", user["id"]).execute()
    verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
    await _queue_activation_email(user["email"], verify_url, user.get("username") or "")
    return {"message": "Verification email sent"}

@router.post("/register")
async def register(body: RegisterBody):
    pw = body.password
    if len(pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    email = _normalized_email(str(body.email))
    username = _clean_username(body.username)
    email_owner = _find_user_by_ci("email", email, "id,email,email_verified")
    if email_owner:
        existing = email_owner
        if not existing.get("email_verified"):
            verify_token = secrets.token_urlsafe(32)
            verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
            supabase.table("users").update({
                "verify_token": verify_token, "verify_expires": verify_expires
            }).eq("id", existing["id"]).execute()
            verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
            await _queue_activation_email(email, verify_url, existing.get("username") or "")
            raise HTTPException(409, "pending_verification")
        raise HTTPException(409, "Email already registered")
    if _find_user_by_ci("username", username, "id,username"):
        raise HTTPException(409, "Username taken")

    verify_token = secrets.token_urlsafe(32)
    verify_expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    try:
        hashed = _hash(pw)
    except Exception:
        raise HTTPException(400, "Password could not be processed.")

    res = supabase.table("users").insert({
        "username": username, "email": email,
        "password_hash": hashed,
        "verify_token": verify_token, "verify_expires": verify_expires,
    }).execute()

    verify_url = f"{SITE_URL}/forum/verify?token={verify_token}"
    await _queue_activation_email(email, verify_url, username)
    return {"message": "Registered — check your email to verify"}

@router.get("/verify")
async def verify_email(token: str):
    res = supabase.table("users").select("*").eq("verify_token", token).execute()
    if not res.data:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        except JWTError:
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
    supabase.table("users").update({
        "email_verified": True, "verify_token": None, "verify_expires": None
    }).eq("id", user["id"]).execute()
    return {"message": "Email verified"}

@router.post("/login")
async def login(body: LoginBody, request: Request = None):
    ip = request.client.host if request and request.client else ""
    ua = request.headers.get("user-agent", "") if request else ""
    identifier = body.email.strip()

    # Accept email OR username in the email field
    if "@" in identifier:
        user = _find_user_by_ci("email", identifier, "*")
    else:
        user = _find_user_by_ci("username", identifier, "*")
        # Also try email as fallback (in case @ was stripped somehow)
        if not user:
            user = _find_user_by_ci("email", identifier, "*")
    if not user:
        raise HTTPException(400, "Invalid credentials")
    if not _verify(body.password, user["password_hash"]):
        _auth_log(user["username"], success=False, ip=ip, user_agent=ua, role=user.get("role",""), reason="wrong_password")
        raise HTTPException(400, "Invalid credentials")
    if not user.get("email_verified"):
        raise HTTPException(403, "Email not verified")
    # C3 — Reject banned users BEFORE minting a JWT. Previously the login route
    # returned `{token:..., banned:true}` so the client got a valid bearer that
    # could then access every forum_auth endpoint (only _get_forum_user could have
    # caught it — and it didn't either, see the fix above). The bearer dep now
    # re-resolves banned state on each request, and login blocks issuance outright.
    if user.get("banned"):
        _auth_log(user["username"], success=False, ip=ip, user_agent=ua, role=user.get("role",""), reason="account_suspended")
        raise HTTPException(403, f"Account suspended: {user.get('ban_reason') or ''}")
    if user.get("totp_enabled") and user.get("totp_secret"):
        _auth_log(user["username"], success=True, ip=ip, user_agent=ua, role=user.get("role",""), reason="2fa_required")
        return {
            "requires_2fa": True,
            "partial_token": make_forum_2fa_token(user["id"], user["username"], user.get("role", "user"), "password"),
            "verify_path": "/forum/auth/2fa/verify",
            "user_type": "forum",
        }
    supabase.table("users").update({
        "last_seen": datetime.now(timezone.utc).isoformat()
    }).eq("id", user["id"]).execute()
    # Record login activity
    _auth_log(user["username"], success=True, ip=ip, user_agent=ua, role=user.get("role",""), reason="login_success")
    _record_user_activity(user["id"], user["username"], "login", f"IP: {ip}", ip)
    # Upsert session record
    _upsert_forum_session(user["id"], user["username"], ip, ua)
    token = make_forum_token(user["id"], user["username"], user["role"])
    account_locked = bool(user.get("banned"))
    return {"token": token, "user": {
        "id": user["id"], "username": user["username"],
        "email": user["email"], "role": user["role"],
        "avatar": user.get("avatar",""), "bio": user.get("bio",""),
        "banned": account_locked,
        "banReason": user.get("ban_reason") or "",
        "account_locked": account_locked,
        "accountLocked": account_locked,
    }}

@router.post("/forgot")
async def forgot(body: ForgotBody):
    """Accept email OR username. Look up the user and send a reset link."""
    identifier = body.identifier.strip()
    if not identifier:
        return {"message": "If that account exists, a reset link was sent"}

    # Detect email vs username by presence of '@'
    if "@" in identifier:
        res = supabase.table("users").select("id,email,username").eq("email", identifier).execute()
    else:
        res = supabase.table("users").select("id,email,username").eq("username", identifier).execute()
        # Fallback: maybe they typed an email without knowing it registered as username
        if not res.data:
            res = supabase.table("users").select("id,email,username").eq("email", identifier).execute()

    # Always return the same message to prevent user enumeration
    if not res.data:
        return {"message": "If that account exists, a reset link was sent"}
    user = res.data[0]
    reset_token = secrets.token_urlsafe(32)
    reset_expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    supabase.table("users").update({
        "reset_token": reset_token, "reset_expires": reset_expires
    }).eq("id", user["id"]).execute()
    reset_url = f"{SITE_URL}/forum/reset?token={reset_token}"
    subject, html = render_template("password_reset", {
        "site_name": "aifazi.net",
        "username": user.get("username") or "there",
        "reset_link": reset_url,
        "expires_in": "1 hour",
    })
    await queue_email(user["email"], subject or "Reset your password - aifazi.net", html or _reset_email_html(reset_url), f"Reset your aifazi.net password: {reset_url}", "password_reset")
    return {"message": "If that account exists, a reset link was sent"}

@router.post("/find-username")
async def find_username(body: FindUsernameBody):
    """Given an email address, send the associated username to that inbox.
    Always returns the same message to prevent account enumeration."""
    res = supabase.table("users") \
        .select("id,email,username") \
        .eq("email", body.email.strip()) \
        .execute()
    if res.data:
        user = res.data[0]
        await queue_email(
            user["email"],
            "Your username — aifazi.net",
            _find_username_email_html(user["username"]),
            f"Your aifazi.net username is: {user['username']}",
            "find_username",
        )
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
    supabase.table("users").update({
        "password_hash": hashed, "reset_token": None, "reset_expires": None
    }).eq("id", user["id"]).execute()
    return {"message": "Password reset successfully"}

@router.get("/me")
async def get_me(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    user_id = payload.get("id")
    if not user_id:
        return _staff_profile_from_payload(payload)

    res = supabase.table("users").select(
        "id,username,email,role,avatar,bio,email_verified,banned,created_at,last_seen,"
        "discord_id,discord_username,discord_avatar,"
        "steam_id,steam_username,steam_avatar"
        ",totp_enabled"
    ).eq("id", user_id).execute()

    if not res.data:
        if payload.get("role") in ("admin", "moderator", "editor", "chat"):
            return _staff_profile_from_payload(payload)
        raise HTTPException(404, "User not found")

    u = res.data[0]
    # Separate query for has_password — don't return the hash itself
    pw_res = supabase.table("users").select("password_hash").eq("id", user_id).limit(1).execute()
    has_password = bool(pw_res.data and pw_res.data[0].get("password_hash"))
    staff_access = resolve_staff_access({**payload, "id": u["id"], "username": u.get("username"), "email": u.get("email")})

    # Compute FiveM steam_hex from steam_id
    steam_hex = None
    if u.get("steam_id"):
        try:
            steam_hex = f"steam:{hex(int(u['steam_id']))[2:].lower()}"
        except (ValueError, TypeError):
            pass

    account_locked = bool(u.get("banned", False))
    lock_reason = u.get("ban_reason") or ""
    return {
        "_id":              u["id"],
        "username":         u["username"],
        "email":            u["email"],
        "role":             (staff_access or {}).get("role") or u["role"],
        "avatar":           u.get("avatar", ""),
        "bio":              u.get("bio", ""),
        "email_verified":   u.get("email_verified", False),
        "has_password":     has_password,
        "banned":           u.get("banned", False),
        "ban_reason":       lock_reason,
        "banReason":        lock_reason,
        "account_locked":   account_locked,
        "accountLocked":    account_locked,
        "lock_reason":      lock_reason,
        "lockReason":       lock_reason,
        "created_at":       u.get("created_at"),
        "createdAt":        u.get("created_at"),
        "last_seen":        u.get("last_seen"),
        "lastSeen":         u.get("last_seen"),
        # Discord link
        "discord_id":       u.get("discord_id"),
        "discord_username": u.get("discord_username"),
        "discord_avatar":   u.get("discord_avatar"),
        # Steam link
        "steam_id":         u.get("steam_id"),
        "steam_username":   u.get("steam_username"),
        "steam_avatar":     u.get("steam_avatar"),
        "steam_hex":        steam_hex,   # FiveM-ready: "steam:xxxxxxxxxxxxxxx"
        "active_identity_locked": _active_identity_locked(u["id"]),
        "two_factor_enabled": bool(u.get("totp_enabled")),
        "_staff": bool(staff_access),
        "staff_account": bool(staff_access),
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
    _raise_if_account_locked(user_id)
    access = resolve_staff_access(payload)

    # Env admin has no forum row; store public profile bits beside 2FA settings.
    if access and access.get("role") == "admin" and not user_id:
        admin_name = os.getenv("ADMIN_USERNAME", "admin")
        # Keep this payload compatible with the currently deployed admin_2fa schema.
        # The login/display username for the env admin is still controlled by ADMIN_USERNAME.
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

    # Standalone staff token: update staff profile row.
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
            patch.update({"email": email, "email_verified": False})
            email_changed = True
    res = supabase.table("users").update(patch).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    user = res.data[0]
    if email_changed:
        await _queue_forum_email_verification(user_id, user.get("email") or "")
    _record_user_activity(user_id, username, "profile_update")
    return {"ok": True, "email_verification_sent": email_changed, "user": {"_id": user["id"], "id": user["id"], "username": user["username"], "email": user.get("email"), "email_verified": user.get("email_verified", False), "role": (access or {}).get("role") or user.get("role", "user"), "avatar": user.get("avatar") or "", "bio": user.get("bio") or "", "_staff": bool(access), "staff_account": bool(access), "permissions": normalize_permissions((access or {}).get("permissions"))}}

@router.post("/change-password")
async def change_password(body: ChangePasswordBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if not body.new_password or len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    access = resolve_staff_access(payload)
    user_id = payload.get("id")
    _raise_if_account_locked(user_id)
    if access and access.get("role") == "admin" and not user_id:
        import hmac as _hmac
        admin_pw = os.getenv("ADMIN_PASSWORD", "")
        ok = False
        if admin_pw.startswith(("$2b$", "$2a$", "$2y$")):
            ok = _verify(body.current_password or "", admin_pw)
        else:
            ok = _hmac.compare_digest((body.current_password or "").encode(), admin_pw.encode())
        if not ok:
            raise HTTPException(400, "Current password incorrect")
        return {"message": "Password hash generated. Update ADMIN_PASSWORD in Vercel.", "bcrypt_hash": _hash(body.new_password)}
    if access and access.get("staff_id") and not access.get("forum_user_id"):
        row = supabase.table("users").select("password_hash").eq("id", access["staff_id"]).limit(1).execute()
        if not row.data or not _verify(body.current_password or "", row.data[0].get("password_hash") or ""):
            raise HTTPException(400, "Current password incorrect")
        supabase.table("users").update({"password_hash": _hash(body.new_password)}).eq("id", access["staff_id"]).execute()
        return {"message": "Password updated"}
    if not user_id:
        raise HTTPException(400, "A user account is required")
    row = supabase.table("users").select("password_hash").eq("id", user_id).limit(1).execute()
    if not row.data or not _verify(body.current_password or "", row.data[0].get("password_hash") or ""):
        raise HTTPException(400, "Current password incorrect")
    supabase.table("users").update({"password_hash": _hash(body.new_password)}).eq("id", user_id).execute()
    _record_user_activity(user_id, payload.get("username", ""), "password_change")
    return {"message": "Password updated"}

@router.get("/2fa/status")
async def forum_tfa_status(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload or not payload.get("id"):
        raise HTTPException(401, "Not authenticated")
    res = supabase.table("users").select("totp_enabled").eq("id", payload["id"]).limit(1).execute()
    return {"enabled": bool(res.data and res.data[0].get("totp_enabled"))}

@router.post("/2fa/setup")
async def forum_tfa_setup(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload or not payload.get("id"):
        raise HTTPException(401, "Not authenticated")
    secret = pyotp.random_base32()
    label = payload.get("username") or "aifazi-user"
    uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name="aifazi.net")
    supabase.table("users").update({
        "totp_secret": secret,
        "totp_enabled": False,
    }).eq("id", payload["id"]).execute()
    _record_user_activity(payload["id"], label, "2fa_setup_started")
    return {"secret": secret, "otpauth_uri": uri, "qr_image": _make_qr_b64(uri)}

@router.post("/2fa/confirm")
async def forum_tfa_confirm(body: TwoFAEnableBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload or not payload.get("id"):
        raise HTTPException(401, "Not authenticated")
    code = (body.code or "").replace(" ", "")
    res = supabase.table("users").select("totp_secret").eq("id", payload["id"]).limit(1).execute()
    if not res.data or not res.data[0].get("totp_secret"):
        raise HTTPException(400, "Call /2fa/setup first")
    if not pyotp.TOTP(res.data[0]["totp_secret"]).verify(code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    supabase.table("users").update({"totp_enabled": True}).eq("id", payload["id"]).execute()
    _record_user_activity(payload["id"], payload.get("username", ""), "2fa_enabled")
    return {"enabled": True}

@router.post("/2fa/enable")
async def forum_tfa_enable(body: TwoFAEnableBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    return await forum_tfa_confirm(body, creds)

@router.post("/2fa/disable")
async def forum_tfa_disable(body: TwoFADisableBody, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload or not payload.get("id"):
        raise HTTPException(401, "Not authenticated")
    code = (body.code or "").replace(" ", "")
    res = supabase.table("users").select("password_hash,totp_secret,totp_enabled").eq("id", payload["id"]).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    user = res.data[0]
    if user.get("password_hash") and not _verify(body.password or "", user.get("password_hash") or ""):
        raise HTTPException(400, "Current password incorrect")
    if user.get("totp_enabled") and user.get("totp_secret"):
        if not pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
            raise HTTPException(400, "Invalid 2FA code")
    supabase.table("users").update({
        "totp_enabled": False,
        "totp_secret": None,
    }).eq("id", payload["id"]).execute()
    _record_user_activity(payload["id"], payload.get("username", ""), "2fa_disabled")
    return {"enabled": False}

@router.post("/2fa/verify")
async def forum_tfa_verify(body: TwoFAVerifyBody, request: Request):
    try:
        payload = jwt.decode(body.partial_token, SECRET, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")
    if not payload.get("tfa_pending") or not payload.get("id"):
        raise HTTPException(400, "Not a 2FA challenge token")
    code = (body.code or "").replace(" ", "")
    ip = request.client.host if request and request.client else ""
    ua = request.headers.get("user-agent", "") if request else ""
    res = supabase.table("users").select("*").eq("id", payload["id"]).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    user = res.data[0]
    if not user.get("totp_enabled") or not user.get("totp_secret"):
        raise HTTPException(400, "2FA is not enabled")
    if not pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
        _auth_log(user.get("username", ""), success=False, ip=ip, user_agent=ua, role=user.get("role", ""), reason="2fa_failed")
        raise HTTPException(400, "Invalid code")
    supabase.table("users").update({
        "last_seen": datetime.now(timezone.utc).isoformat()
    }).eq("id", user["id"]).execute()
    _auth_log(user["username"], success=True, ip=ip, user_agent=ua, role=user.get("role",""), reason="2fa_success")
    _record_user_activity(user["id"], user["username"], "login_2fa", f"IP: {ip}", ip)
    _upsert_forum_session(user["id"], user["username"], ip, ua)
    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    account_locked = bool(user.get("banned"))
    return {"token": token, "user": {
        "id": user["id"], "username": user["username"],
        "email": user.get("email"), "role": user.get("role", "user"),
        "avatar": user.get("avatar",""), "bio": user.get("bio",""),
        "banned": account_locked,
        "banReason": user.get("ban_reason") or "",
        "account_locked": account_locked,
        "accountLocked": account_locked,
    }}

@router.delete("/account")
async def delete_own_account(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Delete the current OAuth-only account.

    Email/password accounts should use disconnect options instead; this endpoint is
    intentionally limited to accounts with no password hash so social-only users
    are not trapped with an account they cannot unlink from.
    """
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")

    row = supabase.table("users").select("id,username,password_hash").eq("id", payload["id"]).execute()
    if not row.data:
        raise HTTPException(404, "User not found")
    user = row.data[0]
    if user.get("password_hash"):
        raise HTTPException(400, "Email/password accounts cannot be deleted from this OAuth-only action")

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

@router.post("/forgot-password")
async def forgot_alias(body: ForgotBody):
    return await forgot(body)

@router.post("/reset-password/{token}")
async def reset_alias(token: str, body: dict):
    password = body.get("password", "")
    if not password:
        raise HTTPException(400, "Password is required")
    return await reset(ResetBody(token=token, password=password))

@router.get("/verify-email/{token}")
async def verify_email_alias(token: str):
    return await verify_email(token=token)


# ── Forum session helpers ──────────────────────────────────────────────────────

def _upsert_forum_session(user_id: str, username: str, ip: str, ua: str) -> None:
    """Create or refresh a forum session row. Never raises."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        existing = supabase.table("forum_sessions") \
            .select("id") \
            .eq("user_id", user_id) \
            .eq("ip", ip) \
            .eq("user_agent", ua) \
            .execute()
        if existing.data:
            supabase.table("forum_sessions") \
                .update({"last_active": now}) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
        else:
            supabase.table("forum_sessions").insert({
                "user_id":    user_id,
                "username":   username,
                "ip":         ip,
                "user_agent": ua,
                "last_active": now,
                "created_at":  now,
            }).execute()
    except Exception:
        pass


# ── User sessions endpoints ────────────────────────────────────────────────────

@router.get("/sessions")
async def user_list_sessions(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _is_staff_payload(payload) and not payload.get("id"):
        from routers.auth import list_sessions as _admin_list_sessions
        return await _admin_list_sessions(request, payload)
    user_id = payload.get("id")
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    try:
        rows = supabase.table("forum_sessions") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("last_active", desc=True) \
            .execute()
        sessions = rows.data or []
        stale_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        active = []
        stale_ids = [s["id"] for s in sessions if s.get("last_active", "") < stale_cutoff]
        if stale_ids:
            supabase.table("forum_sessions").delete().in_("id", stale_ids).execute()
        for s in sessions:
            if s.get("last_active", "") >= stale_cutoff:
                s["current"] = (s.get("ip") == ip and s.get("user_agent") == ua)
                active.append(s)
        others = [s for s in active if not s["current"]]
        return {"sessions": active, "total": len(active), "conflict": len(others) > 0}
    except Exception as exc:
        return {"sessions": [], "total": 0, "conflict": False, "error": str(exc)}


@router.post("/sessions/heartbeat")
async def user_session_heartbeat(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _is_staff_payload(payload) and not payload.get("id"):
        from routers.auth import session_heartbeat as _admin_session_heartbeat
        return await _admin_session_heartbeat(request, payload)
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    _upsert_forum_session(payload["id"], payload.get("username", ""), ip, ua)
    # Return conflict info
    try:
        stale_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        all_rows = supabase.table("forum_sessions") \
            .select("id,ip,user_agent,last_active") \
            .eq("user_id", payload["id"]) \
            .execute()
        others = [s for s in (all_rows.data or [])
                  if not (s.get("ip") == ip and s.get("user_agent") == ua)
                  and s.get("last_active", "") >= stale_cutoff]
        return {"ok": True, "conflict": len(others) > 0, "others": others}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.delete("/sessions/{session_id}")
async def user_revoke_session(session_id: str, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    row = supabase.table("forum_sessions").select("user_id").eq("id", session_id).execute()
    if not row.data or row.data[0].get("user_id") != payload["id"]:
        raise HTTPException(404, "Session not found")
    supabase.table("forum_sessions").delete().eq("id", session_id).execute()
    _record_user_activity(payload["id"], payload.get("username",""), "session_revoked", f"session_id={session_id}")
    return {"revoked": True}


@router.delete("/sessions")
async def user_revoke_all_sessions(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")
    all_rows = supabase.table("forum_sessions") \
        .select("id,ip,user_agent") \
        .eq("user_id", payload["id"]) \
        .execute()
    to_delete = [s["id"] for s in (all_rows.data or [])
                 if not (s.get("ip") == ip and s.get("user_agent") == ua)]
    if to_delete:
        supabase.table("forum_sessions").delete().in_("id", to_delete).execute()
    _record_user_activity(payload["id"], payload.get("username",""), "sessions_revoke_all", f"count={len(to_delete)}", ip)
    return {"revoked": len(to_delete)}


# ── User activity log ──────────────────────────────────────────────────────────

@router.get("/activity")
async def user_activity_log(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    try:
        rows = supabase.table("user_activity_logs") \
            .select("action,detail,ip,created_at") \
            .eq("user_id", payload["id"]) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()
        return rows.data or []
    except Exception:
        return []


# ── User's own helpdesk tickets ────────────────────────────────────────────────

@router.get("/my-tickets")
async def user_my_tickets(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")

    # Always fetch the user's email — used as primary or fallback key
    user_res = supabase.table("users").select("email").eq("id", payload["id"]).execute()
    email = (user_res.data[0].get("email", "") if user_res.data else "") or ""

    user_id = payload.get("id", "")
    select_cols = "id,ticket_id,subject,status,priority,created_at,updated_at,response,responded_at,category,email,user_id"
    seen: dict[str, dict] = {}

    # ── 1. Query by user_id ───────────────────────────────────────────────────
    try:
        res = (
            supabase.table("helpdesk_tickets")
            .select(select_cols)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        for t in (res.data or []):
            if t["id"] in seen:
                continue
            t_uid = str(t.get("user_id") or "")
            t_em = (t.get("email") or "").strip().lower()
            if t_uid and t_em:
                if t_uid == user_id and t_em == email.lower():
                    seen[t["id"]] = t
            elif t_uid and t_uid == user_id:
                seen[t["id"]] = t
            elif t_em and t_em == email.lower():
                seen[t["id"]] = t
    except Exception as exc:
        if "PGRST204" not in str(exc) and "user_id" not in str(exc):
            import logging
            logging.getLogger("forum_auth").error("my-tickets user_id query failed: %s", exc)

    # ── 2. Always also query by email (catches pre-link tickets + missing col) ─
    if email:
        try:
            res_email = (
                supabase.table("helpdesk_tickets")
                .select(select_cols)
                .eq("email", email)
                .order("created_at", desc=True)
                .limit(100)
                .execute()
            )
            for t in (res_email.data or []):
                if t["id"] in seen:
                    continue
                t_uid = str(t.get("user_id") or "")
                t_em = (t.get("email") or "").strip().lower()
                if t_uid and t_em:
                    if t_uid == user_id and t_em == email.lower():
                        seen[t["id"]] = t
                elif t_uid and t_uid == user_id:
                    seen[t["id"]] = t
                elif t_em and t_em == email.lower():
                    seen[t["id"]] = t
        except Exception as exc:
            import logging
            logging.getLogger("forum_auth").error("my-tickets email query failed: %s", exc)

    tickets = sorted(seen.values(), key=lambda t: t.get("created_at", ""), reverse=True)
    for t in tickets:
        t.pop("email", None)
        t.pop("user_id", None)
    return tickets

# ── Discord OAuth (unified login) ──────────────────────────────────────────────
# Extends the existing forum_users login — Discord OAuth creates or links a
# forum_users account and issues the same auth_token JWT the site already uses.
import urllib.parse as _urlparse
try:
    import httpx as _httpx
except ImportError:
    _httpx = None

_DISCORD_CLIENT_ID     = os.getenv("DISCORD_CLIENT_ID", "")
_DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
_DISCORD_REDIRECT_URI  = os.getenv(
    "DISCORD_REDIRECT_URI",
    f"{os.getenv('API_URL', 'https://api.aifazi.net')}/api/forum/auth/discord/callback"
)


def _make_discord_link_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=10)
    return jwt.encode({"id": user_id, "purpose": "discord_link", "exp": exp}, SECRET, ALGO)


def _decode_discord_link_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        return payload if payload.get("purpose") == "discord_link" else None
    except JWTError:
        return None


def _discord_oauth_url(state: str) -> str:
    params = _urlparse.urlencode({
        "client_id":     _DISCORD_CLIENT_ID,
        "redirect_uri":  _DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope":         "identify email",
        "state":         state,
    })
    return f"https://discord.com/oauth2/authorize?{params}"


@router.get("/discord/login")
async def discord_login(dest: str = "/forum/profile"):
    """Redirect the player to the Discord OAuth consent screen.

    C2 — `dest` is signed into the OAuth state via HMAC; callback verifies it.
    """
    if not _DISCORD_CLIENT_ID:
        raise HTTPException(500, "Discord OAuth not configured — set DISCORD_CLIENT_ID")
    from fastapi.responses import RedirectResponse as _Redir
    safe_dest = _safe_relative_path(dest, default="/forum/profile")
    state = make_oauth_state("discord", safe_dest)
    return _Redir(_discord_oauth_url(state))


@router.get("/discord/connect-url")
async def discord_connect_url(dest: str = "/profile",
                              creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Return a Discord OAuth URL that links Discord to the current forum user."""
    if not _DISCORD_CLIENT_ID:
        raise HTTPException(500, "Discord OAuth not configured — set DISCORD_CLIENT_ID")
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    if _active_identity_locked(payload["id"]):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    link_token = _make_discord_link_token(payload["id"])
    # C2 — connect-mode state carries its own signed link_token (already CSRF-safe);
    # we still sanitise the dest so it can't smuggle an open-redirect.
    safe_dest = _safe_relative_path(dest, default="/profile")
    state = f"connect:{link_token}:{safe_dest}"
    return {"url": _discord_oauth_url(state)}

@router.get("/discord/callback")
async def discord_callback(code: str = None, state: str = None, error: str = None):
    """Exchange Discord code, upsert forum_users, issue JWT, redirect to frontend."""
    from fastapi.responses import RedirectResponse as _Redir
    state_value = _urlparse.unquote(state or "") if state else ""
    dest = "/forum/profile"
    mode = "login"
    link_payload = None
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
        # C2 — verify the signed OAuth state; fail closed on any mismatch.
        try:
            dest = verify_oauth_state(state_value, "discord")
        except ValueError:
            return _Redir(f"{SITE_URL}/login?discord_error=state")
    front = SITE_URL

    if error or not code:
        return _Redir(f"{front}/login?discord_error=1")

    if not _httpx:
        return _Redir(f"{front}/login?discord_error=cfg")

    # 1. Exchange code for Discord access token
    try:
        async with _httpx.AsyncClient() as c:
            tok = await c.post(
                "https://discord.com/api/oauth2/token",
                data={
                    "client_id":     _DISCORD_CLIENT_ID,
                    "client_secret": _DISCORD_CLIENT_SECRET,
                    "grant_type":    "authorization_code",
                    "code":          code,
                    "redirect_uri":  _DISCORD_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
        if tok.status_code != 200:
            return _Redir(f"{front}/login?discord_error=2")
        access_token = tok.json().get("access_token")
    except Exception:
        return _Redir(f"{front}/login?discord_error=2")

    # 2. Fetch Discord user profile
    try:
        async with _httpx.AsyncClient() as c:
            me = await c.get(
                "https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
        if me.status_code != 200:
            return _Redir(f"{front}/login?discord_error=3")
        d = me.json()
        discord_id       = str(d["id"])
        discord_username = d.get("username", "")
        discord_avatar   = (
            f"https://cdn.discordapp.com/avatars/{discord_id}/{d['avatar']}.png"
            if d.get("avatar") else
            f"https://cdn.discordapp.com/embed/avatars/{int(discord_id) % 5}.png"
        )
        discord_email = d.get("email", "")
    except Exception:
        return _Redir(f"{front}/login?discord_error=3")

    # 3. Find or create forum_users row
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
                "discord_username": discord_username,
                "discord_avatar":   discord_avatar,
                "last_seen":        datetime.now(timezone.utc).isoformat(),
                "discord_id":        discord_id,
            }).eq("id", current_user_id).execute()
            user = {**user, "discord_id": discord_id, "discord_username": discord_username, "discord_avatar": discord_avatar}
        else:
            # a) Already linked by discord_id
            ex = supabase.table("users").select("*").eq("discord_id", discord_id).execute()
            if ex.data:
                user = ex.data[0]
                supabase.table("users").update({
                    "discord_username": discord_username,
                    "discord_avatar":   discord_avatar,
                    "last_seen":        datetime.now(timezone.utc).isoformat(),
                }).eq("id", user["id"]).execute()
            else:
                user = None
                # b) Match by email -> link existing account, case-insensitively.
                if discord_email:
                    user = _find_user_by_ci("email", discord_email, "*")
                    if user:
                        _ensure_identity_available("discord_id", discord_id, user["id"], "Discord account")
                        supabase.table("users").update({
                            "discord_id":       discord_id,
                            "discord_username": discord_username,
                            "discord_avatar":   discord_avatar,
                            "last_seen":        datetime.now(timezone.utc).isoformat(),
                        }).eq("id", user["id"]).execute()
                # c) Create brand-new account
                if not user:
                    uname = _next_available_username(discord_username or f"discord_{discord_id[-6:]}")
                    row = supabase.table("users").insert({
                        "username":         uname,
                        "email":            _normalized_email(discord_email) or f"{discord_id}@discord.placeholder",
                        "password_hash":    "",
                        "email_verified":   True,   # Discord already verified the email
                        "discord_id":       discord_id,
                        "discord_username": discord_username,
                        "discord_avatar":   discord_avatar,
                        "role":             "user",
                        "created_at":       datetime.now(timezone.utc).isoformat(),
                        "last_seen":        datetime.now(timezone.utc).isoformat(),
                    }).execute()
                    user = row.data[0]

                    # Send welcome email to the Discord email address
                    if discord_email and not discord_email.endswith("@discord.placeholder"):
                        welcome_html = f"""
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h2 style="color:#00ff88;margin-bottom:8px">Welcome to aifazi.net! 🎉</h2>
  <p style="color:#8b949e">Your Discord account <strong style="color:#e6edf3">@{discord_username}</strong> has been linked and your forum account is ready.</p>
  <div style="background:#161b22;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0;font-size:13px;color:#8b949e">Username</p>
    <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#00ff88">@{uname}</p>
  </div>
  <p style="color:#8b949e;font-size:13px">You can now sign in with Discord or set a password in your profile settings.</p>
  <a href="{SITE_URL}/forum/profile" style="display:inline-block;background:#00ff88;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Go to your profile →</a>
</div>"""
                        try:
                            from utils.email import render_template
                            subject, html = render_template("discord_welcome", {
                                "site_name": "aifazi.net",
                                "username": uname,
                                "discord_username": discord_username,
                                "profile_url": f"{SITE_URL}/forum/profile",
                                "frontend_url": SITE_URL,
                            })
                            await queue_email(
                                discord_email,
                                subject or "Welcome to aifazi.net — your account is ready!",
                                html or welcome_html,
                                f"Welcome to aifazi.net! Your account @{uname} is ready. Visit {SITE_URL}/forum/profile",
                                "discord_welcome",
                            )
                        except Exception as mail_exc:
                            import logging; logging.getLogger("forum_auth").warning("Discord welcome email failed: %s", mail_exc)
    except Exception as exc:
        import logging; logging.getLogger("forum_auth").error("discord_callback db: %s", exc)
        return _Redir(f"{front}/login?discord_error=db")

    if user.get("banned"):
        return _Redir(f"{front}/login?discord_error=banned")

    # 4. Issue the same JWT the rest of the site uses
    if mode != "connect" and user.get("totp_enabled") and user.get("totp_secret"):
        partial = make_forum_2fa_token(user["id"], user["username"], user.get("role", "user"), "discord")
        safe_dest = _urlparse.quote(dest, safe="/")
        safe_user = _urlparse.quote(user.get("username") or "")
        safe_partial = _urlparse.quote(partial, safe="")
        return _Redir(f"{front}/login#twofa=forum&partial_token={safe_partial}&username={safe_user}&next={safe_dest}")

    token = make_forum_token(user["id"], user["username"], user.get("role", "user"))
    _record_user_activity(user["id"], user["username"], "discord_connect" if mode == "connect" else "discord_login", f"discord_id={discord_id}")

    # 5. Redirect to frontend callback page with token
    safe_dest = _urlparse.quote(dest, safe="/")
    return _Redir(f"{front}/auth/discord-callback?token={token}&dest={safe_dest}")

@router.post("/discord/connect")
async def discord_connect(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Link a Discord account to an already-logged-in forum_users account."""
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(400, "A player account is required to connect Discord")
    if _active_identity_locked(user_id):
        raise HTTPException(423, ACTIVE_IDENTITY_MESSAGE)
    body = await request.json()
    discord_id       = str(body.get("discord_id", "")).strip()
    discord_username = body.get("discord_username", "").strip()
    discord_avatar   = body.get("discord_avatar", "").strip()
    if not discord_id:
        raise HTTPException(400, "discord_id is required")
    _ensure_identity_available("discord_id", discord_id, user_id, "Discord account")
    supabase.table("users").update({
        "discord_id": discord_id,
        "discord_username": discord_username,
        "discord_avatar": discord_avatar,
    }).eq("id", user_id).execute()
    _record_user_activity(user_id, payload.get("username",""), "discord_connect", f"discord_id={discord_id}")
    return {"ok": True}

@router.delete("/discord/disconnect")
async def discord_disconnect(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Unlink Discord from the current account (requires email/password login)."""
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
    supabase.table("users").update({
        "discord_id": None, "discord_username": None, "discord_avatar": None,
    }).eq("id", user_id).execute()
    _record_user_activity(user_id, payload.get("username",""), "discord_disconnect")
    return {"ok": True}

@router.get("/discord/whitelist-status")
async def discord_whitelist_status(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Return the logged-in user's whitelist application for the profile FiveM tab."""
    payload = _get_forum_user(creds)
    if not payload:
        raise HTTPException(401, "Not authenticated")
    user_id = payload.get("id")
    if not user_id and _is_staff_payload(payload):
        return {
            "has_discord": False,
            "discord_id": None,
            "application": None,
            "active_identity_locked": False,
            "staff_account": True,
            "admin_access": payload.get("role") == "admin",
            "preview_only": True,
        }
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
        wl = supabase.table("fivem_whitelist") \
            .select(base_fields + ",fivem_license,steam_hex,priority_tier,priority_level,priority_expires_at,last_played_at,last_played_name") \
            .eq("discord_id", discord_id) \
            .order("applied_at", desc=True) \
            .limit(1) \
            .execute()
    except Exception as exc:
        if "last_played" not in str(exc):
            raise
        wl = supabase.table("fivem_whitelist") \
            .select(base_fields + ",fivem_license,steam_hex,priority_tier,priority_level,priority_expires_at") \
            .eq("discord_id", discord_id) \
            .order("applied_at", desc=True) \
            .limit(1) \
            .execute()
    app = wl.data[0] if wl.data else None
    if app:
        if app["status"] == "approved" and app.get("last_played_at"):
            app["display_status"] = "active"
        elif app["status"] == "approved" and not app.get("txadmin_synced"):
            app["display_status"] = "syncing"
        else:
            app["display_status"] = app["status"]
        # Alias applied_at as submitted_at for the frontend
        app["submitted_at"] = app.get("applied_at")
        # Alias reviewer_note as denial_reason for the frontend
        app["denial_reason"] = app.get("reviewer_note")
    return {"has_discord": True, "discord_id": discord_id, "application": app, "active_identity_locked": _active_identity_locked(user_id)}


# ─── Admin: lookup forum user by username (for manual whitelist add) ─────────
@router.get("/lookup")
async def lookup_user(username: str, _: dict = Depends(require_staff)):
    """Search for a forum user by username — returns Discord ID if linked.
    Used by the admin manual-add whitelist form to auto-fill Discord info."""
    if not username or len(username.strip()) < 2:
        return {"found": False}
    res = supabase.table("users") \
        .select("id,username,email,avatar,discord_id,discord_username,discord_avatar") \
        .ilike("username", f"%{username.strip()}%") \
        .limit(5) \
        .execute()
    if not res.data:
        return {"found": False}
    # Return the best match (exact first, then partial)
    users = res.data
    exact = next((u for u in users if u["username"].lower() == username.strip().lower()), None)
    u = exact or users[0]
    return {
        "found":            True,
        "id":               u["id"],
        "username":         u["username"],
        "email":            u.get("email"),
        "avatar":           u.get("avatar") or u.get("discord_avatar"),
        "discord_id":       u.get("discord_id"),
        "discord_username": u.get("discord_username"),
    }
