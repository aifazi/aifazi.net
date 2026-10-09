"""Round-8 safe fixes: masked site_settings PUT, Stripe checkout URL guard."""
from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class _Query:
    def __init__(self, rows, writes):
        self._rows = rows
        self._writes = writes
        self._op = "select"
        self._payload = None

    def select(self, *a, **k):
        return self

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self._op in ("update", "insert"):
            self._writes.append((self._op, self._payload))
            payload = self._payload or {}
            # Mirror real semantics: the write echoes the stored row.
            row = {"id": "w1"}
            if "settings" in payload:
                row["settings"] = payload["settings"]
            return types.SimpleNamespace(data=[row])
        return types.SimpleNamespace(data=self._rows)


def _db_stub(rows, writes):
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(table=lambda name: _Query(rows, writes))
    db._escape_ilike = lambda v: v
    db.safe_search_term = lambda v: v
    db.safe_or_in = lambda v: v
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _deps_stub(actor):
    deps = types.ModuleType("dependencies")
    deps.require_admin = lambda: actor
    deps.require_staff = lambda: actor
    deps.get_current_user = lambda: actor
    return deps


def _audit_stub():
    m = types.ModuleType("utils.audit")
    m.record = lambda *a, **k: None
    m.record_auth = lambda *a, **k: None
    return m


def _load(monkeypatch, filename, extra_modules=None):
    monkeypatch.setitem(sys.modules, "utils.audit", _audit_stub())
    for name, mod in (extra_modules or {}).items():
        monkeypatch.setitem(sys.modules, name, mod)
    spec = importlib.util.spec_from_file_location(
        filename.replace(".py", "_under_test"),
        os.path.join(BACKEND_DIR, "routers", filename))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _client(module, prefix):
    app = FastAPI()
    app.include_router(module.router, prefix=prefix)
    return TestClient(app, raise_server_exceptions=False)


ADMIN = {"id": "a1", "username": "root", "role": "admin"}
MOD = {"id": "m1", "username": "mod", "role": "moderator"}
USER = {"id": "u1", "username": "u", "email": "u@x.test", "role": "user"}

SETTINGS_WITH_SECRETS = {
    "theme": "neon",
    "oauth": {
        "clients": {"web": {"secret": "SUPERSECRET-client-value"}},
        "lldap": {"bind_password": "SUPERSECRET-bind-value"},
        "authentik": {"client_secret": "SUPERSECRET-ak-value"},
    },
}


def test_site_settings_put_masks_secrets(monkeypatch):
    writes: list = []
    monkeypatch.setitem(sys.modules, "database",
                        _db_stub([{"settings": dict(SETTINGS_WITH_SECRETS)}], writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub(ADMIN))
    mod = _load(monkeypatch, "site_settings.py")
    client = _client(mod, "/api/admin/site-settings")
    r = client.put("/api/admin/site-settings", json={"theme": "midnight"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["theme"] == "midnight"
    dumped = __import__("json").dumps(body)
    assert "SUPERSECRET-client-value" not in dumped
    assert "SUPERSECRET-bind-value" not in dumped
    assert "SUPERSECRET-ak-value" not in dumped


def test_site_settings_put_non_admin_blocked_on_auth_keys(monkeypatch):
    monkeypatch.setitem(sys.modules, "database",
                        _db_stub([{"settings": {"theme": "neon"}}], []))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub(MOD))
    mod = _load(monkeypatch, "site_settings.py")
    client = _client(mod, "/api/admin/site-settings")
    r = client.put("/api/admin/site-settings",
                   json={"oauth": {"clients": {"evil": {"redirect_uris": ["https://evil.test/cb"]}}}})
    assert r.status_code == 403, r.text


def _stripe_stub():
    stripe = types.ModuleType("stripe")

    class _List(list):
        @property
        def data(self):
            return list(self)

    def _obj(**kw):
        ns = types.SimpleNamespace(**kw)
        ns.id = kw.get("id", "x_1")
        return ns

    stripe.Product = types.SimpleNamespace(
        list=lambda **k: _List(),
        create=lambda **k: _obj(id="prod_1"),
    )
    stripe.Price = types.SimpleNamespace(
        list=lambda **k: _List(),
        create=lambda **k: _obj(id="price_1"),
    )
    stripe.checkout = types.SimpleNamespace(
        Session=types.SimpleNamespace(
            create=lambda **k: _obj(url="https://checkout.stripe.com/pay", id="cs_1")))
    return stripe


def _store_client(monkeypatch, plans):
    writes: list = []
    monkeypatch.setitem(sys.modules, "database", _db_stub(plans, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub(USER))
    monkeypatch.setenv("STRIPE_SECRET_KEY", "test-only-placeholder")
    se = types.ModuleType("routers.store_ecommerce")
    se._mark_order_paid = lambda *a, **k: None
    mod = _load(monkeypatch, "store.py", {"stripe": _stripe_stub(),
                                          "routers.store_ecommerce": se})
    return _client(mod, "/api/store"), writes


PLAN = {"id": "p1", "slug": "pro", "name": "Pro", "active": True,
        "price_cents": 500, "interval": "month"}


def test_checkout_rejects_offsite_urls(monkeypatch):
    client, _ = _store_client(monkeypatch, [dict(PLAN)])
    r = client.post("/api/store/checkout", json={
        "plan_slug": "pro",
        "success_url": "https://evil.test/steal?session=",
        "cancel_url": "https://evil.test/bye",
    })
    assert r.status_code == 400, r.text
    assert "site domain" in r.text


def test_checkout_defaults_stay_onsite(monkeypatch):
    client, _ = _store_client(monkeypatch, [dict(PLAN)])
    r = client.post("/api/store/checkout", json={"plan_slug": "pro"})
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://checkout.stripe.com/")


def _ldap_client(monkeypatch, users):
    writes: list = []
    monkeypatch.setitem(sys.modules, "database",
                        _db_stub([{"settings": {"oauth": {"enabled": True}}}], writes))

    shared = types.ModuleType("routers.auth_shared")
    shared._audit = lambda *a, **k: None
    shared._auth_log = lambda *a, **k: None
    shared._record_user_activity = lambda *a, **k: None
    shared._upsert_forum_session = lambda *a, **k: None

    def _find_ci(field, value, select="*"):
        needle = (value or "").lower()
        return next((r for r in users if str(r.get(field, "")).lower() == needle), None)

    shared._find_user_by_ci = _find_ci
    monkeypatch.setitem(sys.modules, "routers.auth_shared", shared)

    tokens = types.ModuleType("utils.auth_tokens")
    tokens._set_auth_cookies = lambda *a, **k: None
    tokens.make_forum_token = lambda *a, **k: "tok"
    tokens.make_refresh_token = lambda *a, **k: "ref"
    monkeypatch.setitem(sys.modules, "utils.auth_tokens", tokens)

    state = types.ModuleType("utils.oauth_state")
    state._safe_relative_path = lambda p, **k: p
    monkeypatch.setitem(sys.modules, "utils.oauth_state", state)

    store = types.ModuleType("utils.oauth_store")
    store.get_access_token = lambda *a, **k: None
    store.pop_auth_code = lambda *a, **k: None
    store.put_access_token = lambda *a, **k: None
    store.put_auth_code = lambda *a, **k: None
    store.revoke_access_token = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "utils.oauth_store", store)

    admin = types.ModuleType("routers.oauth_admin")
    admin.get_oauth_config = lambda: {"enabled": True, "clients": {
        "web": {"secret": "s3cr3t", "redirect_uris": [], "public": False}}}
    monkeypatch.setitem(sys.modules, "routers.oauth_admin", admin)

    mod = _load(monkeypatch, "ldap_oauth.py")
    mod.bind_user = lambda uname, pw: types.SimpleNamespace(
        uid="banned1", email="banned@x.test", groups=[])
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app, raise_server_exceptions=False)


def test_password_grant_denies_banned_user(monkeypatch):
    users = [{"id": "u9", "username": "banned1", "email": "banned@x.test",
              "banned": True, "role": "user"}]
    client = _ldap_client(monkeypatch, users)
    r = client.post("/oauth/token", json={
        "grant_type": "password", "username": "banned1", "password": "x",
        "client_id": "web", "client_secret": "s3cr3t"})
    assert r.status_code == 403, r.text
    assert "suspended" in r.text.lower()
