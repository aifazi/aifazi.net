"""Resolve social OAuth provider credentials from admin portal then env."""
from __future__ import annotations

import os
from typing import Any


def _portal_providers() -> dict[str, Any]:
    try:
        from routers.oauth_admin import get_oauth_config
        return (get_oauth_config().get("providers") or {})
    except Exception:
        return {}


def provider_cfg(name: str) -> dict[str, Any]:
    """Return {enabled, client_id, client_secret, extra...} for a provider."""
    portal = (_portal_providers().get(name) or {})
    if name == "discord":
        return {
            "enabled": bool(portal.get("enabled", True)),
            "client_id": portal.get("client_id") or os.getenv("DISCORD_CLIENT_ID", ""),
            "client_secret": portal.get("client_secret") or os.getenv("DISCORD_CLIENT_SECRET", ""),
            "redirect_uri": portal.get("redirect_uri") or os.getenv("DISCORD_REDIRECT_URI", ""),
        }
    if name == "github":
        return {
            "enabled": bool(portal.get("enabled", True)),
            "client_id": portal.get("client_id") or os.getenv("GITHUB_CLIENT_ID", ""),
            "client_secret": portal.get("client_secret") or os.getenv("GITHUB_CLIENT_SECRET", ""),
            "redirect_uri": portal.get("redirect_uri") or os.getenv("GITHUB_REDIRECT_URI", ""),
        }
    if name == "steam":
        return {
            "enabled": bool(portal.get("enabled", True)),
            "api_key": portal.get("api_key") or os.getenv("STEAM_API_KEY", ""),
        }
    return portal


def is_configured(name: str) -> bool:
    cfg = provider_cfg(name)
    if name == "steam":
        return bool(cfg.get("api_key"))
    return bool(cfg.get("client_id") and cfg.get("client_secret"))
