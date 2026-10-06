"""POST /oauth/authorize bans: a banned LDAP user fails closed (403) like the
GET cookie path, instead of minting a code + tokens."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
os.environ.setdefault("ADMIN_GATE_SECRET", "test-admin-gate-secret")
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-only")

# Package stub so `from routers.X import ...` skips routers/__init__
# (which imports every router).
_pkg = types.ModuleType("routers")
_pkg.__path__ = [os.path.join(BACKEND_DIR, "routers")]
sys.modules.setdefault("routers", _pkg)


class _UsersTable:
    def __init__(self, store):
        self._store = store
        self._eq: list = []
        self._ilike: list = []
        self._limit = None
        self._update = None

    def select(self, *a):
        return self

    def eq(self, col, val):
        self._eq.append((col, val))
        return self

    def ilike(self, col, pattern):
        self._ilike.append((col, pattern))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, patch):
        self._update = patch
        return self

    def execute(self):
        rows = list(self._store.values())
        for c, v in self._eq:
            rows = [r for r in rows if r.get(c) == v]
        for c, pat in self._ilike:
            needle = str(pat).strip("%").lower()
            rows = [r for r in rows if needle in str(r.get(c) or "").lower()]
        if self._update is not None:
            for r in rows:
                r.update(self._update)
        if self._limit is not None:
            rows = rows[:self._limit]
        return types.SimpleNamespace(data=rows)


class _EmptyTable:
    def select(self, *a):
        return self

    def insert(self, payload):
        return self

    def execute(self):
        return types.SimpleNamespace(data=[])


def _db_stub(store):
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(
        table=lambda name: _UsersTable(store) if name == "users" else _EmptyTable())
    db._escape_ilike = lambda s: s
    db.safe_search_term = lambda s: (s or "").strip()[:64]
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _deps_stub():
    deps = types.ModuleType("dependencies")
    admin = {"id": "admin-1", "username": "root", "role": "admin"}
    deps.require_admin = lambda: admin
    deps.require_staff = lambda: admin
    deps.get_current_user = lambda: admin

    class _DummyBearer:
        def __init__(self, *a, **k):
            pass

    deps.CookieHTTPBearer = _DummyBearer
    return deps


def _audit_stub():
    m = types.ModuleType("utils.audit")
    m.record = lambda *a, **k: None
    m.record_auth = lambda *a, **k: None
    return m


def _load(monkeypatch, store):
    monkeypatch.setitem(sys.modules, "database", _db_stub(store))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    monkeypatch.setitem(sys.modules, "utils.audit", _audit_stub())
    # Evict transitive modules that bind `supabase` at import: without this
    # they keep the FIRST test's stub and later tests read stale stores.
    for m in ("routers.auth_shared", "utils.ldap_client", "utils.oauth_store"):
        monkeypatch.delitem(sys.modules, m, raising=False)
    monkeypatch.setenv("OAUTH_CLIENTS", json.dumps({"web": {
        "name": "Web", "redirect_uris": ["https://aifazi.net/cb"],
        "secret": "s3cr3t", "public": False}}))
    spec = importlib.util.spec_from_file_location(
        "ldap_oauth_under_test", os.path.join(BACKEND_DIR, "routers", "ldap_oauth.py"))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Directory bind succeeds; forum identity comes from the fake DB below.
    module.bind_user = lambda u, p: types.SimpleNamespace(uid="x", email="x@x.io")
    app = FastAPI()
    app.include_router(module.router)
    return module, TestClient(app, raise_server_exceptions=False)


def _post(client):
    return client.post("/oauth/authorize", data={
        "username": "x", "password": "y", "client_id": "web",
        "redirect_uri": "https://aifazi.net/cb",
    }, follow_redirects=False)


def test_banned_user_denied_no_code_no_tokens(monkeypatch):
    store = {"u1": {"id": "u1", "username": "x", "email": "x@x.io",
                     "role": "user", "banned": True, "ban_reason": "spam"}}
    _, client = _load(monkeypatch, store)
    r = _post(client)
    assert r.status_code == 403, r.text
    assert "suspended" in r.text.lower()


def test_active_user_proceeds_to_code(monkeypatch):
    store = {"u1": {"id": "u1", "username": "x", "email": "x@x.io",
                     "role": "user", "banned": False}}
    _, client = _load(monkeypatch, store)
    r = _post(client)
    assert r.status_code in (302, 307), r.text
    assert "code=" in r.headers["location"]
