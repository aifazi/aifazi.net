"""Authentik identity enable/disable (admin_actions.py) — the former 501 stub
is now a real flow: local `users.banned` enforcement first, then best-effort
Authentik admin API sync (PATCH {issuer}/api/v3/core/users/{uuid}/) when
AUTHENTIK_API_TOKEN is set and the user row carries an authentik_id.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

USER_ROW = {"id": "u1", "username": "alice", "banned": False, "authentik_id": None}


class _Query:
    def __init__(self, table: str, rows: list, writes: list):
        self._table = table
        self._rows = rows
        self._writes = writes
        self._op = "select"
        self._payload: dict | None = None

    def select(self, *a, **k):
        return self

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        if self._op in ("update", "insert", "delete"):
            self._writes.append((self._table, self._op, self._payload))
            return types.SimpleNamespace(data=[dict(self._payload or {}, id="w1")])
        return types.SimpleNamespace(data=self._rows)


def _db_stub(user_row: dict | None, writes: list):
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(
        table=lambda name: _Query(name, [user_row] if user_row else [], writes)
    )
    db._escape_ilike = lambda v: v
    db.safe_search_term = lambda v: v
    db.safe_or_in = lambda v: v
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _deps_stub():
    deps = types.ModuleType("dependencies")
    deps.require_admin = lambda: {"id": "admin-1", "username": "root", "role": "admin"}
    deps.require_staff = lambda: {"id": "admin-1", "username": "root", "role": "admin"}
    deps.get_current_user = deps.require_admin
    deps._enrich_user = lambda user: user
    deps.decode_token = lambda token: None

    class _HTTPBearer:
        def __init__(self, auto_error=True):
            pass

        async def __call__(self):
            return None

    deps.CookieHTTPBearer = _HTTPBearer
    deps.bearer = _HTTPBearer()
    return deps


def _load_admin_actions(monkeypatch, user_row, writes):
    monkeypatch.setitem(sys.modules, "database", _db_stub(user_row, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    spec = importlib.util.spec_from_file_location(
        "admin_actions_under_test", os.path.join(BACKEND_DIR, "routers", "admin_actions.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router)
    return module, TestClient(app, raise_server_exceptions=False)


def _users_writes(writes: list) -> list:
    return [w for w in writes if w[0] == "users"]


# ── confirm guard + unknown user ──────────────────────────────────────────────

def test_disable_requires_confirm(monkeypatch):
    _, client = _load_admin_actions(monkeypatch, USER_ROW, [])
    r = client.post("/identity/users/u1/disable", json={})
    assert r.status_code == 400, r.text


def test_unknown_user_is_404(monkeypatch):
    _, client = _load_admin_actions(monkeypatch, None, [])
    r = client.post("/identity/users/ghost/disable", json={"confirm": True})
    assert r.status_code == 404, r.text


# ── local enforcement without Authentik linkage ───────────────────────────────

def test_disable_local_user_writes_banned(monkeypatch):
    writes: list = []
    _, client = _load_admin_actions(monkeypatch, {**USER_ROW, "authentik_id": None}, writes)
    r = client.post("/identity/users/u1/disable", json={"confirm": True})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert "warning" not in r.json()
    assert _users_writes(writes) == [("users", "update", {"banned": True})]


def test_enable_local_user_clears_banned(monkeypatch):
    writes: list = []
    row = {**USER_ROW, "banned": True}
    _, client = _load_admin_actions(monkeypatch, row, writes)
    r = client.post("/identity/users/u1/enable", json={"confirm": True})
    assert r.status_code == 200, r.text
    assert _users_writes(writes) == [("users", "update", {"banned": False})]


# ── Authentik linked, token NOT configured → 200 + warning ───────────────────

def test_linked_user_without_token_returns_warning(monkeypatch):
    monkeypatch.delenv("AUTHENTIK_API_TOKEN", raising=False)
    writes: list = []
    row = {**USER_ROW, "authentik_id": "3f2a9c1e-0000-0000-0000-000000000001"}
    _, client = _load_admin_actions(monkeypatch, row, writes)
    r = client.post("/identity/users/u1/disable", json={"confirm": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["warning"] == "Authentik not synced (AUTHENTIK_API_TOKEN not set)"
    assert _users_writes(writes) == [("users", "update", {"banned": True})]


# ── Authentik linked, token set → admin API PATCH ─────────────────────────────

def _install_fake_httpx(monkeypatch, module, status_code: int = 200) -> list:
    """Replace module._httpx with a fake AsyncClient; returns the request log."""
    requests: list = []

    class _Resp:
        def __init__(self, sc: int, text: str):
            self.status_code = sc
            self.text = text

    class _FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def patch(self, url, json=None, headers=None):
            requests.append({"url": url, "json": json, "headers": headers})
            return _Resp(status_code, "ok" if status_code < 400 else "boom")

    monkeypatch.setattr(module, "_httpx", types.SimpleNamespace(AsyncClient=_FakeAsyncClient))
    return requests


def test_linked_user_with_token_patches_authentik(monkeypatch):
    monkeypatch.setenv("AUTHENTIK_API_TOKEN", "ak-admin-token")
    writes: list = []
    row = {**USER_ROW, "authentik_id": "3f2a9c1e-0000-0000-0000-000000000001"}
    module, client = _load_admin_actions(monkeypatch, row, writes)
    requests = _install_fake_httpx(monkeypatch, module)

    r = client.post("/identity/users/u1/disable", json={"confirm": True})
    assert r.status_code == 200, r.text
    assert "warning" not in r.json()
    assert _users_writes(writes) == [("users", "update", {"banned": True})]

    assert len(requests) == 1
    req = requests[0]
    assert req["url"] == "https://auth.aifazi.net/api/v3/core/users/3f2a9c1e-0000-0000-0000-000000000001/"
    assert req["json"] == {"disabled": True}
    assert req["headers"]["Authorization"] == "Bearer ak-admin-token"


def test_linked_user_enable_sends_disabled_false(monkeypatch):
    monkeypatch.setenv("AUTHENTIK_API_TOKEN", "ak-admin-token")
    writes: list = []
    row = {**USER_ROW, "banned": True, "authentik_id": "3f2a9c1e-0000-0000-0000-000000000002"}
    module, client = _load_admin_actions(monkeypatch, row, writes)
    requests = _install_fake_httpx(monkeypatch, module)

    r = client.post("/identity/users/u1/enable", json={"confirm": True})
    assert r.status_code == 200, r.text
    assert len(requests) == 1
    assert requests[0]["json"] == {"disabled": False}


def test_authentik_sync_failure_is_502_but_local_stands(monkeypatch):
    monkeypatch.setenv("AUTHENTIK_API_TOKEN", "ak-admin-token")
    writes: list = []
    row = {**USER_ROW, "authentik_id": "3f2a9c1e-0000-0000-0000-000000000003"}
    module, client = _load_admin_actions(monkeypatch, row, writes)
    _install_fake_httpx(monkeypatch, module, status_code=500)

    r = client.post("/identity/users/u1/disable", json={"confirm": True})
    assert r.status_code == 502, r.text
    assert "Local change applied; Authentik sync failed" in r.json()["detail"]
    assert _users_writes(writes) == [("users", "update", {"banned": True})]


def test_linked_user_with_token_honors_issuer_override(monkeypatch):
    monkeypatch.setenv("AUTHENTIK_ISSUER", "https://auth.example.com/")
    monkeypatch.setenv("AUTHENTIK_API_TOKEN", "ak-admin-token")
    writes: list = []
    row = {**USER_ROW, "authentik_id": "3f2a9c1e-0000-0000-0000-000000000004"}
    module, client = _load_admin_actions(monkeypatch, row, writes)
    requests = _install_fake_httpx(monkeypatch, module)

    r = client.post("/identity/users/u1/disable", json={"confirm": True})
    assert r.status_code == 200, r.text
    assert len(requests) == 1
    assert requests[0]["url"] == "https://auth.example.com/api/v3/core/users/3f2a9c1e-0000-0000-0000-000000000004/"
