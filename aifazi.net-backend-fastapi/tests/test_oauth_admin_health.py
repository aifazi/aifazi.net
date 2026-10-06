"""Identity & OAuth panel backend — health probes, upstream Authentik CRUD,
provider credential tests, client rotation, staged LDAP probe.

Follows the repo's hermetic router-test pattern (cf.
test_authentik_identity_toggle.py): `database`/`dependencies` are stubbed in
sys.modules, the real router module is loaded from file, and network is faked
(fake `httpx`, monkeypatched `socket`, fake `ldap3`) so no test touches DNS,
TCP, or third-party APIs.
"""
from __future__ import annotations

import importlib.util
import json
import os
import socket
import sys
import types

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

ENV_KEYS = ("AUTHENTIK_ISSUER", "AUTHENTIK_CLIENT_ID", "AUTHENTIK_CLIENT_SECRET",
            "AUTHENTIK_REDIRECT_URI", "AUTHENTIK_API_TOKEN",
            "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
            "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "STEAM_API_KEY")


# ── DB stub ───────────────────────────────────────────────────────────────────

class _Table:
    def __init__(self, store: dict, writes: list, name: str):
        self._store = store
        self._writes = writes
        self._name = name
        self._payload = None

    def select(self, *a, **k):
        return self

    def insert(self, payload):
        self._payload = ("insert", payload)
        return self

    def update(self, payload):
        self._payload = ("update", payload)
        return self

    def delete(self):
        self._payload = ("delete", None)
        return self

    def eq(self, *a, **k):
        return self

    def neq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def range(self, *a, **k):
        return self

    def execute(self):
        if self._payload:
            op, payload = self._payload
            self._writes.append((self._name, op, payload))
            if self._name == "site_config" and op == "update" and payload:
                self._store["settings"] = payload.get("settings", self._store.get("settings", {}))
            return types.SimpleNamespace(data=[{"id": "w1"}], count=1)
        if self._name == "site_config":
            return types.SimpleNamespace(data=[{"settings": self._store.get("settings", {})}], count=1)
        if self._name == "users":
            return types.SimpleNamespace(data=list(self._store.get("users", [])), count=len(self._store.get("users", [])))
        if self._name == "audit_logs":
            return types.SimpleNamespace(data=list(self._store.get("audit", [])), count=len(self._store.get("audit", [])))
        return types.SimpleNamespace(data=[], count=0)


def _db_stub(store: dict, writes: list):
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(table=lambda name: _Table(store, writes, name))
    return db


def _deps_stub():
    deps = types.ModuleType("dependencies")
    admin = {"id": "admin-1", "username": "root", "role": "admin"}
    deps.require_admin = lambda: admin
    deps.get_current_user = lambda: admin
    return deps


# ── httpx stub ────────────────────────────────────────────────────────────────

class _FakeResp:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload if payload is not None else {}
        self.text = text or json.dumps(self._payload)

    def json(self):
        return self._payload


class _FakeHTTPX:
    """Fake httpx module: routes {(METHOD, url-prefix): _FakeResp|Exception}."""

    def __init__(self, routes: dict):
        self._routes = routes
        self.calls: list = []

    def _respond(self, method: str, url: str):
        self.calls.append((method, url))
        for (m, prefix), outcome in self._routes.items():
            if m == method and url.startswith(prefix):
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome
        return _FakeResp(404, {})

    def AsyncClient(self, *a, **k):
        outer = self

        class _Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def get(self, url, **k):
                return outer._respond("GET", url)

            async def post(self, url, **k):
                return outer._respond("POST", url)

        return _Client()


def _httpx_module(routes: dict):
    mod = types.ModuleType("httpx")
    fake = _FakeHTTPX(routes)
    mod.AsyncClient = fake.AsyncClient
    mod._fake = fake
    return mod


# ── ldap3 stub ────────────────────────────────────────────────────────────────

class _FakeBindError(Exception):
    pass


class LDAPAttributeError(Exception):
    """Mirrors ldap3.core.exceptions.LDAPAttributeError raised by strict
    servers (Authentik LDAP outpost) for invalid attribute types."""


def _ldap3_module(bind_password_ok: str):
    mod = types.ModuleType("ldap3")
    mod.Server = lambda url, **k: types.SimpleNamespace(url=url)

    class _Conn:
        def __init__(self, server, user=None, password=None, auto_bind=False, receive_timeout=None, **k):
            if receive_timeout is not None:
                # Mirror real ldap3 on POSIX (strategy/base.py): the timeout
                # is packed with struct integers-only — a float raises
                # struct.error, which is exactly the Oct 2026 panel outage.
                from struct import pack
                pack("LL", receive_timeout, 0)
            if password != bind_password_ok:
                raise _FakeBindError("invalidCredentials")
            self.entries = [types.SimpleNamespace(entry_dn="dc=x")]

        def search(self, **k):
            # Mirror Authentik LDAP outpost strictness: "dn" is not a real
            # attribute type and is rejected; "*" is accepted everywhere.
            if list(k.get("attributes") or []) == ["dn"]:
                raise LDAPAttributeError("invalid attribute type dn")
            self.entries = [types.SimpleNamespace(entry_dn="dc=x")]
            return True

        def unbind(self):
            pass

    mod.Connection = _Conn
    return mod


# ── loader ────────────────────────────────────────────────────────────────────

def _load(monkeypatch, store=None, writes=None, httpx_routes=None, ldap_ok_pw=None):
    store = {"settings": {}, "users": [], "audit": []} if store is None else store
    writes = [] if writes is None else writes
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    # utils.audit binds `database` at its own import time, so the real module
    # would keep writing to the FIRST test's stub. Stub record() per test.
    audit_mod = types.ModuleType("utils.audit")

    def _record(actor, action, target=None, details=None, **k):
        writes.append(("audit_logs", "insert",
                       {"actor": actor, "action": action, "target": target, "details": details}))

    audit_mod.record = _record
    audit_mod.record_auth = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "utils.audit", audit_mod)
    if httpx_routes is not None:
        monkeypatch.setitem(sys.modules, "httpx", _httpx_module(httpx_routes))
    if ldap_ok_pw is not None:
        monkeypatch.setitem(sys.modules, "ldap3", _ldap3_module(ldap_ok_pw))
    spec = importlib.util.spec_from_file_location(
        "oauth_admin_under_test", os.path.join(BACKEND_DIR, "routers", "oauth_admin.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    # Production mounts this router at /admin/oauth (routes are prefix-less).
    app.include_router(module.router, prefix="/admin/oauth")
    return module, TestClient(app, raise_server_exceptions=False), store, writes


def _settings(lldap=None, providers=None, clients=None, authentik=None):
    s = {"oauth": {}}
    if lldap is not None:
        s["oauth"]["lldap"] = lldap
    if providers is not None:
        s["oauth"]["providers"] = providers
    if clients is not None:
        s["oauth"]["clients"] = clients
    if authentik is not None:
        s["oauth"]["authentik"] = authentik
    return s


# ── upstream CRUD ─────────────────────────────────────────────────────────────

def test_upstream_get_masks_secrets(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(authentik={
        "issuer": "https://auth.example.com", "client_id": "cid",
        "client_secret": "supersecretvalue123", "api_token": "tok12345678"})})
    r = client.get("/admin/oauth/upstream")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["client_secret_set"] is True
    assert body["api_token_set"] is True
    assert body["sources"]["client_secret"] == "portal"
    assert "supersecretvalue123" not in r.text
    assert "tok12345678" not in r.text


def test_upstream_put_saves_and_clears(monkeypatch):
    _, client, store, writes = _load(monkeypatch, {"settings": _settings()})
    r = client.put("/admin/oauth/upstream", json={"issuer": "https://auth.example.com",
                                      "client_id": "cid",
                                      "client_secret": "s3cr3t-value-long",
                                      "api_token": "admintokenvalue"})
    assert r.status_code == 200, r.text
    assert store["settings"]["oauth"]["authentik"]["client_secret"] == "s3cr3t-value-long"
    assert any(w[0] == "site_config" and w[1] == "update" for w in writes)
    # audit rows record *which keys* changed — never the secret value itself
    audit_writes = [w for w in writes if w[0] == "audit_logs"]
    assert audit_writes
    assert not any("s3cr3t-value-long" in json.dumps(w[2] or {}) for w in audit_writes)

    r = client.put("/admin/oauth/upstream", json={"client_secret": "__CLEAR__"})
    assert r.status_code == 200, r.text
    assert "client_secret" not in store["settings"]["oauth"]["authentik"]
    assert r.json()["client_secret_set"] is False


def test_upstream_put_rejects_non_https_issuer(monkeypatch):
    _, client, _, _ = _load(monkeypatch)
    r = client.put("/admin/oauth/upstream", json={"issuer": "http://auth.example.com"})
    assert r.status_code == 400, r.text


def test_portal_wins_over_env(monkeypatch):
    mod, _, _, _ = _load(monkeypatch, {"settings": _settings(authentik={
        "client_secret": "portal-secret"})})
    monkeypatch.setenv("AUTHENTIK_CLIENT_SECRET", "env-secret")
    merged = mod.get_authentik_config()
    assert merged["client_secret"] == "portal-secret"
    assert merged["sources"]["client_secret"] == "portal"


def test_env_used_when_no_portal(monkeypatch):
    mod, _, _, _ = _load(monkeypatch, {"settings": _settings()})
    monkeypatch.setenv("AUTHENTIK_CLIENT_SECRET", "env-secret")
    monkeypatch.setenv("AUTHENTIK_API_TOKEN", "env-token")
    merged = mod.get_authentik_config()
    assert merged["client_secret"] == "env-secret"
    assert merged["sources"]["client_secret"] == "env"
    assert mod.get_authentik_api_token() == "env-token"


# ── upstream verify / signals ─────────────────────────────────────────────────

def _verify_routes_ok():
    base = "https://auth.example.com"
    return {
        ("GET", f"{base}/.well-known/openid-configuration"): _FakeResp(200, {
            "token_endpoint": f"{base}/application/o/token/",
            "jwks_uri": f"{base}/application/o/jwks/"}),
        ("GET", f"{base}/application/o/jwks/"): _FakeResp(200, {"keys": [{"kty": "RSA"}]}),
        ("GET", f"{base}/application/o/authorize/"): _FakeResp(200, {"ok": True}),
    }


def test_upstream_verify_all_green(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(authentik={
        "issuer": "https://auth.example.com", "client_id": "cid",
        "client_secret": "s"})}, httpx_routes=_verify_routes_ok())
    r = client.post("/admin/oauth/upstream/verify")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert [s["name"] for s in body["steps"]] == ["discovery", "jwks", "authorize"]


def test_upstream_verify_discovery_down(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(authentik={
        "issuer": "https://auth.example.com", "client_id": "cid"})}, httpx_routes={})
    r = client.post("/admin/oauth/upstream/verify")
    body = r.json()
    assert body["ok"] is False
    assert body["steps"][0]["name"] == "discovery"
    assert body["steps"][0]["hint"]


def test_upstream_signals(monkeypatch):
    store = {"settings": _settings(), "users": [
        {"username": "alice", "last_seen": "2026-10-04T14:00:00+00:00", "authentik_id": "uuid-1"},
        {"username": "bob", "last_seen": "2026-10-03T10:00:00+00:00", "authentik_id": None},
    ], "audit": [
        {"actor": "alice", "action": "authentik_login", "created_at": "2026-10-04T14:00:00+00:00"},
    ]}
    _, client, _, _ = _load(monkeypatch, store)
    r = client.get("/admin/oauth/upstream/signals")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["last_success_user"] == "alice"
    assert body["last_success_at"] == "2026-10-04T14:00:00+00:00"
    assert body["linked_recent"] == 1
    assert body["recent_logins"][0]["user"] == "alice"


# ── staged LDAP probe ─────────────────────────────────────────────────────────

def _no_dns(monkeypatch):
    def _fail(host, port, *a, **k):
        raise socket.gaierror(-2, "Name or service not known")
    monkeypatch.setattr(socket, "getaddrinfo", _fail)


def test_ldap_inline_dns_failure_without_persisting(monkeypatch):
    _no_dns(monkeypatch)
    _, client, store, writes = _load(monkeypatch, {"settings": _settings(lldap={
        "url": "ldap://lldap:3890", "bind_dn": "uid=admin", "bind_password": "pw"})})
    r = client.post("/admin/oauth/test-ldap", json={"lldap": {"url": "ldap://no-such-dir.invalid:389"}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is False
    assert body["steps"][0]["name"] == "dns"
    assert body["steps"][0]["hint"]
    # draft values were probed, never saved
    assert store["settings"]["oauth"]["lldap"]["url"] == "ldap://lldap:3890"
    assert not [w for w in writes if w[0] == "site_config"]


def test_ldap_full_staged_success(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                        lambda host, port, *a, **k: [(2, 1, 6, "", ("10.0.0.5", port))])
    monkeypatch.setattr(socket, "create_connection",
                        lambda addr, *a, **k: types.SimpleNamespace(close=lambda: None))
    _, client, _, _ = _load(monkeypatch, {"settings": _settings()},
                            ldap_ok_pw="right-pw")
    r = client.post("/admin/oauth/test-ldap", json={"lldap": {
        "url": "ldap://dir.example.com:389", "bind_dn": "uid=admin",
        "bind_password": "right-pw", "base_dn": "dc=example,dc=com"}})
    body = r.json()
    assert body["ok"] is True, body
    assert [s["name"] for s in body["steps"]] == ["dns", "tcp", "bind", "search"]


def test_ldap_wrong_password_reports_bind_layer(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                        lambda host, port, *a, **k: [(2, 1, 6, "", ("10.0.0.5", port))])
    monkeypatch.setattr(socket, "create_connection",
                        lambda addr, *a, **k: types.SimpleNamespace(close=lambda: None))
    _, client, _, _ = _load(monkeypatch, {"settings": _settings()},
                            ldap_ok_pw="right-pw")
    r = client.post("/admin/oauth/test-ldap", json={"lldap": {
        "url": "ldap://dir.example.com:389", "bind_dn": "uid=admin",
        "bind_password": "wrong-pw"}})
    body = r.json()
    assert body["ok"] is False
    assert body["steps"][-1]["name"] == "bind"
    assert "password" in body["steps"][-1]["hint"].lower()


# ── provider tests ────────────────────────────────────────────────────────────

def test_provider_test_discord_ok_and_rejected(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(providers={
        "discord": {"client_id": "id", "client_secret": "sec", "enabled": True}})},
        httpx_routes={("POST", "https://discord.com/api/oauth2/token"): _FakeResp(200, {"access_token": "x"})})
    r = client.post("/admin/oauth/providers/discord/test")
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True


def test_provider_test_unconfigured_is_400(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings()})
    r = client.post("/admin/oauth/providers/github/test")
    assert r.status_code == 400, r.text


def test_provider_test_steam_key(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(providers={
        "steam": {"api_key": "key", "enabled": True}})},
        httpx_routes={("GET", "https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/"): _FakeResp(
            200, {"servertime": 123})})
    r = client.post("/admin/oauth/providers/steam/test")
    assert r.json()["ok"] is True


# ── client rotate ─────────────────────────────────────────────────────────────

def test_client_rotate_once_and_masked(monkeypatch):
    _, client, store, _ = _load(monkeypatch, {"settings": _settings(clients={
        "my-app": {"name": "My App", "secret": "old-secret", "redirect_uris": [], "public": False}})})
    r = client.post("/admin/oauth/clients/my-app/rotate")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["secret"] and body["secret"] != "old-secret"
    assert store["settings"]["oauth"]["clients"]["my-app"]["secret"] == body["secret"]
    assert "old-secret" not in r.text


def test_client_rotate_public_and_missing(monkeypatch):
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(clients={
        "spa": {"name": "SPA", "secret": "", "redirect_uris": [], "public": True}})})
    assert client.post("/admin/oauth/clients/spa/rotate").status_code == 400
    assert client.post("/admin/oauth/clients/ghost/rotate").status_code == 404


# ── health aggregate ──────────────────────────────────────────────────────────

def test_health_skips_unconfigured_without_network(monkeypatch):
    _no_dns(monkeypatch)
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(
        lldap={"enabled": False}, providers={}, clients={})},
        httpx_routes={})
    r = client.get("/admin/oauth/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lldap"]["status"] == "disabled"
    assert body["upstream"]["status"] == "unconfigured"
    assert body["providers"]["discord"]["status"] == "unconfigured"
    assert body["clients"]["count"] == 0
    assert body["generated_at"]


# ── provider slug (Authentik serves discovery per application slug) ──────────

def test_upstream_put_slug(monkeypatch):
    _, client, store, _ = _load(monkeypatch, {"settings": _settings()})
    r = client.put("/admin/oauth/upstream", json={"provider_slug": "myapp"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider_slug"] == "myapp"
    assert body["sources"]["provider_slug"] == "portal"
    assert store["settings"]["oauth"]["authentik"]["provider_slug"] == "myapp"


def test_upstream_verify_slug_discovery_when_root_404s(monkeypatch):
    # Stock Authentik 404s the root /.well-known path; the probe must fall
    # through to /application/o/<slug>/.well-known/openid-configuration.
    base = "https://auth.example.com"
    routes = {
        ("GET", f"{base}/.well-known/openid-configuration"): _FakeResp(404, {}),
        ("GET", f"{base}/application/o/myapp/.well-known/openid-configuration"): _FakeResp(200, {
            "token_endpoint": f"{base}/application/o/token/",
            "jwks_uri": f"{base}/application/o/myapp/jwks/"}),
        ("GET", f"{base}/application/o/myapp/jwks/"): _FakeResp(200, {"keys": [{"kty": "RSA"}]}),
        ("GET", f"{base}/application/o/authorize/"): _FakeResp(200, {"ok": True}),
    }
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(authentik={
        "issuer": base, "client_id": "cid", "client_secret": "s",
        "provider_slug": "myapp"})}, httpx_routes=routes)
    r = client.post("/admin/oauth/upstream/verify")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True, body
    assert [s["name"] for s in body["steps"]] == ["discovery", "jwks", "authorize"]


def test_upstream_verify_hints_slug_when_no_slug_set(monkeypatch):
    base = "https://auth.example.com"
    routes = {("GET", f"{base}/.well-known/openid-configuration"): _FakeResp(404, {})}
    _, client, _, _ = _load(monkeypatch, {"settings": _settings(authentik={
        "issuer": base, "client_id": "cid", "client_secret": "s"})}, httpx_routes=routes)
    r = client.post("/admin/oauth/upstream/verify")
    body = r.json()
    assert body["ok"] is False
    assert "slug" in body["steps"][0]["hint"]


def test_health_survives_crashing_provider_probe(monkeypatch):
    # One throwing provider probe must not 500 the whole doctor endpoint —
    # it is reported as an error step while the rest still runs.
    mod, client, _, _ = _load(monkeypatch, {"settings": _settings(providers={
        "discord": {"client_id": "id", "client_secret": "sec", "enabled": True}})},
        httpx_routes={})
    real_resolved = mod._provider_resolved

    def _boom(pid):
        if pid == "discord":
            raise RuntimeError("probe exploded")
        return real_resolved(pid)

    monkeypatch.setattr(mod, "_provider_resolved", _boom)
    r = client.get("/admin/oauth/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["providers"]["discord"]["status"] == "error"
    # CodeQL #100: the crash is reported with the exception TYPE only —
    # the message ("probe exploded") must never reach the response.
    assert body["providers"]["discord"]["detail"] == "Probe crashed (RuntimeError)"
    assert "probe exploded" not in body["providers"]["discord"]["detail"]
    assert body["providers"]["github"]["status"] == "unconfigured"


def test_ldap_url_rejects_mapped_private_addresses(monkeypatch):
    # R6-3: IPv4-mapped IPv6 must test as its embedded v4 address —
    # ::ffff:127.0.0.1 etc. previously slipped past the literal checks.
    mod, _, _, _ = _load(monkeypatch)
    for url in ("ldap://[::ffff:127.0.0.1]/", "ldap://[::ffff:169.254.169.254]/",
                "ldap://[::ffff:224.0.0.1]/", "ldap://[::ffff:0.0.0.0]/"):
        try:
            mod._validate_ldap_url(url)
            raise AssertionError(f"accepted {url}")
        except HTTPException as exc:
            assert exc.status_code == 400
    # Controls: legit internal hostname, public IP, and mapped RFC1918
    # (private space is permitted, mapped or not) still pass.
    assert mod._validate_ldap_url("ldap://lldap:3890") == "ldap://lldap:3890"
    assert "8.8.8.8" in mod._validate_ldap_url("ldap://8.8.8.8/")
    assert "10.0.0.1" in mod._validate_ldap_url("ldap://[::ffff:10.0.0.1]/")

