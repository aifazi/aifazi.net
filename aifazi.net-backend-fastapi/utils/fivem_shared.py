"""Shared utilities for FiveM routers — single source of truth."""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from database import supabase

log = logging.getLogger("fivem_shared")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def push_realtime(event: str, payload: dict) -> None:
    try:
        supabase.table("fivem_realtime_events").insert({
            "event": event,
            "payload": payload,
            "created_at": now(),
        }).execute()
    except Exception as exc:
        log.warning("Realtime push failed (non-fatal): %s", exc)


def active_priority(app: dict | None) -> dict:
    if not app:
        return {"tier": None, "level": 0, "expires_at": None, "active": False}
    level = int(app.get("priority_level") or 0)
    expires_at = app.get("priority_expires_at")
    active = level > 0
    if active and expires_at:
        try:
            exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            active = exp > datetime.now(timezone.utc)
        except Exception:
            active = False
    return {
        "tier": app.get("priority_tier") if active else None,
        "level": level if active else 0,
        "expires_at": expires_at if active else None,
        "active": active,
    }


def identifier_updates(body: Any, app: dict | None = None) -> dict:
    app = app or {}
    updates: dict = {}
    if getattr(body, "fivem_license", None) and not app.get("fivem_license"):
        updates["fivem_license"] = body.fivem_license
    if getattr(body, "steam_hex", None) and not app.get("steam_hex"):
        updates["steam_hex"] = body.steam_hex
    if getattr(body, "fivem_id", None) and not app.get("fivem_id"):
        updates["fivem_id"] = body.fivem_id
    if getattr(body, "discord_id", None) and not app.get("discord_id"):
        updates["discord_id"] = body.discord_id
    return updates


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
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


def compute_status(updated_at_str: str | None, online_threshold_s: int = 60, degraded_threshold_s: int = 180):
    if not updated_at_str:
        return "offline", float("inf")
    try:
        updated = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - updated).total_seconds()
    except Exception:
        return "offline", float("inf")
    if age < online_threshold_s:    return "online",   age
    if age < degraded_threshold_s:  return "degraded", age
    return "offline", age


def last_seen_str(age: float) -> str:
    if age == float("inf"): return "Never"
    if age < 60:    return "Just now"
    if age < 3600:  return f"{int(age // 60)} min ago"
    if age < 86400: return f"{int(age // 3600)}h ago"
    return f"{int(age // 86400)}d ago"


def uptime_str(s: int) -> str:
    if not s or s <= 0: return "0m"
    d, r = divmod(int(s), 86400); h, r = divmod(r, 3600); m, _ = divmod(r, 60)
    if d: return f"{d}d {h}h"
    if h: return f"{h}h {m}m"
    return f"{m}m"


def normalize_identifier_list(values: Any) -> list[str]:
    if not values:
        return []
    if isinstance(values, str):
        value = values.strip()
        return [value] if value else []
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text and text not in out:
            out.append(text)
    return out


def first_identifier(ids: list[str], prefixes: tuple[str, ...]) -> Optional[str]:
    for ident in ids:
        low = ident.lower()
        if any(low.startswith(prefix) for prefix in prefixes):
            return ident
    return None


def primary_ban_identifier(ids: list[str]) -> Optional[str]:
    return (
        first_identifier(ids, ("license:", "license2:"))
        or first_identifier(ids, ("steam:",))
        or first_identifier(ids, ("discord:",))
        or first_identifier(ids, ("fivem:",))
        or (ids[0] if ids else None)
    )


def duration_seconds(duration: Optional[str]) -> Optional[int]:
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


def ban_expires_at(duration: Optional[str], expires_at: Optional[str]) -> Optional[str]:
    parsed = parse_datetime(expires_at)
    if parsed:
        return parsed.isoformat()
    seconds = duration_seconds(duration)
    if seconds is None:
        return None
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def ban_expire_epoch(expires_at: Optional[str]) -> int:
    try:
        parsed = parse_datetime(expires_at)
    except ValueError:
        parsed = None
    if not parsed:
        return 2147483647
    return max(int(parsed.timestamp()), int(datetime.now(timezone.utc).timestamp()) + 60)
