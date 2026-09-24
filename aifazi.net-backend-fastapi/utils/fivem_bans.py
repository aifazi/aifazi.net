"""FiveM ban expiry / duration helpers — extracted from routers/fivem.py."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any

import logging

from database import supabase
from utils.fivem_ids import _player_identifiers

log = logging.getLogger("fivem_bans")


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _duration_seconds(duration: str | None) -> int | None:
    text = (duration or "permanent").strip().lower()
    if text in {"", "permanent", "perm", "never", "custom"}:
        return None
    mapping = {
        "2 hours": 2 * 60 * 60,
        "12 hours": 12 * 60 * 60,
        "1 day": 24 * 60 * 60,
        "2 days": 2 * 24 * 60 * 60,
        "1 week": 7 * 24 * 60 * 60,
        "2 weeks": 14 * 24 * 60 * 60,
        "1 month": 30 * 24 * 60 * 60,
    }
    return mapping.get(text)


def _ban_expires_at(duration: str | None, expires_at: str | None) -> str | None:
    parsed = _parse_datetime(expires_at)
    if parsed:
        return parsed.isoformat()
    seconds = _duration_seconds(duration)
    if seconds is None:
        return None
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def _ban_expire_epoch(expires_at: str | None) -> int:
    try:
        parsed = _parse_datetime(expires_at)
    except ValueError:
        parsed = None
    if not parsed:
        return 2147483647
    return max(int(parsed.timestamp()), int(datetime.now(timezone.utc).timestamp()) + 60)

# â”€â”€â”€ Internal: push one approval to txAdmin + update DB row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


def _ban_duration_txadmin(ban: dict) -> str:
    dur = (ban.get("duration") or "").strip().lower()
    return dur if dur in {"permanent", "2 hours", "12 hours", "1 day", "2 days", "1 week", "2 weeks", "1 month"} else "permanent"


def _resolve_net_id(ids: list[str]) -> int | None:
    """Find the current netId of an online player from the latest fivem_players snapshot."""
    try:
        res = supabase.table("fivem_players").select("players").eq("id", "main").execute()
        if not res.data:
            return None
        for p in res.data[0].get("players") or []:
            if not isinstance(p, dict):
                continue
            pids = _player_identifiers(p)
            known = {str(x).lower() for x in pids.get("all", [])}
            for ident in ids:
                if str(ident or "").lower() in known:
                    return p.get("server_id")
    except Exception as exc:
        log.warning("Could not resolve netId for ban: %s", exc)
    return None

