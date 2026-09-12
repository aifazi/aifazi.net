"""LLDAP client — bind authentication + user lookup."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

log = logging.getLogger("ldap")

# Defaults match the production Coolify LLDAP service on the mailnet.
# Runtime values prefer admin-portal config (site_config.settings.oauth.lldap)
# and fall back to env vars.
LLDAP_URL = os.getenv("LLDAP_URL", "ldap://lldap:3890")
LLDAP_BASE_DN = os.getenv("LLDAP_BASE_DN", "dc=aifazi,dc=net")
LLDAP_USERS_OU = os.getenv("LLDAP_USERS_OU", f"ou=people,{LLDAP_BASE_DN}")
LLDAP_BIND_DN = os.getenv("LLDAP_BIND_DN", f"uid=admin,ou=people,{LLDAP_BASE_DN}")
LLDAP_BIND_PASSWORD = os.getenv("LLDAP_BIND_PASSWORD", "")
LLDAP_TIMEOUT = float(os.getenv("LLDAP_TIMEOUT", "5"))


def _runtime_config() -> tuple[str, str, str, str, str]:
    """Return (url, base_dn, bind_dn, bind_password, users_ou) with portal overrides."""
    url, base_dn = LLDAP_URL, LLDAP_BASE_DN
    bind_dn, bind_pw = LLDAP_BIND_DN, LLDAP_BIND_PASSWORD
    users_ou = LLDAP_USERS_OU
    try:
        from routers.oauth_admin import get_oauth_config
        ldap = get_oauth_config().get("lldap") or {}
        if ldap.get("enabled", True):
            url = ldap.get("url") or url
            base_dn = ldap.get("base_dn") or base_dn
            bind_dn = ldap.get("bind_dn") or bind_dn
            bind_pw = ldap.get("bind_password") or bind_pw
            users_ou = ldap.get("users_ou") or f"ou=people,{base_dn}"
    except Exception:
        users_ou = f"ou=people,{base_dn}"
    return url, base_dn, bind_dn, bind_pw, users_ou


class LdapError(Exception):
    pass


class LdapUnavailable(LdapError):
    pass


class LdapAuthFailed(LdapError):
    pass


@dataclass
class LdapUser:
    uid: str
    email: str
    display_name: str = ""
    groups: list[str] = field(default_factory=list)
    dn: str = ""


def _connect(url: str | None = None):
    try:
        from ldap3 import ALL, Connection, Server  # type: ignore
    except ImportError as exc:
        raise LdapUnavailable("ldap3 is not installed") from exc
    server = Server(url or LLDAP_URL, get_info=ALL, connect_timeout=LLDAP_TIMEOUT)
    return server, Connection


def _ldap_escape(value: str) -> str:
    """Escape RFC 4515 filter special characters."""
    out = []
    for ch in value:
        if ch in "\\*()\0":
            out.append(f"\\{ord(ch):02x}")
        else:
            out.append(ch)
    return "".join(out)


def _normalize_identifier(identifier: str) -> tuple[str, str]:
    """Return (original identifier, LDAP search filter)."""
    ident = (identifier or "").strip()
    if not ident:
        raise LdapAuthFailed("Empty credentials")
    safe = _ldap_escape(ident)
    if "@" in ident:
        return ident, f"(&(objectClass=person)(mail={safe}))"
    return ident, f"(&(objectClass=person)(uid={safe}))"


def bind_user(identifier: str, password: str) -> LdapUser:
    """Authenticate a user against LLDAP via LDAP simple bind.

    LLDAP does not expose password hashes, so bind-as-user is the only
    correct verification path (same approach Stalwart uses).
    """
    if not password:
        raise LdapAuthFailed("Empty credentials")
    ident, filt = _normalize_identifier(identifier)
    url, _base, bind_dn, bind_pw, users_ou = _runtime_config()
    server, Connection = _connect(url)
    try:
        svc = Connection(
            server,
            user=bind_dn,
            password=bind_pw,
            auto_bind=True,
            receive_timeout=LLDAP_TIMEOUT,
        )
    except Exception as exc:
        log.error("LLDAP service bind failed: %s", exc)
        raise LdapUnavailable(f"Directory unavailable: {exc}") from exc

    try:
        svc.search(
            search_base=users_ou,
            search_filter=filt,
            attributes=["uid", "mail", "cn", "displayName", "memberOf"],
        )
        if not svc.entries:
            raise LdapAuthFailed("User not found")
        entry = svc.entries[0]
        user_dn = str(entry.entry_dn)
        uid = str(entry.uid) if hasattr(entry, "uid") else ident
        email = str(entry.mail) if hasattr(entry, "mail") else ""
        display = ""
        if hasattr(entry, "displayName") and entry.displayName:
            display = str(entry.displayName)
        elif hasattr(entry, "cn") and entry.cn:
            display = str(entry.cn)
        groups: list[str] = []
        if hasattr(entry, "memberOf") and entry.memberOf:
            for g in entry.memberOf.values:
                s = str(g)
                if s.lower().startswith("cn="):
                    groups.append(s.split(",", 1)[0][3:])
    finally:
        try:
            svc.unbind()
        except Exception:
            pass

    try:
        user_conn = Connection(
            server,
            user=user_dn,
            password=password,
            auto_bind=True,
            receive_timeout=LLDAP_TIMEOUT,
        )
        user_conn.unbind()
    except Exception as exc:
        log.info("LLDAP user bind failed for %s: %s", ident, type(exc).__name__)
        raise LdapAuthFailed("Invalid credentials") from exc

    return LdapUser(
        uid=uid,
        email=email or (ident if "@" in ident else f"{uid}@aifazi.net"),
        display_name=display,
        groups=groups,
        dn=user_dn,
    )


def healthcheck() -> bool:
    """True if LLDAP accepts the service bind."""
    try:
        url, _base, bind_dn, bind_pw, _ou = _runtime_config()
        server, Connection = _connect(url)
        conn = Connection(
            server,
            user=bind_dn,
            password=bind_pw,
            auto_bind=True,
            receive_timeout=LLDAP_TIMEOUT,
        )
        conn.unbind()
        return True
    except Exception as exc:
        log.warning("LLDAP healthcheck failed: %s", exc)
        return False
