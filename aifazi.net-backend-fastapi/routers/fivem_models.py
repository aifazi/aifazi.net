"""fivem_models.py — shared Pydantic models and the FiveM server token check.

Extracted from routers/fivem.py so split routers (bans / whitelist / status)
can type-check without importing the god file.
"""
from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel

ONLINE_THRESHOLD_S = int(os.getenv("FIVEM_STATUS_ONLINE_THRESHOLD", "900"))
DEGRADED_THRESHOLD_S = int(os.getenv("FIVEM_STATUS_DEGRADED_THRESHOLD", "1800"))


def compute_status(updated_at_str: str | None):
    if not updated_at_str:
        return "offline", float("inf")
    try:
        updated = datetime.fromisoformat(str(updated_at_str).replace("Z", "+00:00"))
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - updated).total_seconds()
    except Exception:
        return "offline", float("inf")
    if age < ONLINE_THRESHOLD_S:
        return "online", age
    if age < DEGRADED_THRESHOLD_S:
        return "degraded", age
    return "offline", age


_compute_status = compute_status


def uptime_str(s) -> str:
    if not s or s <= 0:
        return "0m"
    d, r = divmod(int(s), 86400)
    h, r = divmod(r, 3600)
    m, _ = divmod(r, 60)
    if d:
        return f"{d}d {h}h"
    if h:
        return f"{h}h {m}m"
    return f"{m}m"


_uptime_str = uptime_str


def last_seen_str(age) -> str:
    if age == float("inf"):
        return "Never"
    if age < 60:
        return "Just now"
    if age < 3600:
        return f"{int(age // 60)} min ago"
    if age < 86400:
        return f"{int(age // 3600)}h ago"
    return f"{int(age // 86400)}d ago"


_last_seen_str = last_seen_str


def check_fivem_token(request: Request) -> None:
    secret = os.getenv("FIVEM_SERVER_SECRET", "")
    token = request.headers.get("X-FiveM-Token", "")
    if not secret:
        raise HTTPException(503, "FiveM server token is not configured")
    if not token or not hmac.compare_digest(token, secret):
        raise HTTPException(403, "Invalid server token")


# Back-compat alias used by fivem.py internals
_check_token = check_fivem_token


class WhitelistApply(BaseModel):
    discord_id: str | None = None
    discord_name: str | None = None
    steam_hex: str | None = None
    fivem_id: str | None = None
    character_name: str
    character_backstory: str
    age: int
    rp_experience: str
    why_join: str
    rules_accepted: bool
    email: str | None = None
    extra_answers: dict | None = None


class WhitelistReview(BaseModel):
    status: str
    reviewer_note: str | None = None
    priority_tier: str | None = None
    priority_level: int | None = None
    priority_expires_at: str | None = None


class WhitelistManualAdd(BaseModel):
    discord_id: str
    discord_name: str
    character_name: str
    steam_hex: str | None = None
    fivem_license: str | None = None
    fivem_id: str | None = None
    reviewer_note: str | None = None
    priority_tier: str | None = None
    priority_level: int | None = None
    priority_expires_at: str | None = None


class WhitelistPriorityUpdate(BaseModel):
    priority_tier: str | None = None
    priority_level: int | None = None
    priority_expires_at: str | None = None


class BanCreate(BaseModel):
    identifier: str | None = None
    identifiers: list[str] | None = None
    net_id: int | None = None
    player_name: str
    reason: str
    duration: str = "permanent"
    expires_at: str | None = None


class BanUpdate(BaseModel):
    reason: str | None = None
    expires_at: str | None = None
    active: bool | None = None


class BanSyncAck(BaseModel):
    ban_id: str
    ok: bool = True
    message: str | None = None


class StatusUpdate(BaseModel):
    players_online: int
    max_players: int
    server_name: str | None = None
    server_version: str | None = None
    uptime_seconds: int = 0
    resource_count: int = 0
    force_offline: bool = False
    players: list[Any] | None = None


class DevOverride(BaseModel):
    override: Literal["force_online", "maintenance"] | None = None


class MarkSynced(BaseModel):
    license: str | None = None
    app_id: str | None = None
    success: bool = True
    error: str | None = None


class ApplicationActionSyncBody(BaseModel):
    submission_id: str
    status: Literal["synced", "failed", "skipped"] = "synced"
    message: str | None = None


class ServerSyncRefresh(BaseModel):
    app_id: str | None = None
    reason: str | None = None


class TxAdminEvent(BaseModel):
    event: str
    data: dict = {}
    ts: int | None = None


class PlayerJoinBody(BaseModel):
    server_id: int
    player_name: str
    license: str | None = None
    license2: str | None = None
    steam_hex: str | None = None
    fivem_id: str | None = None
    discord_id: str | None = None
    identifiers: list[str] = []


class PlayerLeaveBody(BaseModel):
    server_id: int
    player_name: str | None = None
    license: str | None = None
    license2: str | None = None
    steam_hex: str | None = None
    identifiers: list[str] = []
    disconnect_reason: str | None = None


class PlayerHeartbeatBody(BaseModel):
    players: list[dict] = []


class WhitelistIdentifiersBody(BaseModel):
    discord_id: str | None = None
    license: str | None = None
    license2: str | None = None
    steam_hex: str | None = None
    fivem_id: str | None = None
    identifiers: list[str] = []


class BulkWhitelistApproveBody(BaseModel):
    app_ids: list[str]
    reviewer_note: str | None = None
    priority_tier: str | None = None
    priority_level: int | None = None
    priority_expires_at: str | None = None


class TxAdminActionBody(BaseModel):
    action: str
    target: str = ""
    reason: str | None = None
    confirm: bool = False


class ConnectTokenResponse(BaseModel):
    token: str
    expires_in: int
    username: str
    connect_url: str


class VerifyTokenRequest(BaseModel):
    token: str


class ConnectSessionRequest(BaseModel):
    player_name: str | None = None
    fivem_license: str | None = None
    license2: str | None = None
    steam_hex: str | None = None
    fivem_id: str | None = None
    discord_id: str | None = None
    identifiers: list[str] = []
