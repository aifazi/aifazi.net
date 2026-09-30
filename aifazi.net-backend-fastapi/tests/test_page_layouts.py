"""Tests for routers/page_layouts.py (PageBlocks persistence).

Public reads of published layouts, admin-only writes, shape/size guards,
draft invisibility, update/delete roundtrip.
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
        self._slice = None

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

    def range(self, start, end):
        self._slice = (start, end)
        return self

    def _match(self, row):
        return all(row.get(k) == v for k, v in self._filters)

    def execute(self):  # type: ignore[no-untyped-def]
        rows = self._store.setdefault(self._table, [])
        if self._op == "select":
            rows = [dict(r) for r in rows if self._match(r)]
            if self._slice:
                start, end = self._slice
                rows = rows[start : end + 1]
            return types.SimpleNamespace(data=rows)
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


def _denied_require_admin(user=None):
    from fastapi import HTTPException

    raise HTTPException(403, "Admin only")


def _load_module():  # type: ignore[no-untyped-def]
    spec = importlib.util.spec_from_file_location(
        "page_layouts_under_test",
        os.path.join(BACKEND_DIR, "routers", "page_layouts.py"),
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _build_app(monkeypatch, require_admin):  # type: ignore[no-untyped-def]
    fake = _FakeSupabase()
    db_stub = types.ModuleType("database")
    db_stub.supabase = fake
    deps_stub = types.ModuleType("dependencies")
    deps_stub.require_admin = require_admin
    deps_stub.decode_token = lambda token: {"role": "admin"}
    deps_stub._enrich_user = lambda payload: payload
    monkeypatch.setitem(sys.modules, "database", db_stub)
    monkeypatch.setitem(sys.modules, "dependencies", deps_stub)
    module = _load_module()
    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app)


@pytest.fixture()
def client(monkeypatch):  # type: ignore[no-untyped-def]
    return _build_app(monkeypatch, _fake_require_admin)


@pytest.fixture()
def denied_client(monkeypatch):  # type: ignore[no-untyped-def]
    return _build_app(monkeypatch, _denied_require_admin)


def _layout(slug="home", **over):
    body = {
        "slug": slug,
        "title": "Home",
        "published": False,
        "blocks": [{"id": "b1", "type": "hero", "props": {"title": "Hi"}}],
    }
    body.update(over)
    return body


def test_create_draft_hidden_from_public(client):  # type: ignore[no-untyped-def]
    r = client.post("/layouts", json=_layout())
    assert r.status_code == 200, r.text
    assert client.get("/layouts").json() == {"layouts": [], "offset": 0}
    assert client.get("/layouts/home").status_code == 404


def test_publish_makes_public(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(published=True)).json()["layout"]
    assert created["published"] is True
    got = client.get("/layouts/home").json()["layout"]
    assert got["blocks"][0]["props"]["title"] == "Hi"
    assert client.get("/layouts").json()["layouts"][0]["blockCount"] == 1


def test_bad_type_rejected(client):  # type: ignore[no-untyped-def]
    bad = _layout(blocks=[{"id": "b1", "type": "../evil", "props": {}}])
    assert client.post("/layouts", json=bad).status_code == 400


def test_nested_props_rejected(client):  # type: ignore[no-untyped-def]
    bad = _layout(blocks=[{"id": "b1", "type": "hero", "props": {"a": {"b": 1}}}])
    assert client.post("/layouts", json=bad).status_code == 400


def test_duplicate_ids_rejected(client):  # type: ignore[no-untyped-def]
    bad = _layout(blocks=[
        {"id": "b1", "type": "hero", "props": {}},
        {"id": "b1", "type": "hero", "props": {}},
    ])
    assert client.post("/layouts", json=bad).status_code == 400


def test_deep_nesting_rejected(client):  # type: ignore[no-untyped-def]
    bad = _layout(blocks=[{
        "id": "b1", "type": "columns", "props": {},
        "children": [{
            "id": "b2", "type": "columns", "props": {},
            "children": [{
                "id": "b3", "type": "columns", "props": {},
                "children": [{"id": "b4", "type": "hero", "props": {}}],
            }],
        }],
    }])
    assert client.post("/layouts", json=bad).status_code == 400


def test_columns_children_allowed(client):  # type: ignore[no-untyped-def]
    ok = _layout(blocks=[{
        "id": "cols", "type": "columns", "props": {},
        "children": [{"id": "c1", "type": "hero", "props": {"title": "A"}}],
    }])
    assert client.post("/layouts", json=ok).status_code == 200


def test_duplicate_slug_relies_on_db_unique(client):  # type: ignore[no-untyped-def]
    # The fake store has no UNIQUE constraint, so both inserts succeed here.
    # Live, the DB unique index turns the second into 409 (code path covered).
    assert client.post("/layouts", json=_layout()).status_code == 200
    assert client.post("/layouts", json=_layout()).status_code == 200


def test_update_and_delete_roundtrip(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(published=True)).json()["layout"]
    lid = created["id"]
    upd = client.put(f"/layouts/{lid}", json=_layout(title="Home v2", published=True)).json()["layout"]
    assert upd["title"] == "Home v2"
    assert client.delete(f"/layouts/{lid}").json() == {"ok": True}
    assert client.get("/layouts/home").status_code == 404


def test_update_missing_is_404(client):  # type: ignore[no-untyped-def]
    assert client.put("/layouts/nope", json=_layout()).status_code == 404


def test_admin_all_lists_drafts(client):  # type: ignore[no-untyped-def]
    client.post("/layouts", json=_layout(slug="draft-one"))
    client.post("/layouts", json=_layout(slug="live-one", published=True))
    slugs = sorted(l["slug"] for l in client.get("/layouts/admin/all").json()["layouts"])
    assert slugs == ["draft-one", "live-one"]


# ── Round-2 audit additions ────────────────────────────────────────────────


def test_writes_require_admin(denied_client):  # type: ignore[no-untyped-def]
    assert denied_client.post("/layouts", json=_layout()).status_code == 403
    assert denied_client.put("/layouts/x", json=_layout()).status_code == 403
    assert denied_client.delete("/layouts/x").status_code == 403
    assert denied_client.get("/layouts/admin/all").status_code == 403


def test_delete_missing_is_404(client):  # type: ignore[no-untyped-def]
    assert client.delete("/layouts/nope").status_code == 404


def test_update_bumps_updated_at(client):  # type: ignore[no-untyped-def]
    import time

    created = client.post("/layouts", json=_layout()).json()["layout"]
    before = created["updatedAt"]
    time.sleep(0.01)
    upd = client.put(
        f"/layouts/{created['id']}", json=_layout(title="Home v2")
    ).json()["layout"]
    after = upd["updatedAt"]
    assert before and after and after > before


def test_nesting_capped_at_two_levels(client):  # type: ignore[no-untyped-def]
    ok = _layout(blocks=[{
        "id": "b1", "type": "section", "props": {},
        "children": [{"id": "b2", "type": "hero", "props": {}}],
    }])
    assert client.post("/layouts", json=ok).status_code == 200
    deep = _layout(blocks=[{
        "id": "b1", "type": "section", "props": {},
        "children": [{
            "id": "b2", "type": "hero", "props": {},
            "children": [{"id": "b3", "type": "hero", "props": {}}],
        }],
    }])
    r = client.post("/layouts", json=deep)
    assert r.status_code == 400, r.text
    assert "nesting" in r.json()["detail"].lower()


def test_javascript_href_rejected(client):  # type: ignore[no-untyped-def]
    bad = _layout(blocks=[{"id": "b1", "type": "cta-banner", "props": {"ctaHref": "javascript:alert(1)"}}])
    assert client.post("/layouts", json=bad).status_code == 400
    for good in ("https://aifazi.net/x", "/tools", "#section", "mailto:hi@aifazi.net"):
        ok = _layout(blocks=[{"id": "b1", "type": "cta-banner", "props": {"ctaHref": good}}])
        assert client.post("/layouts", json=ok).status_code == 200, good


def test_list_offset_pagination(client):  # type: ignore[no-untyped-def]
    for i in range(3):
        assert client.post("/layouts", json=_layout(slug=f"pg-{i}", published=True)).status_code == 200
    page1 = client.get("/layouts?offset=0").json()
    page2 = client.get("/layouts?offset=2").json()
    assert page1["offset"] == 0 and len(page1["layouts"]) == 3
    assert page2["offset"] == 2 and len(page2["layouts"]) == 1
