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
        self._slice = None
        self._order = None

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

    def in_(self, key, values):
        vals = list(values)
        self._filters.append((key, vals))
        return self

    def order(self, key, desc=False):
        self._order = (key, desc)
        return self

    def limit(self, n):
        return self

    def range(self, start, end):
        self._slice = (start, end)
        return self

    def _match(self, row):
        for k, v in self._filters:
            if isinstance(v, list):
                if row.get(k) not in v:
                    return False
            elif row.get(k) != v:
                return False
        return True

    def execute(self):  # type: ignore[no-untyped-def]
        rows = self._store.setdefault(self._table, [])
        if self._op == "select":
            rows = [dict(r) for r in rows if self._match(r)]
            if self._order:
                key, desc = self._order
                rows.sort(key=lambda r: r.get(key) or "", reverse=desc)
            if self._slice:
                start, end = self._slice
                rows = rows[start : end + 1]
            return types.SimpleNamespace(data=rows)
        if self._op == "insert":
            row = dict(self._payload)
            row.setdefault("id", f"id-{len(rows)}")
            row.setdefault("created_at", f"{len(rows):06d}")
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
        "infra_diagrams_under_test",
        os.path.join(BACKEND_DIR, "routers", "infra_diagrams.py"),
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
    assert client.get("/diagrams").json() == {"diagrams": [], "offset": 0}


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


# ── Round-2 audit additions ────────────────────────────────────────────────


def test_writes_require_admin(denied_client):
    assert denied_client.post("/diagrams", json=_doc()).status_code == 403
    assert denied_client.put("/diagrams/x", json=_doc()).status_code == 403
    assert denied_client.delete("/diagrams/x").status_code == 403
    assert denied_client.get("/diagrams/admin/all").status_code == 403


def test_empty_slug_derives_from_title(client):
    body = _doc(slug="")
    body["title"] = "My Backup Site"
    r = client.post("/diagrams", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["diagram"]["slug"] == "my-backup-site"


def test_reserved_slug_rejected_when_derived_from_title(client):
    body = _doc(slug="")
    body["title"] = "Plan A"
    assert client.post("/diagrams", json=body).status_code == 400


def test_empty_doc_rejected(client):
    body = _doc()
    body["nodes"] = []
    assert client.post("/diagrams", json=body).status_code == 400


def test_duplicate_node_id_rejected(client):
    body = _doc()
    node = dict(body["nodes"][0])
    body["nodes"] = [node, dict(node)]
    assert client.post("/diagrams", json=body).status_code == 400


def test_doc_byte_cap_rejected(client):
    body = _doc()
    body["nodes"] = [
        {
            "id": f"n{i}", "name": "x", "category": "network", "layer": "cloud",
            "desc": "d" * 2000, "notes": "n" * 2000,
        }
        for i in range(200)
    ]
    r = client.post("/diagrams", json=body)
    assert r.status_code == 400
    assert "large" in r.json()["detail"].lower()


def test_unbounded_node_id_rejected(client):
    body = _doc()
    body["nodes"][0]["id"] = "x" * 5000
    assert client.post("/diagrams", json=body).status_code == 400


def test_update_bumps_updated_at(client):
    import time

    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    before = client.get("/diagrams/admin/all").json()["diagrams"][0]["updatedAt"]
    time.sleep(0.01)
    body = _doc()
    body["title"] = "HQ East v2"
    r = client.put(f"/diagrams/{doc_id}", json=body)
    assert r.status_code == 200, r.text
    after = r.json()["diagram"]["updatedAt"]
    assert before and after and after > before


def test_list_offset_pagination(client):  # type: ignore[no-untyped-def]
    for slug in ("pg-one", "pg-two"):
        body = _doc(slug=slug)
        body["published"] = True
        assert client.post("/diagrams", json=body).status_code == 200
    page1 = client.get("/diagrams?offset=0").json()
    page2 = client.get("/diagrams?offset=1").json()
    assert page1["offset"] == 0 and len(page1["diagrams"]) == 2
    assert page2["offset"] == 1 and len(page2["diagrams"]) == 1


def test_offset_rejects_negative(client):  # type: ignore[no-untyped-def]
    assert client.get("/diagrams?offset=-1").status_code == 422


# ── Round-2 plan B4: revision history / restore ─────────────────────────────


def test_update_snapshots_revision(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    body = _doc()
    body["title"] = "HQ East v2"
    assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200
    revs = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"]
    assert len(revs) == 1
    assert revs[0]["title"] == "HQ East"
    assert revs[0]["published"] is False


def test_revision_restore_roundtrip(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    body = _doc()
    body["title"] = "HQ East v2"
    body["nodes"][0]["name"] = "FW-02"
    assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200
    revs = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"]
    assert len(revs) == 1
    r = client.post(f"/diagrams/{doc_id}/revisions/{revs[0]['id']}/restore")
    assert r.status_code == 200, r.text
    restored = r.json()["diagram"]
    assert restored["title"] == "HQ East"
    assert restored["nodes"][0]["name"] == "FW-01"
    # The pre-restore state was snapshotted too, so restore is undoable.
    revs2 = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"]
    assert len(revs2) == 2
    assert revs2[0]["title"] == "HQ East v2"


def test_restore_keeps_live_slug(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    body = _doc(slug="hq-west")
    body["title"] = "HQ West"
    assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200
    revs = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"]
    r = client.post(f"/diagrams/{doc_id}/revisions/{revs[0]['id']}/restore")
    assert r.status_code == 200, r.text
    assert r.json()["diagram"]["title"] == "HQ East"
    assert r.json()["diagram"]["slug"] == "hq-west"


def test_revision_endpoints_require_admin(denied_client):
    denied_client.post("/diagrams", json=_doc())
    doc_id = "any"
    assert denied_client.get(f"/diagrams/{doc_id}/revisions").status_code == 403
    assert denied_client.get(f"/diagrams/{doc_id}/revisions/rid").status_code == 403
    assert denied_client.post(
        f"/diagrams/{doc_id}/revisions/rid/restore"
    ).status_code == 403


def test_revision_404s(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    assert client.get("/diagrams/nope/revisions").status_code in (404, 200)
    assert client.get(f"/diagrams/{doc_id}/revisions/nope").status_code == 404
    assert client.post(
        f"/diagrams/{doc_id}/revisions/nope/restore"
    ).status_code == 404
    assert client.post("/diagrams/nope/revisions/nope/restore").status_code == 404


def test_revision_prune_cap(client):
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    for i in range(25):
        body = _doc()
        body["title"] = f"HQ East r{i}"
        assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200
    revs = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"]
    assert len(revs) <= 20


def test_reserved_template_slugs_rejected(client):
    for slug in ("multi-site", "dr-site", "hybrid-join"):
        assert client.post("/diagrams", json=_doc(slug=slug)).status_code == 400


# ── Hybrid-infra audit B3/B4/B5: geometry + flow endpoint validation ───────


def test_finite_float_geometry_accepted(client):
    body = _doc()
    body["nodes"][0]["x"] = 10.5
    assert client.post("/diagrams", json=body).status_code == 200


def test_bad_geometry_rejected(client):
    import json as jsonlib

    # Bools/strings/huge ints serialize via the normal JSON path.
    for bad in (True, "10", 10**400):
        body = _doc()
        body["nodes"][0]["x"] = bad
        assert client.post("/diagrams", json=body).status_code == 400, bad
    # NaN/Infinity tokens: browsers stringify them to null, but raw clients
    # can still send them (Python's json module accepts the tokens).
    for bad in (float("nan"), float("inf"), -float("inf")):
        body = _doc()
        body["nodes"][0]["x"] = bad
        r = client.post(
            "/diagrams",
            content=jsonlib.dumps(body),
            headers={"content-type": "application/json"},
        )
        assert r.status_code == 400, bad


def test_flow_non_string_endpoints_rejected(client):
    # Unhashable endpoints (list/dict) used to raise TypeError → 500 (B3).
    for bad_from in (["fw1"], {"id": "fw1"}, 1, None):
        body = _doc()
        body["flows"] = [{"id": "f1", "from": bad_from, "to": "fw1", "cat": "network"}]
        assert client.post("/diagrams", json=body).status_code == 400, bad_from


def test_flow_self_loop_rejected(client):
    body = _doc()
    body["flows"] = [{"id": "f1", "from": "fw1", "to": "fw1", "cat": "network"}]
    assert client.post("/diagrams", json=body).status_code == 400


def test_palette_validators_reject_bad_input(client):  # type: ignore[no-untyped-def]
    """Unit checks for the validators the restore path re-runs (B5)."""
    from fastapi import HTTPException

    module = _load_module()
    for bad in ({"network": "red"}, {"Bad Key": "#123456"}, "nope",
                {f"k{i}": "#123456" for i in range(33)}):
        with pytest.raises(HTTPException):
            module._validate_palette(bad)
    with pytest.raises(HTTPException):
        module._validate_custom_categories({"network": {"label": "x", "color": "#123456"}})
    with pytest.raises(HTTPException):
        module._validate_custom_categories({"iot": {"label": "x", "color": "red"}})
    assert module._validate_palette({"network": "#123456"}) == {"network": "#123456"}


def test_restore_revalidates_stored_palette(monkeypatch):  # type: ignore[no-untyped-def]
    """A forged/legacy revision with a bad palette must 400, not persist (B5)."""
    fake = _FakeSupabase()
    db_stub = types.ModuleType("database")
    db_stub.supabase = fake
    deps_stub = types.ModuleType("dependencies")
    deps_stub.require_admin = _fake_require_admin
    deps_stub.decode_token = lambda token: {"role": "admin"}
    deps_stub._enrich_user = lambda payload: payload
    monkeypatch.setitem(sys.modules, "database", db_stub)
    monkeypatch.setitem(sys.modules, "dependencies", deps_stub)
    module = _load_module()
    app = FastAPI()
    app.include_router(module.router)
    client = TestClient(app)

    good = _doc()
    assert client.post("/diagrams", json=good).status_code == 200
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    fake.store.setdefault("infra_diagram_revisions", []).append({
        "id": "rev-bad",
        "diagram_id": doc_id,
        "title": "Old title",
        "published": False,
        "created_at": "20260101000000",
        "doc": {**good, "categoryColors": {"network": "red"}},
    })
    r = client.post(f"/diagrams/{doc_id}/revisions/rev-bad/restore")
    assert r.status_code == 400, r.text
    # Restore is atomic: the live row keeps its title (not the forged one).
    assert client.get("/diagrams/admin/all").json()["diagrams"][0]["title"] == "HQ East"


# -- Group field (gid): short strings stored, anything else 400 ----------


def test_node_gid_accepted(client):
    body = _doc()
    body["nodes"][0]["gid"] = "g-abc123-1"
    assert client.post("/diagrams", json=body).status_code == 200


def test_bad_node_gid_rejected(client):
    for bad in ("", "x" * 41, 123, ["g-1"], {"id": "g-1"}):
        body = _doc()
        body["nodes"][0]["gid"] = bad
        assert client.post("/diagrams", json=body).status_code == 400, bad
