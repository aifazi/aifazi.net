"""
routers/oauth_admin.py — Staff API to manage LLDAP + OAuth2 clients.

Config is stored in site_config.settings.oauth (JSONB), so it can be edited
from the admin portal without redeploying Coolify env vars.

Migration: none beyond the existing site_config.settings JSONB column.
"""
from __future__ import annotations

import ipaddress
import re
import secrets
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import supabase
from dependencies import require_admin
from utils.audit import record as _audit
from utils.ssrf import is_blocked_ip, resolve_public_ips

router = APIRouter()

# Cloud metadata DNS names that never appear as literal IPs but still grant
# instance credentials when fetched server-side.
_METADATA_HOSTS = frozenset({
    "metadata.google.internal", "metadata.google.com",
    "instance-data", "instance-data-compute",
})

# "__CLEAR__" is the admin-portal sentinel for wiping a stored secret without
# sending the plaintext over the wire. Any secret field equal to this value is
# cleared (never stored) and the clearing is audited.
CLEAR_SENTINEL = "__CLEAR__"


def _validate_public_https_uri(uri: str) -> str:
    """OAuth redirect URIs must be public https — no http downgrade, no
    localhost / private-IP / link-local / cloud-metadata targets (SSRF)."""
    raw = (uri or "").strip()
    try:
        u = urlparse(raw)
    except Exception:
        raise HTTPException(400, f"Invalid redirect_uri: {raw[:80]}")
    if u.scheme != "https" or not u.hostname:
        raise HTTPException(400, f"redirect_uri must be an https URL: {raw[:80]}")
    host = u.hostname.lower()
    if host == "localhost" or host in _METADATA_HOSTS:
        raise HTTPException(400, f"redirect_uri host not allowed: {host}")
    try:
        if is_blocked_ip(ipaddress.ip_address(host)):
            raise HTTPException(400, f"redirect_uri host not allowed: {host}")
    except ValueError:
        if not resolve_public_ips(host):
            raise HTTPException(400, f"redirect_uri host is private/unresolvable: {host}")
    return raw


def _validate_ldap_url(url: str) -> str:
    """LDAP URL must use ldap(s)://. Loopback/link-local/metadata targets are
    rejected via the shared SSRF helpers; RFC1918 is still permitted so the
    default internal `ldap://lldap:3890` Docker service keeps working."""
    raw = (url or "").strip()
    try:
        u = urlparse(raw)
    except Exception:
        raise HTTPException(400, f"Invalid LDAP URL: {raw[:80]}")
    if u.scheme not in ("ldap", "ldaps") or not u.hostname:
        raise HTTPException(400, "LDAP URL must use ldap:// or ldaps:// with a host")
    host = u.hostname.lower()
    if host == "localhost" or host in _METADATA_HOSTS:
        raise HTTPException(400, f"LDAP host not allowed: {host}")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise HTTPException(400, f"LDAP host not allowed: {host}")
        if str(ip) == "169.254.169.254":
            raise HTTPException(400, f"LDAP host not allowed: {host}")
    except ValueError:
        pass  # hostnames validated at connect time; scheme already enforced
    return raw


def _get_settings() -> dict:
    res = supabase.table("site_config").select("settings").eq("key", "global").execute()
    if not res.data:
        supabase.table("site_config").insert({"key": "global", "settings": {}}).execute()
        return {}
    return res.data[0].get("settings") or {}


def _save_settings(settings: dict) -> None:
    supabase.table("site_config").update({"settings": settings}).eq("key", "global").execute()


def get_oauth_config() -> dict:
    """Public to other backend modules — full config including secrets."""
    settings = _get_settings()
    return settings.get("oauth") or {}


def save_oauth_config(cfg: dict) -> None:
    settings = _get_settings()
    settings["oauth"] = cfg
    _save_settings(settings)


def _mask_secret(value: str | None) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return value[:4] + "•" * (len(value) - 8) + value[-4:]


class LldapConfig(BaseModel):
    enabled: bool = True
    url: str = Field("ldap://lldap:3890", max_length=256)
    base_dn: str = Field("dc=aifazi,dc=net", max_length=256)
    users_ou: str = Field("", max_length=256)  # optional override
    bind_dn: str = Field("uid=admin,ou=people,dc=aifazi,dc=net", max_length=256)
    bind_password: str = Field("", max_length=256)


class ClientIn(BaseModel):
    client_id: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=80)
    secret: str = Field("", max_length=128)
    redirect_uris: list[str] = Field(default_factory=list)
    public: bool = False  # public clients (SPA) — no secret required


class ProviderIn(BaseModel):
    enabled: bool = True
    client_id: str = Field("", max_length=256)
    client_secret: str = Field("", max_length=256)
    redirect_uri: str = Field("", max_length=512)
    api_key: str = Field("", max_length=256)  # Steam


# Social login platforms supported by aifazi.net
_SOCIAL_PROVIDERS = ("discord", "github", "steam")

_PROVIDER_META = {
    "discord": {
        "label": "Discord",
        "docs": "https://discord.com/developers/applications",
        "env_keys": ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
        "redirect_hint": "https://api.aifazi.net/api/auth/discord/callback",
        "fields": ["client_id", "client_secret", "redirect_uri"],
    },
    "github": {
        "label": "GitHub",
        "docs": "https://github.com/settings/developers",
        "env_keys": ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
        "redirect_hint": "https://api.aifazi.net/api/auth/github/callback",
        "fields": ["client_id", "client_secret", "redirect_uri"],
    },
    "steam": {
        "label": "Steam",
        "docs": "https://steamcommunity.com/dev/apikey",
        "env_keys": ["STEAM_API_KEY"],
        "redirect_hint": "https://api.aifazi.net/api/forum/auth/steam/callback",
        "fields": ["api_key"],
    },
}


@router.get("")
async def get_oauth_settings(request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    ldap = cfg.get("lldap") or {}
    clients_raw = cfg.get("clients") or {}
    clients = []
    for cid, c in clients_raw.items():
        clients.append({
            "client_id": cid,
            "name": c.get("name") or cid,
            "redirect_uris": c.get("redirect_uris") or [],
            "public": bool(c.get("public")),
            "secret_masked": _mask_secret(c.get("secret")),
            "has_secret": bool(c.get("secret")),
        })
    # Live directory health (does not require password to probe TCP if bind pw set)
    ldap_ok = None
    try:
        from utils.ldap_client import healthcheck
        # Temporarily apply saved config for the probe
        import os
        prev = {
            "LLDAP_URL": os.getenv("LLDAP_URL"),
            "LLDAP_BIND_DN": os.getenv("LLDAP_BIND_DN"),
            "LLDAP_BIND_PASSWORD": os.getenv("LLDAP_BIND_PASSWORD"),
            "LLDAP_BASE_DN": os.getenv("LLDAP_BASE_DN"),
        }
        try:
            if ldap.get("url"):
                os.environ["LLDAP_URL"] = ldap["url"]
            if ldap.get("bind_dn"):
                os.environ["LLDAP_BIND_DN"] = ldap["bind_dn"]
            if ldap.get("bind_password"):
                os.environ["LLDAP_BIND_PASSWORD"] = ldap["bind_password"]
            if ldap.get("base_dn"):
                os.environ["LLDAP_BASE_DN"] = ldap["base_dn"]
            ldap_ok = healthcheck()
        finally:
            for k, v in prev.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
    except Exception:
        ldap_ok = False

    # Social login platforms (Discord / GitHub / Steam)
    providers_out = []
    portal_providers = cfg.get("providers") or {}
    import os as _os
    for pid in _SOCIAL_PROVIDERS:
        meta = _PROVIDER_META[pid]
        stored = portal_providers.get(pid) or {}
        env_client = ""
        env_secret = ""
        env_api = ""
        if pid == "discord":
            env_client = _os.getenv("DISCORD_CLIENT_ID", "")
            env_secret = _os.getenv("DISCORD_CLIENT_SECRET", "")
        elif pid == "github":
            env_client = _os.getenv("GITHUB_CLIENT_ID", "")
            env_secret = _os.getenv("GITHUB_CLIENT_SECRET", "")
        elif pid == "steam":
            env_api = _os.getenv("STEAM_API_KEY", "")
        client_id = stored.get("client_id") or env_client
        secret = stored.get("client_secret") or env_secret
        api_key = stored.get("api_key") or env_api
        configured = bool(api_key) if pid == "steam" else bool(client_id and secret)
        providers_out.append({
            "id": pid,
            "label": meta["label"],
            "docs": meta["docs"],
            "redirect_hint": meta["redirect_hint"],
            "fields": meta["fields"],
            "enabled": bool(stored.get("enabled", True)),
            "configured": configured,
            "client_id": client_id,
            "client_id_set": bool(client_id),
            "secret_set": bool(secret) or bool(api_key),
            "secret_masked": _mask_secret(secret or api_key),
            "redirect_uri": stored.get("redirect_uri") or "",
            "from_env": (not stored.get("client_id") and not stored.get("api_key")),
        })

    return {
        "enabled": bool(cfg.get("enabled", True)),
        "lldap": {
            "enabled": bool(ldap.get("enabled", True)),
            "url": ldap.get("url") or "ldap://lldap:3890",
            "base_dn": ldap.get("base_dn") or "dc=aifazi,dc=net",
            "users_ou": ldap.get("users_ou") or "",
            "bind_dn": ldap.get("bind_dn") or "",
            "bind_password_set": bool(ldap.get("bind_password")),
            "bind_password_masked": _mask_secret(ldap.get("bind_password")),
        },
        "lldap_healthy": ldap_ok,
        "clients": clients,
        "providers": providers_out,
        "endpoints": {
            "authorize": "/api/auth/oauth/authorize",
            "token": "/api/auth/oauth/token",
            "userinfo": "/api/auth/oauth/userinfo",
            "discovery": "/api/auth/oauth/.well-known/oauth-authorization-server",
            "ldap_login": "/api/auth/ldap/login",
        },
    }


@router.put("")
async def put_oauth_settings(body: dict, request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    cleared = False
    if "enabled" in body:
        cfg["enabled"] = bool(body["enabled"])
    if "lldap" in body and isinstance(body["lldap"], dict):
        ldap = dict(cfg.get("lldap") or {})
        src = body["lldap"]
        for k in ("enabled", "url", "base_dn", "users_ou", "bind_dn"):
            if k in src:
                ldap[k] = src[k]
        if src.get("url"):
            ldap["url"] = _validate_ldap_url(str(src["url"]))
        # Only overwrite password when a non-empty value is provided;
        # the "__CLEAR__" sentinel wipes it (audited below).
        if src.get("bind_password") == CLEAR_SENTINEL:
            ldap["bind_password"] = ""
            cleared = True
        elif src.get("bind_password"):
            ldap["bind_password"] = src["bind_password"]
        ldap.setdefault("url", "ldap://lldap:3890")
        ldap.setdefault("base_dn", "dc=aifazi,dc=net")
        ldap.setdefault("bind_dn", "uid=admin,ou=people,dc=aifazi,dc=net")
        ldap.setdefault("enabled", True)
        cfg["lldap"] = ldap
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target="oauth",
           details={"keys": list(body.keys()), "bind_password_cleared": cleared})
    return await get_oauth_settings(request, staff)


@router.put("/providers/{name}")
async def put_provider(name: str, body: ProviderIn, request: Request, staff: dict = Depends(require_admin)):
    if name not in _SOCIAL_PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    if body.redirect_uri:
        body.redirect_uri = _validate_public_https_uri(body.redirect_uri)
    cfg = get_oauth_config()
    providers = cfg.setdefault("providers", {})
    stored = dict(providers.get(name) or {})
    stored["enabled"] = body.enabled
    cleared: list[str] = []
    if body.client_id:
        stored["client_id"] = body.client_id
    if body.client_secret == CLEAR_SENTINEL:
        stored.pop("client_secret", None)
        cleared.append("client_secret")
    elif body.client_secret:
        stored["client_secret"] = body.client_secret
    if body.redirect_uri:
        stored["redirect_uri"] = body.redirect_uri
    if body.api_key == CLEAR_SENTINEL:
        stored.pop("api_key", None)
        cleared.append("api_key")
    elif body.api_key:
        stored["api_key"] = body.api_key
    providers[name] = stored
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target=f"oauth_provider:{name}",
           details={"enabled": body.enabled, "cleared": cleared})
    return await get_oauth_settings(request, staff)


@router.post("/test-ldap")
async def test_ldap(request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    ldap = cfg.get("lldap") or {}
    import os
    prev = {k: os.getenv(k) for k in ("LLDAP_URL", "LLDAP_BIND_DN", "LLDAP_BIND_PASSWORD", "LLDAP_BASE_DN")}
    try:
        if ldap.get("url"):
            os.environ["LLDAP_URL"] = ldap["url"]
        if ldap.get("bind_dn"):
            os.environ["LLDAP_BIND_DN"] = ldap["bind_dn"]
        if ldap.get("bind_password"):
            os.environ["LLDAP_BIND_PASSWORD"] = ldap["bind_password"]
        if ldap.get("base_dn"):
            os.environ["LLDAP_BASE_DN"] = ldap["base_dn"]
        from utils.ldap_client import healthcheck
        ok = healthcheck()
    finally:
        for k, v in prev.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    if not ok:
        raise HTTPException(502, "LLDAP bind failed — check URL, bind DN, and password")
    return {"ok": True, "message": "LLDAP service bind succeeded"}


@router.post("/clients")
async def create_client(body: ClientIn, request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    clients = cfg.setdefault("clients", {})
    if body.client_id in clients:
        raise HTTPException(409, "client_id already exists")
    uris = [_validate_public_https_uri(u) for u in body.redirect_uris if u.strip()]
    secret = "" if body.secret == CLEAR_SENTINEL else body.secret
    secret = secret or (secrets.token_urlsafe(32) if not body.public else "")
    clients[body.client_id] = {
        "name": body.name,
        "secret": secret,
        "redirect_uris": uris,
        "public": body.public,
    }
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target="oauth_client", details={"client_id": body.client_id})
    # Return the secret only on create so the admin can copy it once
    return {
        "client_id": body.client_id,
        "name": body.name,
        "secret": secret,
        "secret_masked": _mask_secret(secret),
        "redirect_uris": clients[body.client_id]["redirect_uris"],
        "public": body.public,
    }


@router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientIn, request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    clients = cfg.setdefault("clients", {})
    if client_id not in clients:
        raise HTTPException(404, "Client not found")
    existing = clients[client_id]
    uris = [_validate_public_https_uri(u) for u in body.redirect_uris if u.strip()]
    cleared = False
    if body.secret == CLEAR_SENTINEL:
        secret = ""
        cleared = True
    else:
        secret = body.secret if body.secret else existing.get("secret", "")
    clients[client_id] = {
        "name": body.name,
        "secret": secret,
        "redirect_uris": uris,
        "public": body.public,
    }
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target="oauth_client",
           details={"client_id": client_id, "secret_cleared": cleared})
    return {
        "client_id": client_id,
        "name": body.name,
        "secret_masked": _mask_secret(secret),
        "has_secret": bool(secret),
        "redirect_uris": clients[client_id]["redirect_uris"],
        "public": body.public,
    }


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    clients = cfg.get("clients") or {}
    if client_id not in clients:
        raise HTTPException(404, "Client not found")
    del clients[client_id]
    cfg["clients"] = clients
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target="oauth_client_delete", details={"client_id": client_id})
    return {"ok": True}
