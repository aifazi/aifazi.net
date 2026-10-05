"""Staff access control: catalog, role/permission edits, self + last-admin guards.

Covers the Access-tab backend: GET /staff/catalog, PUT/DELETE /staff/{id}
guards (self-demotion, last-admin), promote/member flows, and the stats
role endpoint guards. Supabase is faked with a filter-aware users store.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-only")

# Package stub: `from routers.X import ...` must NOT execute routers/__init__
# (it imports every router). Real submodules still load by file path.
_pkg = types.ModuleType("routers")
_pkg.__path__ = [os.path.join(BACKEND_DIR, "routers")]
sys.modules.setdefault("routers", _pkg)


class _UsersTable:
    """Filter-aware fake over a {id: row} store (select/eq/in_/ilike/or_/
    limit/insert/update). Anything else returns empty."""

    def __init__(self, store):
        self._store = store
        self._eq: list = []
        self._in: list = []
        self._ilike: list = []
        self._or = None
        self._limit = None
        self._insert = None
        self._update = None

    def select(self, *a):
        return self

    def eq(self, col, val):
        self._eq.append((col, val))
        return self

    def in_(self, col, vals):
        self._in.append((col, list(vals)))
        return self

    def ilike(self, col, pattern):
        self._ilike.append((col, pattern))
        return self

    def or_(self, expr):
        self._or = expr
        return self

    def limit(self, n):
        self._limit = n
        return self

    def order(self, *a):
        return self

    def insert(self, row):
        self._insert = row
        return self

    def update(self, patch):
        self._update = patch
        return self

    def _match(self, row):
        for c, v in self._eq:
            if row.get(c) != v:
                return False
        for c, vals in self._in:
            if row.get(c) not in vals:
                return False
        for c, pat in self._ilike:
            needle = str(pat).strip("%").lower()
            if needle not in str(row.get(c) or "").lower():
                return False
        if self._or:
            hit = False
            for seg in str(self._or).split(","):
                parts = seg.split(".ilike.")
                if len(parts) == 2 and parts[1].strip("%").lower() in str(row.get(parts[0]) or "").lower():
                    hit = True
                    break
            if not hit:
                return False
        return True

    def execute(self):
        if self._insert is not None:
            row = dict(self._insert)
            row.setdefault("id", f"new-{len(self._store) + 1}")
            self._store[row["id"]] = row
            return types.SimpleNamespace(data=[row])
        rows = [r for r in self._store.values() if self._match(r)]
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


def _deps_stub(actor):
    deps = types.ModuleType("dependencies")
    deps.require_admin = lambda: actor
    deps.require_staff = lambda: actor
    deps.get_current_user = lambda: actor

    class _DummyBearer:
        def __init__(self, *a, **k):
            pass

    deps.CookieHTTPBearer = _DummyBearer
    return deps


def _audit_stub(writes):
    m = types.ModuleType("utils.audit")
    m.record = lambda *a, **k: writes.append((a, k))
    m.record_auth = lambda *a, **k: None
    return m


def _load(monkeypatch, name, store, actor, writes):
    monkeypatch.setitem(sys.modules, "database", _db_stub(store))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub(actor))
    monkeypatch.setitem(sys.modules, "utils.audit", _audit_stub(writes))
    spec = importlib.util.spec_from_file_location(
        f"{name}_under_test", os.path.join(BACKEND_DIR, "routers", f"{name}.py"))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _client(module, prefix):
    app = FastAPI()
    app.include_router(module.router, prefix=prefix)
    return TestClient(app, raise_server_exceptions=False)


ADMIN = {"id": "admin-1", "username": "root", "role": "admin"}


def _seed():
    return {
        "admin-1": {"id": "admin-1", "username": "root", "email": "r@x.io",
                    "role": "admin", "staff_permissions": {},
                    "created_at": "2026-01-01", "last_seen": "2026-10-01"},
        "mod-1": {"id": "mod-1", "username": "mod", "email": "m@x.io",
                   "role": "moderator", "staff_permissions": {"store.orders": ["view"]},
                   "created_at": "2026-01-02", "last_seen": "2026-10-01"},
        "mem-1": {"id": "mem-1", "username": "member", "email": "u@x.io",
                   "role": "member", "staff_permissions": {},
                   "created_at": "2026-01-03", "last_seen": "2026-10-01"},
    }


def test_catalog_shape(monkeypatch):
    writes: list = []
    mod = _load(monkeypatch, "auth_staff", _seed(), dict(ADMIN), writes)
    client = _client(mod, "/api/auth")
    r = client.get("/api/auth/staff/catalog")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["actions"] and "manage" in body["actions"] and "view" in body["actions"]
    assert body["modules"]["store.coupons"] == "Store coupons"
    assert set(body["manageable_roles"]) == {"moderator", "editor"}
    assert set(body["staff_roles"]) >= {"admin", "moderator", "editor"}
    assert body["role_presets"]["moderator"]["community.forum"]


def test_list_staff_public_shape_no_secrets(monkeypatch):
    writes: list = []
    store = _seed()
    store["mod-1"]["password_hash"] = "hash!"
    store["mod-1"]["refresh_token"] = "tok!"
    mod = _load(monkeypatch, "auth_staff", store, dict(ADMIN), writes)
    client = _client(mod, "/api/auth")
    r = client.get("/api/auth/staff")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert {x["username"] for x in rows} == {"root", "mod"}
    for row in rows:
        assert "password_hash" not in row and "refresh_token" not in row
        assert "totp_secret" not in row
        assert isinstance(row.get("module_permissions"), dict)


def test_promote_member_to_moderator_with_perms(monkeypatch):
    writes: list = []
    store = _seed()
    mod = _load(monkeypatch, "auth_staff", store, dict(ADMIN), writes)
    client = _client(mod, "/api/auth")
    r = client.put("/api/auth/staff/mem-1",
                   json={"role": "moderator",
                         "module_permissions": {"store.orders": ["view", "edit"]}})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "moderator"
    assert store["mem-1"]["staff_permissions"] == {"store.orders": ["edit", "view"]}
    assert any(w[0][1] == "staff_update" for w in writes)


def test_put_self_role_change_blocked(monkeypatch):
    writes: list = []
    store = _seed()
    me = {"id": "mod-1", "username": "mod", "role": "moderator"}
    mod = _load(monkeypatch, "auth_staff", store, me, writes)
    client = _client(mod, "/api/auth")
    r = client.put("/api/auth/staff/mod-1", json={"role": "editor"})
    assert r.status_code == 400, r.text
    assert store["mod-1"]["role"] == "moderator"


def test_put_last_admin_demote_blocked(monkeypatch):
    writes: list = []
    store = _seed()
    me = {"id": "mod-1", "username": "mod", "role": "moderator"}
    mod = _load(monkeypatch, "auth_staff", store, me, writes)
    client = _client(mod, "/api/auth")
    r = client.put("/api/auth/staff/admin-1", json={"role": "moderator"})
    assert r.status_code == 409, r.text
    assert store["admin-1"]["role"] == "admin"


def test_put_nonlast_admin_demote_ok(monkeypatch):
    writes: list = []
    store = _seed()
    store["admin-2"] = {"id": "admin-2", "username": "boss", "email": "b@x.io",
                        "role": "admin", "staff_permissions": {}}
    mod = _load(monkeypatch, "auth_staff", store, dict(ADMIN), writes)
    client = _client(mod, "/api/auth")
    r = client.put("/api/auth/staff/admin-2", json={"role": "editor"})
    assert r.status_code == 200, r.text
    assert store["admin-2"]["role"] == "editor"


def test_delete_self_blocked(monkeypatch):
    writes: list = []
    store = _seed()
    me = {"id": "mod-1", "username": "mod", "role": "moderator"}
    mod = _load(monkeypatch, "auth_staff", store, me, writes)
    client = _client(mod, "/api/auth")
    r = client.delete("/api/auth/staff/mod-1")
    assert r.status_code == 400, r.text
    assert store["mod-1"]["role"] == "moderator"


def test_delete_last_admin_blocked(monkeypatch):
    writes: list = []
    store = _seed()
    me = {"id": "mod-1", "username": "mod", "role": "moderator"}
    mod = _load(monkeypatch, "auth_staff", store, me, writes)
    client = _client(mod, "/api/auth")
    r = client.delete("/api/auth/staff/admin-1")
    assert r.status_code == 409, r.text
    assert store["admin-1"]["role"] == "admin"


def test_delete_demotes_and_clears_perms(monkeypatch):
    writes: list = []
    store = _seed()
    mod = _load(monkeypatch, "auth_staff", store, dict(ADMIN), writes)
    client = _client(mod, "/api/auth")
    r = client.delete("/api/auth/staff/mod-1")
    assert r.status_code == 200, r.text
    assert store["mod-1"]["role"] == "member"
    assert store["mod-1"]["staff_permissions"] == {}


def test_stats_role_last_admin_blocked_and_audited(monkeypatch):
    writes: list = []
    store = _seed()
    other = {"id": "admin-2", "username": "boss", "role": "admin"}
    mod = _load(monkeypatch, "stats", store, other, writes)
    client = _client(mod, "/api/admin/stats")
    r = client.post("/api/admin/stats/actions/users/admin-1/role", json={"role": "member"})
    assert r.status_code == 409, r.text
    assert store["admin-1"]["role"] == "admin"
    assert not [w for w in writes if w[0][1] == "role_change"]


def test_stats_role_missing_user_404(monkeypatch):
    writes: list = []
    mod = _load(monkeypatch, "stats", _seed(), dict(ADMIN), writes)
    client = _client(mod, "/api/admin/stats")
    r = client.post("/api/admin/stats/actions/users/nope/role", json={"role": "editor"})
    assert r.status_code == 404, r.text
