"""FiveM player/application identifier helpers — extracted from routers/fivem.py."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any

import logging

from database import supabase

log = logging.getLogger("fivem_ids")


def _player_identifiers(player: dict) -> dict[str, Any]:
    raw_ids = player.get("identifiers")
    identifiers = list(raw_ids) if isinstance(raw_ids, list) else []
    out: dict[str, Any] = {"all": []}

    for raw in identifiers:
        ident = str(raw or "").strip()
        if not ident:
            continue
        out["all"].append(ident)
        low = ident.lower()
        if low.startswith("discord:"):
            out["discord_id"] = ident.split(":", 1)[1]
        elif low.startswith("steam:"):
            out["steam_hex"] = ident
        elif low.startswith("fivem:"):
            out["fivem_id"] = ident
        elif low.startswith("license2:"):
            out["license2"] = ident
            out.setdefault("fivem_license", ident)
        elif low.startswith("license:"):
            out["license"] = ident
            out.setdefault("fivem_license", ident)

    for key, aliases in {
        "license": ("license",),
        "license2": ("license2",),
        "fivem_license": ("fivem_license", "license"),
        "discord_id": ("discord", "discord_id"),
        "steam_hex": ("steam", "steam_hex"),
        "fivem_id": ("fivem", "fivem_id"),
    }.items():
        for alias in aliases:
            val = str(player.get(alias) or "").strip()
            if val:
                if key == "discord_id" and val.startswith("discord:"):
                    val = val.split(":", 1)[1]
                out[key] = val
                prefixed = val
                if key == "discord_id" and not prefixed.startswith("discord:"):
                    prefixed = f"discord:{prefixed}"
                elif key == "fivem_id" and not prefixed.startswith("fivem:"):
                    prefixed = f"fivem:{prefixed}"
                if prefixed not in out["all"]:
                    out["all"].append(prefixed)
                break

    return out


def _submission_identifiers(answers: dict) -> set[str]:
    ids: set[str] = set()
    for key in ("license", "fivem_license", "license2", "steam_hex", "steam", "fivem_id", "discord_id"):
        val = str((answers or {}).get(key) or "").strip()
        if not val:
            continue
        low = val.lower()
        if key == "discord_id":
            ids.add(val[8:] if low.startswith("discord:") else val)
            ids.add(val if low.startswith("discord:") else f"discord:{val}")
        elif key == "fivem_id":
            ids.add(val)
            ids.add(val if low.startswith("fivem:") else f"fivem:{val}")
        elif key in ("steam_hex", "steam") and not low.startswith("steam:") and low.startswith("110000"):
            ids.add(f"steam:{val}")
        else:
            ids.add(val)
    return {i.lower() for i in ids if i}


def _identifier_update_fields(identifier: str | None, existing: dict | None = None) -> dict:
    ident = (identifier or "").strip()
    if not ident:
        return {}

    existing = existing or {}
    updates: dict = {}
    if ident.startswith("license:"):
        if not existing.get("fivem_license"):
            updates["fivem_license"] = ident
    elif ident.startswith("steam:"):
        if not existing.get("steam_hex"):
            updates["steam_hex"] = ident
    elif ident.startswith("fivem:"):
        if not existing.get("fivem_id"):
            updates["fivem_id"] = ident
    return updates


def _normalize_identifier_list(values: Any) -> list[str]:
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


def _first_identifier(ids: list[str], prefixes: tuple[str, ...]) -> str | None:
    for ident in ids:
        low = ident.lower()
        if any(low.startswith(prefix) for prefix in prefixes):
            return ident
    return None


def _primary_ban_identifier(ids: list[str]) -> str | None:
    return (
        _first_identifier(ids, ("license:", "license2:"))
        or _first_identifier(ids, ("steam:",))
        or _first_identifier(ids, ("discord:",))
        or _first_identifier(ids, ("fivem:",))
        or (ids[0] if ids else None)
    )


def _find_whitelist_by_identifiers(ids: list[str]) -> dict | None:
    filters: list[str] = []
    for ident in ids:
        value = (ident or "").strip()
        if not value:
            continue
        low = value.lower()
        if low.startswith(("license:", "license2:")):
            filters.append(f"fivem_license.eq.{value}")
        elif low.startswith("steam:"):
            filters.append(f"steam_hex.eq.{value}")
        elif low.startswith("fivem:"):
            filters.append(f"fivem_id.eq.{value}")
            filters.append(f"fivem_id.eq.{value.split(':', 1)[1]}")
        elif low.startswith("discord:"):
            filters.append(f"discord_id.eq.{value.split(':', 1)[1]}")
        else:
            filters.append(f"discord_id.eq.{value}")
            filters.append(f"fivem_id.eq.{value}")

    if not filters:
        return None

    try:
        res = (
            supabase.table("fivem_whitelist")
            .select("*")
            .eq("status", "approved")
            .or_(",".join(filters))
            .order("approved_at", desc=True)
            .limit(1)
            .execute()
        )
        return (res.data or [None])[0]
    except Exception as exc:
        log.warning("Could not match whitelist app for ban identifiers: %s", exc)
        return None


def _answer_identifiers(answers: dict) -> list[str]:
    ids: list[str] = []
    for key in ("license", "fivem_license", "license2", "steam_hex", "steam", "fivem_id", "discord_id"):
        val = str((answers or {}).get(key) or "").strip()
        if not val:
            continue
        low = val.lower()
        if key == "discord_id" and not low.startswith("discord:"):
            val = f"discord:{val}"
        elif key == "fivem_id" and not low.startswith("fivem:"):
            val = f"fivem:{val}"
        elif key in ("steam_hex", "steam") and low.startswith("110000"):
            val = f"steam:{val}"
        ids.append(val)
    return list(dict.fromkeys(ids))


def _player_ids_from_fields(
    license_: str | None, license2: str | None, steam_hex: str | None,
    fivem_id: str | None, discord_id: str | None, identifiers: list[str],
) -> dict:
    raw = [str(x or "").strip() for x in (identifiers or []) if str(x or "").strip()]
    ids = _player_identifiers({
        "identifiers": raw,
        "license": license_,
        "license2": license2,
        "steam_hex": steam_hex,
        "fivem_id": fivem_id,
        "discord": discord_id,
    })
    ids["license_key"] = (ids.get("license") or ids.get("license2") or ids.get("fivem_license") or "").strip() or None
    return ids

