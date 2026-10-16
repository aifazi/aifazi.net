"""routers/fivem/connect.py - extracted from routers/fivem.py."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

from routers.fivem.shared import _active_priority, _now, _parse_dt
from database import safe_or_in, supabase
from datetime import datetime, timedelta, timezone
from dependencies import get_current_user
from fastapi import Depends, HTTPException, Request
from jwt_compat import ExpiredSignatureError, JWTError, jwt
from routers.fivem_models import ConnectSessionRequest, ConnectTokenResponse, VerifyTokenRequest
import hmac
import os
import secrets

# â”€â”€â”€ Connect token gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_CONNECT_TOKEN_EXP = 300  # 5 minutes
_CONNECT_COOLDOWN_S = 30
_STAFF_DIRECT_ROLES = {"admin", "moderator", "editor", "chat", "fivem", "staff"}
def _jwt_secret() -> str:
    # Dedicated signing key for FiveM connect tokens. Deliberately never falls
    # back to INTERNAL_API_SECRET: that value ships to the Next.js client as the
    # X-Internal-Token header, so anyone who extracts it from the bundle could
    # forge connect tokens. PASETO/JWT secrets stay server-side only.
    secret = os.environ.get("FIVEM_CONNECT_SECRET") or os.environ.get("PASETO_SECRET")
    if not secret:
        raise HTTPException(503, "FIVEM_CONNECT_SECRET or PASETO_SECRET is required")
    return secret
def _forum_user_for_connect(user: dict) -> dict:
    user_id = user.get("id") or user.get("forum_user_id")
    if not user_id:
        raise HTTPException(401, "Authentication required")
    res = (
        supabase.table("users")
        .select("id,username,role,discord_id,steam_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "User not found")
    return res.data[0]
def _connect_ban_filters(forum_user: dict, whitelist_row: dict | None = None) -> list[str]:
    filters: list[str] = []
    discord_id = (forum_user.get("discord_id") or "").strip()
    if discord_id:
        filters.append(safe_or_in("identifier", [f"discord:{discord_id}"]))
        filters.append(safe_or_in("identifier", [discord_id]))
    steam_id = (forum_user.get("steam_id") or "").strip()
    if steam_id:
        filters.append(safe_or_in("identifier", [steam_id]))
    if whitelist_row:
        for key in ("fivem_license", "license_hex", "license2_hex", "steam_hex", "fivem_id"):
            value = (whitelist_row.get(key) or "").strip()
            if value:
                filters.append(safe_or_in("identifier", [value]))
    return filters
def _normalize_discord_id(value: str | None) -> str:
    raw = (value or "").strip()
    return raw.split(":", 1)[1] if raw.startswith("discord:") else raw
def _session_identifier_filters(body: ConnectSessionRequest) -> list[str]:
    filters: list[str] = []
    values = {
        "fivem_license": (body.fivem_license or "").strip(),
        "license2_hex": (body.license2 or "").strip(),
        "steam_hex": (body.steam_hex or "").strip(),
        "fivem_id": (body.fivem_id or "").strip(),
        "discord_id": _normalize_discord_id(body.discord_id),
    }
    for raw in body.identifiers or []:
        ident = str(raw or "").strip()
        low = ident.lower()
        if low.startswith("license:"):
            values["fivem_license"] = ident
        elif low.startswith("license2:"):
            values["license2_hex"] = ident
        elif low.startswith("steam:"):
            values["steam_hex"] = ident
        elif low.startswith("fivem:"):
            values["fivem_id"] = ident
        elif low.startswith("discord:"):
            values["discord_id"] = ident.split(":", 1)[1]

    if values["fivem_license"]:
        filters.append(safe_or_in("fivem_license", [values["fivem_license"]]))
    if values["license2_hex"]:
        filters.append(safe_or_in("license2_hex", [values["license2_hex"]]))
    if values["steam_hex"]:
        filters.append(safe_or_in("steam_hex", [values["steam_hex"]]))
    if values["fivem_id"]:
        filters.append(safe_or_in("fivem_id", [values["fivem_id"]]))
    if values["discord_id"]:
        filters.append(safe_or_in("discord_id", [values["discord_id"]]))
    return filters
def _forum_user_matches_session(forum_user: dict, body: ConnectSessionRequest, whitelist_row: dict | None) -> bool:
    discord_id = _normalize_discord_id(body.discord_id)
    steam_hex = (body.steam_hex or "").strip()
    identifiers = {str(i or "").strip().lower() for i in (body.identifiers or []) if str(i or "").strip()}
    if discord_id and discord_id == (forum_user.get("discord_id") or "").strip():
        return True
    if steam_hex and steam_hex == (forum_user.get("steam_id") or "").strip():
        return True
    if (forum_user.get("steam_id") or "").strip().lower() in identifiers:
        return True
    if whitelist_row:
        for key in ("fivem_license", "license2_hex", "steam_hex", "fivem_id"):
            value = (whitelist_row.get(key) or "").strip()
            if value and value.lower() in identifiers:
                return True
    return False
def _direct_staff_user(body: ConnectSessionRequest) -> dict | None:
    discord_id = _normalize_discord_id(body.discord_id)
    steam_hex = (body.steam_hex or "").strip()
    identifiers = {str(i or "").strip() for i in (body.identifiers or []) if str(i or "").strip()}
    filters: list[str] = []
    if discord_id:
        filters.append(safe_or_in("discord_id", [discord_id]))
    if steam_hex:
        filters.append(safe_or_in("steam_id", [steam_hex]))
    for ident in identifiers:
        low = ident.lower()
        if low.startswith("discord:"):
            filters.append(safe_or_in("discord_id", [ident.split(":", 1)[1]]))
        elif low.startswith("steam:"):
            filters.append(safe_or_in("steam_id", [ident]))
    if not filters:
        return None
    res = (
        supabase.table("users")
        .select("id,username,role,discord_id,steam_id")
        .or_(",".join(dict.fromkeys(filters)))
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    user = res.data[0]
    return user if (user.get("role") or "").lower() in _STAFF_DIRECT_ROLES else None
@router.post("/connect/token")
async def generate_connect_token(user: dict = Depends(get_current_user)):
    """Generate a short-lived, single-use FiveM connect token."""
    forum_user = _forum_user_for_connect(user)
    role = forum_user.get("role") or user.get("role") or "member"
    username = forum_user.get("username") or user.get("username") or "player"
    discord_id = (forum_user.get("discord_id") or "").strip()

    whitelist_row = None
    if role not in ("admin", "moderator"):
        if not discord_id:
            raise HTTPException(403, "Link Discord before connecting to the FiveM server.")
        wl = (
            supabase.table("fivem_whitelist")
            .select("id,status,discord_id,fivem_license,license_hex,license2_hex,steam_hex,fivem_id")
            .eq("discord_id", discord_id)
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
        if not wl.data or wl.data[0].get("status") != "approved":
            raise HTTPException(403, "You are not whitelisted. Apply for whitelist access first.")
        whitelist_row = wl.data[0]

    ban_filters = _connect_ban_filters(forum_user, whitelist_row)
    if ban_filters:
        ban = (
            supabase.table("fivem_bans")
            .select("id")
            .eq("active", True)
            .or_(",".join(ban_filters))
            .limit(1)
            .execute()
        )
        if ban.data:
            raise HTTPException(403, "You are banned from the server.")

    recent = (
        supabase.table("fivem_connect_tokens")
        .select("created_at,expires_at,used")
        .eq("user_id", forum_user["id"])
        .eq("used", False)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if recent.data:
        created_at = _parse_dt(recent.data[0].get("created_at"))
        if created_at:
            age = (datetime.now(timezone.utc) - created_at).total_seconds()
            if age < _CONNECT_COOLDOWN_S:
                wait = max(1, int(_CONNECT_COOLDOWN_S - age))
                raise HTTPException(
                    429,
                    f"Connect session already created. Please wait {wait}s before trying again.",
                    headers={"Retry-After": str(wait)},
                )

    token_id = secrets.token_hex(12)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_CONNECT_TOKEN_EXP)
    payload = {
        "sub": forum_user["id"],
        "username": username,
        "role": role,
        "purpose": "fivem_connect",
        "jti": token_id,
        "exp": expires_at,
    }
    token = jwt.encode(payload, _jwt_secret(), algorithm="HS256")

    supabase.table("fivem_connect_tokens").insert({
        "token_id": token_id,
        "user_id": forum_user["id"],
        "username": username,
        "used": False,
        "created_at": _now(),
        "expires_at": expires_at.isoformat(),
    }).execute()

    return ConnectTokenResponse(
        token=token,
        expires_in=_CONNECT_TOKEN_EXP,
        username=username,
        connect_url=os.environ.get("FIVEM_CONNECT_URL", "fivem://connect/127.0.0.1:30120"),
    )
@router.post("/connect/session-check")
async def check_connect_session(body: ConnectSessionRequest, request: Request):
    """Validate that the joining player started from the website connect page."""
    server_secret = request.headers.get("x-fivem-token", "")
    expected = os.environ.get("FIVEM_SERVER_SECRET", "")
    if not expected or not hmac.compare_digest(server_secret, expected):
        raise HTTPException(401, "Invalid server credentials")

    whitelist_filters = _session_identifier_filters(body)
    whitelist_row = None
    if whitelist_filters:
        wl = (
            supabase.table("fivem_whitelist")
            .select("id,status,discord_id,character_name,fivem_license,license2_hex,steam_hex,fivem_id,priority_tier,priority_level,priority_expires_at")
            .eq("status", "approved")
            .or_(",".join(whitelist_filters))
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
        whitelist_row = (wl.data or [None])[0]

    recent_tokens = (
        supabase.table("fivem_connect_tokens")
        .select("token_id,user_id,username,expires_at,used,created_at")
        .eq("used", False)
        .gte("expires_at", _now())
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    # Batch-fetch the owning users ONCE instead of one query per token (N+1).
    tokens_data = recent_tokens.data or []
    user_ids = [t.get("user_id") for t in tokens_data if t.get("user_id")]
    user_by_id: dict = {}
    if user_ids:
        users_res = (
            supabase.table("users")
            .select("id,username,role,discord_id,steam_id")
            .in_("id", user_ids)
            .execute()
        )
        user_by_id = {u["id"]: u for u in (users_res.data or []) if u.get("id")}

    for token_row in tokens_data:
        user_id = token_row.get("user_id")
        if not user_id:
            continue
        forum_user = user_by_id.get(user_id)
        if not forum_user:
            continue
        role = forum_user.get("role") or "member"

        matched_whitelist = whitelist_row
        if not matched_whitelist and forum_user.get("discord_id"):
            wl_by_user = (
                supabase.table("fivem_whitelist")
                .select("id,status,discord_id,character_name,fivem_license,license2_hex,steam_hex,fivem_id,priority_tier,priority_level,priority_expires_at")
                .eq("discord_id", forum_user["discord_id"])
                .eq("status", "approved")
                .order("applied_at", desc=True)
                .limit(1)
                .execute()
            )
            matched_whitelist = (wl_by_user.data or [None])[0]

        if not _forum_user_matches_session(forum_user, body, matched_whitelist):
            continue

        if role not in ("admin", "moderator") and not matched_whitelist:
            return {"allowed": False, "reason": "Your whitelist is not approved yet. Apply at fivem.aifazi.net/whitelist"}

        ban_filters = _connect_ban_filters(forum_user, matched_whitelist)
        if ban_filters:
            ban = (
                supabase.table("fivem_bans")
                .select("reason,expires_at,banned_by")
                .eq("active", True)
                .or_(",".join(ban_filters))
                .limit(1)
                .execute()
            )
            if ban.data:
                row = ban.data[0]
                return {"allowed": False, "reason": f"You are banned: {row.get('reason') or 'No reason provided'}"}

        # H17 — atomic single-use consumption: prepend `.eq("used", False)` so only ONE
        # of two racing connect attempts can flip the row (the second update
        # affects 0 rows and we detect that to refuse entry). Previous code
        # had no `used=False` predicate, allowing a token to be redeemed twice
        # in a parallel player double-click race. This MUST run for every user,
        # not only those with ban identifiers (it was accidentally nested under
        # `if ban_filters:` before, so users with no ban filters could reuse a
        # token indefinitely).
        consume_res = (
            supabase.table("fivem_connect_tokens")
            .update({"used": True})
            .eq("token_id", token_row["token_id"])
            .eq("used", False)
            .execute()
        )
        consume_count = len(consume_res.data or [])
        if consume_count == 0:
            # Token was claimed between our check above and this UPDATE; another
            # concurrent request already granted entry on it. Reject this one
            # and keep scanning subsequent unused tokens (rare — only happens
            # on rapid double-connect).
            continue
        if matched_whitelist:
            updates = {"last_played_at": _now()}
            if body.player_name:
                updates["last_played_name"] = body.player_name
            for field, value in {
                "fivem_license": body.fivem_license,
                "license2_hex": body.license2,
                "steam_hex": body.steam_hex,
                "fivem_id": body.fivem_id,
            }.items():
                if value and not matched_whitelist.get(field):
                    updates[field] = value
            supabase.table("fivem_whitelist").update(updates).eq("id", matched_whitelist["id"]).execute()
        return {
            "allowed": True,
            "username": forum_user.get("username") or token_row.get("username"),
            "user_id": forum_user.get("id"),
            "role": role,
            "character_name": (matched_whitelist or {}).get("character_name", ""),
            "priority": _active_priority(matched_whitelist or {}),
        }

    staff_user = _direct_staff_user(body)
    if staff_user:
        ban_filters = _connect_ban_filters(staff_user, None)
        if ban_filters:
            ban = (
                supabase.table("fivem_bans")
                .select("reason")
                .eq("active", True)
                .or_(",".join(ban_filters))
                .limit(1)
                .execute()
            )
            if ban.data:
                return {"allowed": False, "reason": f"You are banned: {ban.data[0].get('reason') or 'No reason provided'}"}
        return {
            "allowed": True,
            "username": staff_user.get("username"),
            "user_id": staff_user.get("id"),
            "role": staff_user.get("role"),
            "direct_staff": True,
            "message": "Staff direct connect allowed",
        }

    return {
        "allowed": False,
        "reason": "Connect from fivem.aifazi.net/connect first. Direct IP/cfx joins are blocked.",
    }
@router.post("/connect/verify")
async def verify_connect_token(body: VerifyTokenRequest, request: Request):
    """Verify a connect token. Called by the FiveM Lua resource."""
    server_secret = request.headers.get("x-fivem-token", "")
    expected = os.environ.get("FIVEM_SERVER_SECRET", "")
    if not expected or not hmac.compare_digest(server_secret, expected):
        raise HTTPException(401, "Invalid server credentials")

    try:
        payload = jwt.decode(body.token, _jwt_secret(), algorithms=["HS256"])
    except ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except JWTError:
        raise HTTPException(401, "Invalid token")

    if payload.get("purpose") != "fivem_connect" or not payload.get("jti"):
        raise HTTPException(401, "Invalid token")

    token_row = (
        supabase.table("fivem_connect_tokens")
        .select("token_id,used,expires_at")
        .eq("token_id", payload["jti"])
        .limit(1)
        .execute()
    )
    if not token_row.data:
        raise HTTPException(401, "Token not found")
    row = token_row.data[0]
    if row.get("used"):
        raise HTTPException(401, "Token already used")
    if row.get("expires_at") and row["expires_at"] < _now():
        raise HTTPException(401, "Token expired")

    # H17 — atomic single-use consumption with the same `used=False` predicate.
    consume_res = (
        supabase.table("fivem_connect_tokens")
        .update({"used": True})
        .eq("token_id", payload["jti"])
        .eq("used", False)
        .execute()
    )
    if not (consume_res.data or []):
        raise HTTPException(401, "Token already used or revoked (race)")
    return {
        "approved": True,
        "username": payload.get("username"),
        "user_id": payload.get("sub"),
        "role": payload.get("role", "member"),
    }
@router.get("/connect/verify")
async def verify_connect_token_get(token: str, request: Request):
    """GET version for Lua HTTP requests."""
    return await verify_connect_token(VerifyTokenRequest(token=token), request)
