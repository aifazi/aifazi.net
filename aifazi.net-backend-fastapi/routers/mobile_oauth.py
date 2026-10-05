"""
routers/mobile_oauth.py — H2/C6: one-time code exchange for mobile OAuth.

POST /api/auth/mobile/exchange   { "code": "<one-time code>" }
    → { "token": ..., "refreshToken": ..., "dest": "..." }

The code is the ONLY credential: it is a signed, 5-minute-TTL, single-use
PASETO minted by the OAuth callbacks when the flow was started from the
mobile app (mobile=1). No bearer token or cookie is required — the user is
not authenticated yet, which is the point. Invalid / expired / already-used
codes answer 400 with a generic message (no enumeration signal beyond what
the rate limiter already provides).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import supabase
from utils.auth_tokens import make_forum_token, make_refresh_token
from utils.mobile_oauth_codes import exchange_code

log = logging.getLogger("mobile_oauth.exchange")
router = APIRouter()


class ExchangeIn(BaseModel):
    code: str = Field(min_length=8, max_length=4096)
    state: str | None = None


@router.post("/mobile/exchange")
async def mobile_exchange(body: ExchangeIn):
    payload = exchange_code(body.code, body.state)
    if not payload:
        raise HTTPException(400, "Sign-in code is invalid, expired, or already used")

    user_id = str(payload.get("user_id") or "")
    username = str(payload.get("username") or "")
    role = str(payload.get("role") or "user")
    dest = str(payload.get("dest") or "/profile")
    provider = str(payload.get("provider") or "oauth")

    # The Discord player flow (routers/discord_auth.py) mints its own 7-day
    # player JWT for /api/discord/* — the code carries kind=discord_player.
    if payload.get("kind") == "discord_player":
        # R7-8 — verify the player row still exists before minting (fail
        # closed on unknown rows or directory outages). The callback upserts
        # discord_users before issuing the code, so a missing row means a
        # forged or stale code.
        try:
            prow = supabase.table("discord_users").select("discord_id") \
                .eq("discord_id", user_id).execute()
        except Exception:
            raise HTTPException(503, "User directory unavailable")
        if not prow.data:
            raise HTTPException(400, "Sign-in code is invalid, expired, or already used")
        from routers.discord_auth import _make_player_token
        token = _make_player_token({"discord_id": user_id, "username": username, "avatar": ""})
        log.info("mobile oauth exchange: provider=%s kind=discord_player", provider)
        return {"token": token, "dest": dest}

    # R7-8 — SELECT banned before minting. The callbacks mint this code only
    # after authenticating the user, but a suspension issued after the code
    # was minted must still deny: banned=True fails closed (403), as do
    # directory errors (503). A missing row is tolerated with the code claims
    # used as-is (provisioning parity — the OAuth callbacks create the user
    # row just before issuing the code). The DB row, when present, is the
    # source for username/role, not the code claims alone.
    try:
        urow = supabase.table("users").select("id,username,role,banned") \
            .eq("id", user_id).execute()
    except Exception:
        raise HTTPException(503, "User directory unavailable")
    db_user = (urow.data or [None])[0]
    if db_user and db_user.get("banned"):
        raise HTTPException(403, "Account suspended")
    if db_user:
        username = db_user.get("username") or username
        role = db_user.get("role") or role

    token = make_forum_token(user_id, username, role)
    refresh = make_refresh_token({"id": user_id, "username": username, "role": role}, 60 * 24 * 7)
    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("users").update({
            "refresh_token": refresh,
            "refresh_rotated_at": now,
            "last_seen": now,
        }).eq("id", user_id).execute()
    except Exception:
        pass
    log.info("mobile oauth exchange: user=%s provider=%s", username, provider)
    return {"token": token, "refreshToken": refresh, "dest": dest}
