"""Tests for routers/infra_diagrams.py (hybrid-infra builder persistence).

Public reads of published docs, admin-only writes, reserved slug guard,
payload caps, draft visibility rules.
"""
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


class _Query:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._op = None
        self._payload = None

    def select(self, *args):
        self._op = "select"
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

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def order(self, key, desc=False):
        return self

    def limit(self, n):
        return self

    def _match(self, row):
        return all(row.get(k) == v for k, v in self._filters)

    def execute(self):  # type: ignore[no-untyped-def]
        rows = self._store.setdefault(self._table, [])
        if self._op == "select":
            return types.SimpleNamespace(data=[dict(r) for r in rows if self._match(r)])
        if self._op == "insert":
            row = dict(self._payload)
            row.setdefault("id", f"id-{len(rows)}")
            rows.append(row)
            return types.SimpleNamespace(data=[dict(row)])
        if self._op == "update":
            out = []
            for r in rows:
                if self._match(r):
                    r.update(self._payload)
                    out.append(dict(r))
            return types.SimpleNamespace(data=out)
        if self._op == "delete":
            out = [dict(r) for r in rows if self._match(r)]
            self._store[self._table] = [r for r in rows if not self._match(r)]
            return types.SimpleNamespace(data=out)
        raise AssertionError("unknown op")


class _FakeSupabase:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _Query(self.store, name)


def _fake_require_admin(user=None):
    return {"id": "admin-1", "username": "admin", "role": "admin"}


def _load_module():  # type: ignore[no-untyped-def]
    spec = importlib.util.spec_from_file_location(
        "infra_diagrams_under_test",
        os.path.join(BACKEND_DIR, "routers", "infra_diagrams.py"),
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def client(monkeypatch):  # type: ignore[no-untyped-def]
    fake = _FakeSupabase()
    db_stub = types.ModuleType("database")
    db_stub.supabase = fake
    deps_stub = types.ModuleType("dependencies")
    deps_stub.require_admin = _fake_require_admin
    deps_stub.decode_token = lambda token: {"role": "admin"}
    monkeypatch.setitem(sys.modules, "database", db_stub)
    monkeypatch.setitem(sys.modules, "dependencies", deps_stub)
    module = _load_module()
    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app)


def _doc(slug="hq-east"):
    return {
        "slug": slug,
        "title": "HQ East",
        "published": False,
        "nodes": [
            {
                "id": "fw1", "name": "FW-01", "category": "security",
                "layer": "edge", "role": "Edge", "desc": "d",
                "workloads": [], "deps": [],
                "x": 10, "y": 10, "w": 100, "h": 50, "shape": "chip",
            }
        ],
        "flows": [],
    }


def test_create_and_draft_hidden_from_public(client):
    r = client.post("/diagrams", json=_doc())
    assert r.status_code == 200, r.text
    assert r.json()["diagram"]["slug"] == "hq-east"
    assert client.get("/diagrams/hq-east").status_code == 404
    assert client.get("/diagrams").json() == {"diagrams": []}


def test_publish_makes_public(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    body = _doc()
    body["published"] = True
    r = client.put(f"/diagrams/{doc_id}", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["diagram"]["published"] is True
    listed = client.get("/diagrams").json()["diagrams"]
    assert len(listed) == 1 and listed[0]["slug"] == "hq-east"
    assert listed[0]["nodeCount"] == 1
    assert client.get("/diagrams/hq-east").status_code == 200


def test_reserved_slug_rejected(client):
    body = _doc(slug="plan-a")
    assert client.post("/diagrams", json=body).status_code == 400


def test_slug_conflict(client):
    assert client.post("/diagrams", json=_doc()).status_code == 200
    assert client.post("/diagrams", json=_doc()).status_code == 409


def test_oversized_payload_rejected(client):
    body = _doc()
    body["nodes"] = [
        {"id": f"n{i}", "name": "x", "category": "network", "layer": "cloud"}
        for i in range(201)
    ]
    # Pydantic list cap → 422; endpoint guard → 400. Either fail-closed is fine.
    assert client.post("/diagrams", json=body).status_code in (400, 422)


def test_bad_flow_reference_rejected(client):
    body = _doc()
    body["flows"] = [{"id": "f1", "from": "fw1", "to": "ghost", "cat": "network"}]
    assert client.post("/diagrams", json=body).status_code == 400


def test_delete_roundtrip(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    assert client.delete(f"/diagrams/{doc_id}").status_code == 200
    assert client.delete(f"/diagrams/{doc_id}").status_code == 404


def test_update_missing_is_404(client):
    assert client.put("/diagrams/nope", json=_doc()).status_code == 404
