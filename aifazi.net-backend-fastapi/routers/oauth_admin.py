"""
routers/oauth_admin.py — Staff API to manage LLDAP + OAuth2 clients.

Config is stored in site_config.settings.oauth (JSONB), so it can be edited
from the admin portal without redeploying Coolify env vars.

Migration: none beyond the existing site_config.settings JSONB column.
"""
from __future__ import annotations

import asyncio
import ipaddress
import os
import re
import secrets
import socket
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import supabase
from dependencies import require_admin
from utils.audit import record as _audit
from utils.ssrf import is_blocked_ip, resolve_public_ips

try:
    import httpx as _httpx
except ImportError:
    _httpx = None  # type: ignore[assignment]  # optional dep; guarded at use sites

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
        # Unwrap IPv4-mapped IPv6 first (::ffff:10.0.0.0 must test as its
        # embedded v4 address) — same gap class as utils/ssrf.py (R6-3).
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
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
        "upstream": upstream_public(),
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
async def test_ldap(request: Request, body: dict | None = None, staff: dict = Depends(require_admin)):
    """Probe LLDAP with staged diagnostics. Accepts an optional inline
    `{lldap: {...}}` body so the panel can test *draft* values without saving
    first; otherwise probes the saved config. Never persists anything."""
    cfg = get_oauth_config()
    saved = dict(cfg.get("lldap") or {})
    inline = ((body or {}).get("lldap") or {}) if isinstance(body, dict) else {}
    if not isinstance(inline, dict):
        inline = {}
    eff = {**saved, **{k: v for k, v in inline.items() if v != "" or k == "bind_password"}}
    if inline.get("url"):
        try:
            eff["url"] = _validate_ldap_url(str(inline["url"]))
        except HTTPException as exc:
            return {"ok": False, "steps": [_step("validate", False, exc.detail,
                                                  "Use ldap:// or ldaps:// with a reachable host")],
                    "message": exc.detail}
    url = eff.get("url") or "ldap://lldap:3890"
    result = _probe_lldap_staged(
        url,
        eff.get("bind_dn") or "",
        eff.get("bind_password") or "",
        eff.get("base_dn") or "dc=aifazi,dc=net",
        eff.get("users_ou") or "",
    )
    if result["ok"]:
        return {**result, "message": "LLDAP service bind + search succeeded"}
    first_fail: dict = next((s for s in result["steps"] if not s["ok"]), {})
    return {**result, "message": f"LLDAP check failed at {first_fail.get('name', 'probe')}: {first_fail.get('detail', '')}"}


def _probe_lldap_staged(url: str, bind_dn: str, bind_pw: str, base_dn: str,
                         users_ou: str, timeout: float = 5.0) -> dict:
    """Layer-by-layer LLDAP probe so the panel can say *which* layer fails
    (DNS → TCP → bind → search) instead of a bare boolean."""
    steps: list[dict] = []
    try:
        u = urlparse((url or "").strip())
        host, port = u.hostname or "", u.port or 389
        if u.scheme not in ("ldap", "ldaps") or not host:
            raise ValueError("URL must be ldap(s)://host")
    except Exception as exc:
        return {"ok": False, "steps": [_step("parse", False, str(exc)[:150],
                                              "Use the form ldap://host:port")]}
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        steps.append(_step("dns", True, f"{host} → {infos[0][4][0]}"))
    except Exception as exc:
        return {"ok": False, "steps": [_step(
            "dns", False, f"Cannot resolve {host}: {str(exc)[:120]}",
            f"'{host}' is not reachable from the backend container — use the actual "
            "directory service hostname/IP on the backend Docker network (Coolify "
            "service name), or turn the directory off if unused")]}
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        steps.append(_step("tcp", True, f"{host}:{port} accepts connections"))
    except Exception as exc:
        steps.append(_step("tcp", False, f"{type(exc).__name__}: {str(exc)[:120]}",
                            "The directory is down or unreachable from the backend network"))
        return {"ok": False, "steps": steps}
    if not bind_dn or not bind_pw:
        steps.append(_step("bind", False, "Bind DN or password is empty",
                            "Enter the service bind credentials"))
        return {"ok": False, "steps": steps}
    try:
        from ldap3 import Connection, Server  # type: ignore
        server = Server(url, connect_timeout=timeout)
        # NOTE: no receive_timeout kwarg — ldap3 packs it with struct
        # (integers only) on POSIX, so a float kills the handshake with
        # "struct.error: required argument is not an integer". The socket
        # keeps connect_timeout for recv via settimeout().
        conn = Connection(server, user=bind_dn, password=bind_pw, auto_bind=True)
    except Exception as exc:
        kind = _exc_name(exc)
        if "Bind" in kind:
            steps.append(_step("bind", False, f"{kind}: credentials rejected",
                                "Check the bind DN and password (not a user password)"))
        else:
            steps.append(_step("bind", False, f"{kind}: {str(exc)[:200]}",
                                "The server accepted TCP but the LDAP handshake failed"))
        return {"ok": False, "steps": steps}
    try:
        search_base = base_dn or users_ou
        # NOTE: request "*" — "dn" is not a real attribute type and strict
        # servers (Authentik LDAP outpost) reject it with LDAPAttributeError.
        conn.search(search_base=search_base, search_filter="(objectClass=*)",
                    search_scope="BASE", attributes=["*"], size_limit=1)
        ok = bool(conn.entries)
        conn.unbind()
        if not ok:
            steps.append(_step("search", False, f"Base DN {search_base} returned nothing",
                                "Fix the Base DN (e.g. dc=aifazi,dc=net)"))
            return {"ok": False, "steps": steps}
        steps.append(_step("bind", True, f"Service bind as {bind_dn}"))
        steps.append(_step("search", True, f"Base DN {search_base} is readable"))
        return {"ok": True, "steps": steps}
    except Exception as exc:
        try:
            conn.unbind()
        except Exception:
            pass
        steps.append(_step("search", False, f"{_exc_name(exc)}: {str(exc)[:200]}",
                            "The bind worked but the Base DN search failed — fix Base DN"))
        return {"ok": False, "steps": steps}


# ── Social provider credential verification (no user login required) ──────────

def _provider_resolved(pid: str) -> dict:
    """Portal-or-env credentials for one social provider (values included —
    internal use; the GET shape stays masked via upstream-style fields)."""
    cfg = get_oauth_config()
    stored = (cfg.get("providers") or {}).get(pid) or {}
    client_id = (stored.get("client_id") or os.getenv(
        {"discord": "DISCORD_CLIENT_ID", "github": "GITHUB_CLIENT_ID"}.get(pid, ""), "") or "").strip()
    secret = (stored.get("client_secret") or os.getenv(
        {"discord": "DISCORD_CLIENT_SECRET", "github": "GITHUB_CLIENT_SECRET"}.get(pid, ""), "") or "").strip()
    api_key = (stored.get("api_key") or os.getenv("STEAM_API_KEY", "") or "").strip()
    return {
        "client_id": client_id,
        "secret": secret,
        "api_key": api_key,
        "redirect_uri": stored.get("redirect_uri") or "",
        "enabled": bool(stored.get("enabled", True)),
        "configured": bool(api_key) if pid == "steam" else bool(client_id and secret),
        "source": "portal" if (stored.get("client_id") or stored.get("api_key")) else "env",
    }


async def _test_provider_creds(pid: str, creds: dict) -> dict:
    """Verify a provider's credentials server-to-server (no user involved).

    Discord: client_credentials grant. GitHub: basic-auth rate_limit probe.
    Steam: GetServerInfo key probe. Returns {ok, detail, hint}."""
    if _httpx is None:
        return {"ok": False, "detail": "httpx is not installed",
                "hint": "Install httpx in the backend image to enable probing"}
    try:
        async with _httpx.AsyncClient(timeout=10) as c:
            if pid == "discord":
                r = await c.post(
                    "https://discord.com/api/oauth2/token",
                    data={"grant_type": "client_credentials", "scope": "identify"},
                    auth=(creds["client_id"], creds["secret"]),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if r.status_code == 200:
                    return {"ok": True, "detail": "Discord accepted the app credentials"}
                return {"ok": False,
                        "detail": f"Discord rejected the credentials (HTTP {r.status_code})",
                        "hint": "Check the client ID/secret in the Discord developer portal"}
            if pid == "github":
                r = await c.get(
                    "https://api.github.com/rate_limit",
                    auth=(creds["client_id"], creds["secret"]),
                    headers={"Accept": "application/vnd.github+json",
                             "User-Agent": "aifazi-admin-probe"},
                )
                if r.status_code == 200:
                    return {"ok": True, "detail": "GitHub accepted the OAuth app credentials"}
                if r.status_code == 401:
                    return {"ok": False, "detail": "GitHub rejected the credentials (401)",
                            "hint": "Check the client ID/secret in GitHub developer settings"}
                return {"ok": False, "detail": f"GitHub returned HTTP {r.status_code}",
                        "hint": "Retry; check backend egress to api.github.com"}
            if pid == "steam":
                r = await c.get(
                    "https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/",
                    params={"key": creds["api_key"]},
                )
                try:
                    body = r.json() if r.status_code == 200 else {}
                except Exception:
                    body = {}
                if r.status_code == 200 and body.get("servertime"):
                    return {"ok": True, "detail": "Steam accepted the Web API key"}
                return {"ok": False,
                        "detail": f"Steam rejected the key (HTTP {r.status_code})",
                        "hint": "Check the key at steamcommunity.com/dev/apikey"}
    except Exception as exc:
        return {"ok": False, "detail": f"{type(exc).__name__}: {str(exc)[:150]}",
                "hint": "Network/proxy issue from the backend — retry"}
    return {"ok": False, "detail": f"Unknown provider {pid}", "hint": ""}


@router.post("/providers/{name}/test")
async def test_provider(name: str, staff: dict = Depends(require_admin)):
    if name not in _SOCIAL_PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    creds = _provider_resolved(name)
    if not creds["configured"]:
        raise HTTPException(400, f"{name} is not configured — save credentials first")
    result = await _test_provider_creds(name, creds)
    _audit(staff.get("username", ""), "settings_update", target=f"oauth_provider_test:{name}",
           details={"ok": result["ok"]})
    return {"ok": result["ok"], "detail": result.get("detail", ""),
            "hint": result.get("hint", "")}


@router.post("/clients/{client_id}/rotate")
async def rotate_client(client_id: str, request: Request, staff: dict = Depends(require_admin)):
    """Generate a fresh server-side secret for a confidential client. Returns
    the plaintext exactly once (the panel shows a copy-now box); the old
    secret stops working immediately — the confirm dialog states this."""
    cfg = get_oauth_config()
    clients = cfg.setdefault("clients", {})
    if client_id not in clients:
        raise HTTPException(404, "Client not found")
    if clients[client_id].get("public"):
        raise HTTPException(400, "Public clients have no secret to rotate")
    secret = secrets.token_urlsafe(32)
    clients[client_id]["secret"] = secret
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target="oauth_client_rotate",
           details={"client_id": client_id})
    return {"client_id": client_id, "secret": secret, "secret_masked": _mask_secret(secret)}


@router.get("/health")
async def health(request: Request, staff: dict = Depends(require_admin)):
    """One-call doctor for the Identity panel Overview tab. Probes run live
    (each step has its own timeout); providers are checked concurrently.
    Skipped (not failed) when a subsystem is unconfigured or disabled."""
    cfg = get_oauth_config()
    out: dict = {"generated_at": datetime.now(timezone.utc).isoformat()}

    ldap = dict(cfg.get("lldap") or {})
    ldap_enabled = bool(ldap.get("enabled", True))
    if not ldap_enabled:
        out["lldap"] = {"status": "disabled", "enabled": False, "steps": []}
    else:
        probe = _probe_lldap_staged(
            ldap.get("url") or "ldap://lldap:3890",
            ldap.get("bind_dn") or "",
            ldap.get("bind_password") or "",
            ldap.get("base_dn") or "dc=aifazi,dc=net",
            ldap.get("users_ou") or "",
        )
        out["lldap"] = {"status": "ok" if probe["ok"] else "error",
                        "enabled": True, "steps": probe["steps"]}

    ak = get_authentik_config()
    if not ak.get("client_secret"):
        out["upstream"] = {"status": "unconfigured", "configured": False, "steps": [],
                           "hint": ("Save the client secret in the Upstream IdP tab"
                                    if ak.get("client_id") else
                                    "Set issuer, client ID and secret in the Upstream IdP tab")}
    else:
        steps = await _probe_authentik(ak)
        steps.append(_step("client_secret", bool(ak.get("client_secret")),
                           "Secret is set" if ak.get("client_secret") else "No client secret stored",
                           "" if ak.get("client_secret")
                           else "Save the Authentik provider secret, then watch signals"))
        out["upstream"] = {"status": "ok" if all(s["ok"] for s in steps) else "error",
                           "configured": True, "steps": steps}

    async def _one(pid: str):
        # A single throwing probe must never 500 the whole doctor endpoint —
        # report it as an error step so the panel still shows the rest.
        try:
            creds = _provider_resolved(pid)
            if not creds["configured"]:
                return pid, {"status": "unconfigured", "detail": "No credentials saved or in env"}
            if not creds["enabled"]:
                return pid, {"status": "disabled", "detail": "Disabled in the panel"}
            r = await _test_provider_creds(pid, creds)
            return pid, {"status": "ok" if r["ok"] else "error",
                         "detail": r.get("detail", ""), "hint": r.get("hint", "")}
        except Exception as exc:
            return pid, {"status": "error",
                         "detail": f"Probe crashed ({type(exc).__name__}): {str(exc)[:150]}",
                         "hint": "Check backend logs — other checks still ran"}

    providers = dict(zip(_SOCIAL_PROVIDERS,
                         await asyncio.gather(*[_one(pid) for pid in _SOCIAL_PROVIDERS])))
    out["providers"] = {pid: status for pid, (_, status) in providers.items()}
    clients = cfg.get("clients") or {}
    out["clients"] = {"count": len(clients)}
    return out


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


# ── Upstream IdP (Authentik) — portal-over-env single source of truth ─────────
# The Oct 2026 `invalid_client` incident was a DB↔env client-secret desync that
# could only be fixed with VPS psql + Coolify env edits. Portal values stored in
# site_config.settings.oauth.authentik now win over env vars, so rotation is a
# single panel edit. Env remains as fallback (a bad portal value can be cleared
# back to env). Every resolver below reports its per-field source so the panel
# can show exactly which source is active.

_AUTHENTIK_DEFAULTS = {
    "issuer": "https://auth.aifazi.net",
    "client_id": "aifazi-net",
}


def _portal_or_env(stored: dict, key: str, env_key: str, default: str = "") -> tuple[str, str]:
    """Return (value, source) where source is portal|env|default."""
    portal_val = (stored.get(key) or "").strip() if isinstance(stored.get(key), str) else stored.get(key)
    if portal_val:
        return str(portal_val), "portal"
    env_val = (os.getenv(env_key, "") or "").strip()
    if env_val:
        return env_val, "env"
    return default, "default"


def get_authentik_config() -> dict:
    """Merged Authentik config for backend + panel use.

    Values: portal wins over env wins over built-in defaults. `sources` maps
    each field to portal|env|default. Secrets are included in full — callers
    serving this to the browser must mask (see `upstream_public()`).
    """
    stored = (get_oauth_config().get("authentik") or {})
    if not isinstance(stored, dict):
        stored = {}
    issuer, issuer_src = _portal_or_env(stored, "issuer", "AUTHENTIK_ISSUER", _AUTHENTIK_DEFAULTS["issuer"])
    client_id, client_id_src = _portal_or_env(stored, "client_id", "AUTHENTIK_CLIENT_ID", _AUTHENTIK_DEFAULTS["client_id"])
    client_secret, secret_src = _portal_or_env(stored, "client_secret", "AUTHENTIK_CLIENT_SECRET", "")
    redirect_uri, redirect_src = _portal_or_env(stored, "redirect_uri", "AUTHENTIK_REDIRECT_URI", "")
    api_token, token_src = _portal_or_env(stored, "api_token", "AUTHENTIK_API_TOKEN", "")
    slug_raw = stored.get("provider_slug") or os.getenv("AUTHENTIK_PROVIDER_SLUG", "")
    provider_slug = str(slug_raw or "").strip()
    slug_src = "portal" if stored.get("provider_slug") else ("env" if os.getenv("AUTHENTIK_PROVIDER_SLUG", "").strip() else "default")
    return {
        "issuer": issuer.rstrip("/"),
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "api_token": api_token,
        "provider_slug": provider_slug,
        "sources": {
            "issuer": issuer_src,
            "client_id": client_id_src,
            "client_secret": secret_src,
            "redirect_uri": redirect_src,
            "api_token": token_src,
            "provider_slug": slug_src,
        },
    }


def get_authentik_api_token() -> str:
    """Admin-API bearer: portal value wins, env fallback (no default)."""
    try:
        return get_authentik_config().get("api_token") or ""
    except Exception:
        return (os.getenv("AUTHENTIK_API_TOKEN", "") or "").strip()


def upstream_public() -> dict:
    """Masked upstream block for the admin panel (never ships secrets)."""
    cfg = get_authentik_config()
    secret = cfg.get("client_secret") or ""
    token = cfg.get("api_token") or ""
    return {
        "issuer": cfg.get("issuer") or "",
        "client_id": cfg.get("client_id") or "",
        "client_secret_set": bool(secret),
        "client_secret_masked": _mask_secret(secret),
        "redirect_uri": cfg.get("redirect_uri") or "",
        "api_token_set": bool(token),
        "api_token_masked": _mask_secret(token),
        "provider_slug": cfg.get("provider_slug") or "",
        "sources": cfg.get("sources") or {},
        "configured": bool(cfg.get("client_id") and secret),
    }


def _validate_issuer(raw: str) -> str:
    value = (raw or "").strip().rstrip("/")
    try:
        u = urlparse(value)
    except Exception:
        raise HTTPException(400, f"Invalid issuer URL: {value[:80]}")
    if u.scheme != "https" or not u.hostname:
        raise HTTPException(400, "Issuer must be an https URL with a host")
    host = u.hostname.lower()
    if host == "localhost" or host in _METADATA_HOSTS:
        raise HTTPException(400, f"Issuer host not allowed: {host}")
    return value


class UpstreamIn(BaseModel):
    issuer: str = Field("", max_length=256)
    client_id: str = Field("", max_length=128)
    client_secret: str = Field("", max_length=256)
    redirect_uri: str = Field("", max_length=512)
    api_token: str = Field("", max_length=256)
    provider_slug: str = Field("", max_length=128)  # Authentik application slug for discovery/JWKS


@router.get("/upstream")
async def get_upstream(staff: dict = Depends(require_admin)):
    return upstream_public()


@router.put("/upstream")
async def put_upstream(body: UpstreamIn, request: Request, staff: dict = Depends(require_admin)):
    cfg = get_oauth_config()
    stored = dict(cfg.get("authentik") or {})
    changed: list[str] = []
    cleared: list[str] = []
    if body.issuer:
        stored["issuer"] = _validate_issuer(body.issuer)
        changed.append("issuer")
    if body.client_id:
        stored["client_id"] = body.client_id.strip()
        changed.append("client_id")
    if body.client_secret == CLEAR_SENTINEL:
        stored.pop("client_secret", None)
        cleared.append("client_secret")
    elif body.client_secret:
        stored["client_secret"] = body.client_secret
        changed.append("client_secret")
    if body.redirect_uri:
        stored["redirect_uri"] = _validate_public_https_uri(body.redirect_uri)
        changed.append("redirect_uri")
    if body.api_token == CLEAR_SENTINEL:
        stored.pop("api_token", None)
        cleared.append("api_token")
    elif body.api_token:
        stored["api_token"] = body.api_token
        changed.append("api_token")
    if body.provider_slug:
        stored["provider_slug"] = body.provider_slug.strip().strip("/")
        changed.append("provider_slug")
    cfg["authentik"] = stored
    save_oauth_config(cfg)
    _audit(staff.get("username", ""), "settings_update", target="oauth_upstream",
           details={"changed": changed, "cleared": cleared})
    return upstream_public()


def _step(name: str, ok: bool, detail: str = "", hint: str = "") -> dict:
    return {"name": name, "ok": bool(ok), "detail": str(detail)[:250], "hint": hint}


def _exc_name(exc: BaseException) -> str:
    """Qualified exception name — bare class names like struct's `error` are
    cryptic in the panel; `struct.error` is self-explanatory."""
    kind = type(exc).__name__
    mod = type(exc).__module__
    return kind if mod in ("builtins", "exceptions") else f"{mod}.{kind}"


async def _probe_authentik(cfg: dict) -> list[dict]:
    """Staged upstream check: discovery → JWKS → authorize smoke.

    The client *secret* cannot be verified without a real user login (Authentik
    2025.10 exposes no secret-read API), so the authorize smoke only proves the
    client_id is registered; secret health is reported via signals() instead.
    """
    steps: list[dict] = []
    if _httpx is None:
        return [_step("http-client", False, "httpx is not installed",
                       "Install httpx in the backend image to enable probing")]
    issuer = (cfg.get("issuer") or "").rstrip("/")
    if not issuer:
        return [_step("issuer", False, "No issuer configured", "Set the issuer in the Upstream IdP tab")]
    # Authentik serves OIDC discovery per application slug —
    # /application/o/<slug>/.well-known/openid-configuration — and 404s the
    # root /.well-known path. Try the slug URL first when known.
    slug = (cfg.get("provider_slug") or "").strip().strip("/")
    candidates = ([f"{issuer}/application/o/{slug}/.well-known/openid-configuration"] if slug else [])
    candidates.append(f"{issuer}/.well-known/openid-configuration")
    try:
        async with _httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            doc: dict = {}
            tried: list[str] = []
            for disco_url in candidates:
                try:
                    r = await c.get(disco_url)
                    tried.append(f"{disco_url} → HTTP {r.status_code}")
                    if r.status_code == 200:
                        maybe = r.json()
                        if isinstance(maybe, dict) and maybe.get("token_endpoint"):
                            doc = maybe
                            break
                except Exception as exc:
                    tried.append(f"{disco_url} → {type(exc).__name__}")
                    return [_step("discovery", False, f"Unreachable: {type(exc).__name__}: {str(exc)[:120]}",
                                   "Check the issuer URL and that Authentik is running")]
            if not doc:
                hint = ("Set the Authentik application slug in the Upstream IdP tab — "
                        "discovery lives at /application/o/<slug>/.well-known/openid-configuration"
                        if not slug else
                        "Check the application slug and that its provider exposes OIDC discovery")
                steps.append(_step("discovery", False,
                                   f"No token_endpoint in discovery doc ({'; '.join(tried)})", hint))
                return steps
            steps.append(_step("discovery", True, f"token_endpoint {doc.get('token_endpoint')}"))
            jwks_candidates = [u for u in [
                doc.get("jwks_uri"),
                f"{issuer}/application/o/{slug}/jwks/" if slug else "",
                f"{issuer}/application/o/jwks/",
            ] if u]
            keys: list = []
            jwks_status = 0
            for jwks_uri in jwks_candidates:
                try:
                    jr = await c.get(jwks_uri)
                    jwks_status = jr.status_code
                    body = jr.json() if jr.status_code == 200 else {}
                    if isinstance(body, dict) and body.get("keys"):
                        keys = body["keys"]
                        break
                except Exception as exc:
                    steps.append(_step("jwks", False, f"Fetch failed: {type(exc).__name__}",
                                       "JWKS must be reachable for token verification"))
                    return steps
            if not keys:
                steps.append(_step("jwks", False, f"HTTP {jwks_status} — empty key set",
                                   "Check the Authentik provider signing settings"))
                return steps
            steps.append(_step("jwks", True, f"{len(keys)} signing key(s)"))
            client_id = cfg.get("client_id") or ""
            if not client_id:
                steps.append(_step("authorize", False, "No client_id configured", "Set the client ID first"))
                return steps
            from urllib.parse import urlencode as _urlencode
            auth_url = (f"{issuer}/application/o/authorize/?" + _urlencode({
                "client_id": client_id,
                "redirect_uri": cfg.get("redirect_uri") or f"{issuer}/",
                "response_type": "code",
                "scope": "openid",
                "state": "healthcheck",
            }))
            try:
                ar = await c.get(auth_url)
            except Exception as exc:
                steps.append(_step("authorize", False, f"Unreachable: {type(exc).__name__}",
                                   "Discovery worked but authorize did not respond"))
                return steps
            if ar.status_code == 200:
                steps.append(_step("authorize", True, "Authorize endpoint serves the login flow — client_id is registered"))
            else:
                steps.append(_step("authorize", False, f"HTTP {ar.status_code} — client_id likely not registered under this issuer",
                                   "Create the OAuth2 provider + application in Authentik with this client ID"))
    except Exception as exc:
        steps.append(_step("probe", False, f"{type(exc).__name__}: {str(exc)[:150]}", "Retry; check backend egress"))
    return steps


@router.post("/upstream/verify")
async def verify_upstream(staff: dict = Depends(require_admin)):
    cfg = get_authentik_config()
    steps = await _probe_authentik(cfg)
    return {"ok": all(s["ok"] for s in steps), "steps": steps}


@router.get("/upstream/signals")
async def upstream_signals(staff: dict = Depends(require_admin)):
    """Secret health via observed logins: the secret itself is unreadable, so a
    fresh successful login is the proof it matches, and a stall is the alarm."""
    out: dict = {"last_success_at": None, "last_success_user": None,
                 "linked_recent": 0, "recent_logins": []}
    try:
        res = supabase.table("users").select("username,last_seen,authentik_id") \
            .order("last_seen", desc=True).limit(200).execute()
        linked = [r for r in (res.data or []) if r.get("authentik_id")]
        out["linked_recent"] = len(linked)
        fresh = [r for r in linked if r.get("last_seen")]
        if fresh:
            out["last_success_at"] = fresh[0].get("last_seen")
            out["last_success_user"] = fresh[0].get("username")
    except Exception as exc:
        out["users_error"] = str(exc)[:150]
    try:
        res = supabase.table("audit_logs").select("actor,action,created_at") \
            .in_("action", ["authentik_login", "authentik_connect"]) \
            .order("created_at", desc=True).limit(5).execute()
        out["recent_logins"] = [
            {"at": r.get("created_at"), "user": r.get("actor"), "action": r.get("action")}
            for r in (res.data or [])
        ]
    except Exception as exc:
        out["audit_error"] = str(exc)[:150]
    return out
