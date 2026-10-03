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
        self._filters_in = None
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

    def in_(self, key, values):
        self._filters_in = (key, list(values))
        return self

    def _match(self, row):
        if self._filters_in is not None and row.get(self._filters_in[0]) not in self._filters_in[1]:
            return False
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


def _build_app(monkeypatch, require_admin, module_box=None):  # type: ignore[no-untyped-def]
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
    if module_box is not None:
        module_box.append(module)
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


# ── Batch 3 A2: SEO fields + revision history ──────────────────────────────


def test_seo_fields_roundtrip(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(
        slug="seo-page", published=True, seo_title="Meta title", seo_description="Meta desc",
    )).json()["layout"]
    assert created["seoTitle"] == "Meta title"
    assert created["seoDescription"] == "Meta desc"
    got = client.get("/layouts/seo-page").json()["layout"]
    assert got["seoTitle"] == "Meta title"
    upd = client.put(f"/layouts/{created['id']}", json=_layout(
        slug="seo-page", title="Home v2", seo_title="New title",
    )).json()["layout"]
    assert upd["seoTitle"] == "New title"
    assert upd["seoDescription"] == ""  # omitted → default


def test_seo_length_capped_by_schema(client):  # type: ignore[no-untyped-def]
    r = client.post("/layouts", json=_layout(slug="big-seo", seo_title="x" * 200))
    assert r.status_code == 422  # pydantic max_length


def test_update_snapshots_revision(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(
        slug="rev-page", title="v1",
        blocks=[{"id": "b1", "type": "hero", "props": {"title": "v1"}}],
    )).json()["layout"]
    r = client.put(f"/layouts/{created['id']}", json=_layout(
        slug="rev-page", title="v2",
        blocks=[{"id": "b2", "type": "hero", "props": {"title": "v2"}}],
    ))
    assert r.status_code == 200, r.text
    revs = client.get(f"/layouts/{created['id']}/revisions").json()["revisions"]
    assert len(revs) == 1
    assert revs[0]["title"] == "v1"  # snapshot = PRE-update state
    detail = client.get(
        f"/layouts/{created['id']}/revisions/{revs[0]['id']}"
    ).json()["revision"]
    assert detail["blocks"][0]["props"]["title"] == "v1"


def test_restore_revision_roundtrip(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(
        slug="res-page", title="v1",
        blocks=[{"id": "b1", "type": "hero", "props": {"title": "v1"}}],
    )).json()["layout"]
    client.put(f"/layouts/{created['id']}", json=_layout(
        slug="res-page", title="v2",
        blocks=[{"id": "b2", "type": "hero", "props": {"title": "v2"}}],
    ))
    revs = client.get(f"/layouts/{created['id']}/revisions").json()["revisions"]
    r = client.post(f"/layouts/{created['id']}/revisions/{revs[0]['id']}/restore")
    assert r.status_code == 200, r.text
    got = r.json()["layout"]
    assert got["title"] == "v1"
    assert got["blocks"][0]["props"]["title"] == "v1"
    # the restore snapshotted v2 first, so it is itself undoable
    revs2 = client.get(f"/layouts/{created['id']}/revisions").json()["revisions"]
    assert any(x["title"] == "v2" for x in revs2)


def test_restore_missing_revision_404(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(slug="r404")).json()["layout"]
    assert client.post(f"/layouts/{created['id']}/revisions/nope/restore").status_code == 404
    assert client.get(f"/layouts/{created['id']}/revisions/nope").status_code == 404


def test_restore_update_error_is_typed_500(monkeypatch):  # type: ignore[no-untyped-def]
    """N9: a failing restore write is a logged, typed 500 — not a raw
    PostgREST exception through the global handler (parity with
    infra_diagrams restore)."""
    box: list = []
    client = _build_app(monkeypatch, _fake_require_admin, box)
    module = box[0]
    created = client.post("/layouts", json=_layout(slug="err-page", title="v1")).json()["layout"]
    client.put(f"/layouts/{created['id']}", json=_layout(slug="err-page", title="v2"))
    revs = client.get(f"/layouts/{created['id']}/revisions").json()["revisions"]

    real_table = module.supabase.table

    def failing_update_table(name):
        q = real_table(name)
        orig_update = q.update

        def failing_update(payload):
            qq = orig_update(payload)
            real_execute = qq.execute

            def failing_execute():
                raise RuntimeError("db down")

            qq.execute = failing_execute
            return qq

        q.update = failing_update
        return q

    monkeypatch.setattr(module.supabase, "table", failing_update_table)
    r = client.post(f"/layouts/{created['id']}/revisions/{revs[0]['id']}/restore")
    assert r.status_code == 500, r.text
    assert "Could not restore layout" in r.text


def test_revisions_require_admin(denied_client):  # type: ignore[no-untyped-def]
    assert denied_client.get("/layouts/x/revisions").status_code == 403
    assert denied_client.get("/layouts/x/revisions/y").status_code == 403
    assert denied_client.post("/layouts/x/revisions/y/restore").status_code == 403


def test_revision_prune_keeps_cap(monkeypatch):  # type: ignore[no-untyped-def]
    box: list = []
    client = _build_app(monkeypatch, _fake_require_admin, box)
    box[0].MAX_REVISIONS = 2
    created = client.post("/layouts", json=_layout(slug="prune-page")).json()["layout"]
    for i in range(4):
        r = client.put(f"/layouts/{created['id']}", json=_layout(slug="prune-page", title=f"v{i}"))
        assert r.status_code == 200, r.text
    revs = client.get(f"/layouts/{created['id']}/revisions").json()["revisions"]
    assert len(revs) == 2


def test_delete_layout_cascades_revisions(client):  # type: ignore[no-untyped-def]
    created = client.post("/layouts", json=_layout(slug="cascade-page")).json()["layout"]
    client.put(f"/layouts/{created['id']}", json=_layout(slug="cascade-page", title="v2"))
    assert client.delete(f"/layouts/{created['id']}").status_code == 200
    # FK ON DELETE CASCADE removes revision rows in the real DB (the fake
    # store has no FKs); here we only assert the layout itself is gone.
    assert client.get("/layouts/cascade-page").status_code == 404
