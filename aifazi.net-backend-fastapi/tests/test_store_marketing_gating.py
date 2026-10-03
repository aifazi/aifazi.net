"""Round-5 audit A5-4 (regression guard for S1): view-only staff must NOT write
store coupons/deals — POST/PATCH/DELETE require the manage grant; reads stay on
view. A view-only grant on `store.coupons`/`store.deals` is the exact shape of
the pre-fix bug, so these tests fail if any write route regresses to view.
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


def _ns(data: list):
    return types.SimpleNamespace(data=data)


class _FakeQuery:
    def __init__(self, table: str, rows: list, writes: list):
        self._table = table
        self._rows = rows
        self._writes = writes
        self._op = "select"
        self._payload: dict | None = None

    def select(self, *args, **kwargs):
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def ilike(self, *args, **kwargs):
        return self

    def execute(self):
        if self._op == "select":
            return _ns(self._rows)
        self._writes.append((self._table, self._op))
        if self._op == "insert":
            return _ns([dict(self._payload or {}, id="new-id")])
        return _ns([{"id": "c1", **(self._payload or {})}])


class _FakeSupabase:
    def __init__(self, user_row: dict, writes: list):
        self._user_row = user_row
        self._writes = writes

    def table(self, name: str):
        if name == "users":
            return _FakeQuery(name, [self._user_row], self._writes)
        return _FakeQuery(name, [], self._writes)


def _build_client(monkeypatch, staff_permissions: dict, user_role: str = "editor"):
    # permissions._supabase() does `from database import supabase` lazily at
    # request time, so the stubs must stay installed for the whole test —
    # monkeypatch restores the real modules at teardown.
    user_row = {
        "id": "u1",
        "username": "staff1",
        "email": "s@example.com",
        "role": user_role,
        "banned": False,
        "staff_permissions": staff_permissions,
    }
    writes: list = []
    fake = _FakeSupabase(user_row, writes)

    db_stub = types.ModuleType("database")
    db_stub.supabase = fake
    db_stub._escape_ilike = lambda v: v

    deps_stub = types.ModuleType("dependencies")

    def get_current_user():
        return {"id": "u1", "username": "staff1", "role": user_role}

    deps_stub.get_current_user = get_current_user

    monkeypatch.setitem(sys.modules, "database", db_stub)
    monkeypatch.setitem(sys.modules, "dependencies", deps_stub)

    spec = importlib.util.spec_from_file_location(
        "store_marketing_admin_under_test",
        os.path.join(BACKEND_DIR, "routers", "store_marketing_admin.py"),
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app), writes


VIEW_ONLY = {"store.coupons": ["view"], "store.deals": ["view"]}
MANAGE = {"store.coupons": "manage", "store.deals": "manage"}

COUPON_BODY = {"code": "SAVE10", "type": "fixed", "value_cents": 1000}
DEAL_BODY = {"product_id": "p1", "name": "Flash", "discount_percent": 10}


def test_view_only_reads_allowed(monkeypatch):
    client, writes = _build_client(monkeypatch, VIEW_ONLY)
    assert client.get("/coupons").status_code == 200
    assert client.get("/deals").status_code == 200
    assert writes == []


@pytest.mark.parametrize("method,path", [
    ("post", "/coupons"),
    ("patch", "/coupons/c1"),
    ("delete", "/coupons/c1"),
    ("post", "/deals"),
    ("patch", "/deals/d1"),
    ("delete", "/deals/d1"),
])
def test_view_only_writes_rejected(monkeypatch, method, path):
    client, writes = _build_client(monkeypatch, VIEW_ONLY)
    body = COUPON_BODY if "coupon" in path else DEAL_BODY
    resp = getattr(client, method)(path, **({} if method == "delete" else {"json": body}))
    assert resp.status_code == 403, f"{method.upper()} {path} must be manage-gated: {resp.status_code}"
    assert writes == [], f"view-only write reached the database: {method.upper()} {path}"


def test_manage_can_write_coupons_and_deals(monkeypatch):
    client, writes = _build_client(monkeypatch, MANAGE)
    assert client.post("/coupons", json=COUPON_BODY).status_code == 200
    assert client.patch("/coupons/c1", json={"active": False}).status_code == 200
    assert client.delete("/coupons/c1").status_code == 200
    assert client.post("/deals", json=DEAL_BODY).status_code == 200
    assert client.delete("/deals/d1").status_code == 200
    assert len(writes) == 5
