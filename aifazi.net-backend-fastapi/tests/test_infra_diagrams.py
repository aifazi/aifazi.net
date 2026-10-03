"""Tests for routers/infra_diagrams.py (hybrid-infra builder persistence).

Public reads of published docs, admin-only writes, reserved slug guard,
payload caps, draft visibility rules.
"""
import importlib.util
import os
import sys
import types
import uuid

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
        self._order = []

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
        # Honest fake (B2): PostgREST rejects non-uuid literals on uuid
        # columns — mirror that so a missing route-level uuid guard fails
        # the test instead of silently matching.
        if key in ("id", "diagram_id") and isinstance(value, str):
            try:
                uuid.UUID(value)
            except ValueError:
                raise ValueError(f"invalid input syntax for type uuid: {value!r}")
        self._filters.append((key, value))
        return self

    def in_(self, key, values):
        vals = list(values)
        if key in ("id", "diagram_id"):
            for v in vals:
                if isinstance(v, str):
                    try:
                        uuid.UUID(v)
                    except ValueError:
                        raise ValueError(f"invalid input syntax for type uuid: {v!r}")
        self._filters.append((key, vals))
        return self

    def order(self, key, desc=False):
        # PostgREST appends orderings; keep them all so multi-key sorts
        # (revisions prune: created_at DESC, id DESC) behave like the real
        # thing instead of the last .order() clobbering the first (N8).
        self._order.append((key, desc))
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
            # Stable sorts applied last-key-first so the FIRST .order() key
            # ends up primary (matches PostgREST multi-order semantics).
            for key, desc in reversed(self._order):
                rows.sort(key=lambda r: r.get(key) or "", reverse=desc)
            if self._slice:
                start, end = self._slice
                rows = rows[start : end + 1]
            return types.SimpleNamespace(data=rows)
        if self._op == "insert":
            row = dict(self._payload)
            # Real tables use uuid PKs — mirror them so router-level uuid
            # validation sees what PostgREST would see.
            row.setdefault("id", str(uuid.uuid4()))
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


def _build_app(monkeypatch, require_admin, decode_token=None, return_fake=False):  # type: ignore[no-untyped-def]
    fake = _FakeSupabase()
    db_stub = types.ModuleType("database")
    db_stub.supabase = fake
    deps_stub = types.ModuleType("dependencies")
    deps_stub.require_admin = require_admin
    deps_stub.decode_token = decode_token or (lambda token: {"role": "admin"})
    deps_stub._enrich_user = lambda payload: payload
    monkeypatch.setitem(sys.modules, "database", db_stub)
    monkeypatch.setitem(sys.modules, "dependencies", deps_stub)
    module = _load_module()
    app = FastAPI()
    app.include_router(module.router)
    client = TestClient(app)
    if return_fake:
        return client, fake, module
    return client


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
    # Non-uuid path ids must be a clean 404 (B2), never a PostgREST 500.
    assert client.get("/diagrams/nope/revisions").status_code == 404
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
    rev_id = str(uuid.uuid4())
    fake.store.setdefault("infra_diagram_revisions", []).append({
        "id": rev_id,
        "diagram_id": doc_id,
        "title": "Old title",
        "published": False,
        "created_at": "20260101000000",
        "doc": {**good, "categoryColors": {"network": "red"}},
    })
    r = client.post(f"/diagrams/{doc_id}/revisions/{rev_id}/restore")
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


# -- A5-9: workloads/deps entry types (what sanitizeDoc silently drops) -------


def test_node_workloads_deps_accepted(client):
    """Valid strings round-trip untouched, at the frontend's caps."""
    body = _doc()
    body["nodes"][0]["workloads"] = ["api-gateway", "w" * 60]
    body["nodes"][0]["deps"] = ["fw1", "x" * 200]
    r = client.post("/diagrams", json=body)
    assert r.status_code == 200, r.text
    got = r.json()["diagram"]["nodes"][0]
    assert got["workloads"] == ["api-gateway", "w" * 60]
    # No length cap on deps — sanitizeDoc keeps any string (JSON import).
    assert got["deps"] == ["fw1", "x" * 200]


@pytest.mark.parametrize("bad", [123, None, ["w"], {"name": "w"}, ""])
def test_bad_node_workload_rejected(client, bad):
    """Entries the frontend sanitizeDoc would drop on load are a 400 here,
    not silently stored and lost on the round-trip."""
    body = _doc()
    body["nodes"][0]["workloads"] = [bad]
    assert client.post("/diagrams", json=body).status_code == 400, bad


def test_long_node_workload_rejected(client):
    """Over 60 chars the frontend would silently truncate on load."""
    body = _doc()
    body["nodes"][0]["workloads"] = ["w" * 61]
    assert client.post("/diagrams", json=body).status_code == 400


@pytest.mark.parametrize("bad", [123, None, ["d"], {"id": "d"}, ""])
def test_bad_node_dep_rejected(client, bad):
    body = _doc()
    body["nodes"][0]["deps"] = [bad]
    assert client.post("/diagrams", json=body).status_code == 400, bad


def test_bad_node_workload_rejected_on_update(client):
    """The gate applies to PUT (full-document replace) as well."""
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    body = _doc()
    body["nodes"][0]["workloads"] = [{"name": "w"}]
    r = client.put(f"/diagrams/{doc_id}", json=body)
    assert r.status_code == 400, r.text


# -- N10: unknown doc fields are stripped on write -----------------------------


def test_unknown_node_and_flow_fields_stripped(client):
    """N10: extra keys beyond the whitelisted node/flow shape are dropped on
    write (schema-drift guard); whitelisted fields round-trip untouched."""
    body = _doc()
    body["nodes"].append({
        "id": "lb1", "name": "LB-01", "category": "network",
        "layer": "edge", "role": "Edge", "desc": "d",
        "workloads": [], "deps": [],
        "x": 10, "y": 60, "w": 100, "h": 50, "shape": "chip",
    })
    body["nodes"][0]["rogueKey"] = "x"
    body["nodes"][0]["customMeta"] = {"a": 1}
    body["nodes"][0]["x"] = None  # nulls are omitted, matching the frontend doc shape
    body["flows"] = [{"from": "fw1", "to": "lb1", "label": "traffic", "rogue": True}]
    r = client.post("/diagrams", json=body)
    assert r.status_code == 200, r.text
    stored = r.json()["diagram"]
    assert "rogueKey" not in stored["nodes"][0]
    assert "customMeta" not in stored["nodes"][0]
    assert "x" not in stored["nodes"][0]
    assert "rogue" not in stored["flows"][0]
    assert stored["nodes"][0]["name"] == "FW-01"
    assert stored["nodes"][1]["shape"] == "chip"
    assert stored["flows"][0]["label"] == "traffic"


# -- Hybrid-infra audit batch 3: B1/B2/B8/B9/N5/N7 + optional-admin ----------


def test_non_uuid_ids_404(client):
    """B2: malformed path ids are caught before PostgREST sees them."""
    body = _doc()
    assert client.put("/diagrams/nope", json=body).status_code == 404
    assert client.delete("/diagrams/nope").status_code == 404
    assert client.get("/diagrams/nope/revisions").status_code == 404
    assert client.get("/diagrams/nope/revisions/also-nope").status_code == 404
    assert client.post(
        "/diagrams/nope/revisions/also-nope/restore"
    ).status_code == 404
    # A well-formed but unknown uuid still 404s through the normal path.
    gone = str(uuid.uuid4())
    assert client.put(f"/diagrams/{gone}", json=body).status_code == 404
    assert client.delete(f"/diagrams/{gone}").status_code == 404


def test_expected_updated_at_gate(client):
    """B8/N5: a stale expectedUpdatedAt 409s instead of clobbering."""
    client.post("/diagrams", json=_doc())
    row = client.get("/diagrams/admin/all").json()["diagrams"][0]
    doc_id, current = row["id"], row["updatedAt"]

    stale = _doc()
    stale["expectedUpdatedAt"] = "2020-01-01T00:00:00+00:00"
    assert client.put(f"/diagrams/{doc_id}", json=stale).status_code == 409

    fresh = _doc()
    fresh["expectedUpdatedAt"] = current
    r = client.put(f"/diagrams/{doc_id}", json=fresh)
    assert r.status_code == 200, r.text

    # Omitting the stamp keeps legacy behaviour (unconditional save).
    assert client.put(f"/diagrams/{doc_id}", json=_doc()).status_code == 200


def test_conditional_update_race_conflicts(monkeypatch):  # type: ignore[no-untyped-def]
    """N5: when the claim filter misses a still-existing row -> 409, and the
    snapshot never runs (no revision written for the losing writer)."""
    client, fake, _module = _build_app(monkeypatch, _fake_require_admin, return_fake=True)
    assert client.post("/diagrams", json=_doc()).status_code == 200
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]

    orig_execute = _Query.execute
    state = {"hit": False}

    def flaky(self):  # type: ignore[no-untyped-def]
        if not state["hit"] and self._op == "update" and self._table == "infra_diagrams":
            state["hit"] = True
            # A concurrent writer bumped updated_at between our read and our
            # conditional UPDATE: the filter matches nothing.
            return types.SimpleNamespace(data=[])
        return orig_execute(self)

    monkeypatch.setattr(_Query, "execute", flaky)
    r = client.put(f"/diagrams/{doc_id}", json=_doc())
    assert r.status_code == 409, r.text
    revs = fake.store.get("infra_diagram_revisions", [])
    assert revs == [], "the losing writer must not snapshot the pre-state"


def test_snapshot_failure_reported_but_save_succeeds(monkeypatch):  # type: ignore[no-untyped-def]
    """N7: a failed revision snapshot is surfaced via snapshotFailed, and the
    save itself still succeeds (revisions are best-effort)."""
    client, _fake, _module = _build_app(monkeypatch, _fake_require_admin, return_fake=True)
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]

    ok = client.put(f"/diagrams/{doc_id}", json=_doc())
    assert ok.status_code == 200
    assert "snapshotFailed" not in ok.json()

    orig_execute = _Query.execute

    def broken(self):  # type: ignore[no-untyped-def]
        if self._table == "infra_diagram_revisions" and self._op == "insert":
            raise RuntimeError("revisions table down")
        return orig_execute(self)

    monkeypatch.setattr(_Query, "execute", broken)
    r = client.put(f"/diagrams/{doc_id}", json=_doc())
    assert r.status_code == 200, r.text
    assert r.json().get("snapshotFailed") is True


def test_writes_produce_audit_trail(monkeypatch):  # type: ignore[no-untyped-def]
    """B9: create/update/publish/unpublish/restore/delete are attributed."""
    client, _fake, module = _build_app(monkeypatch, _fake_require_admin, return_fake=True)
    calls: list = []
    monkeypatch.setattr(
        module.audit, "record",
        lambda *a, **k: calls.append(a) or True,
    )

    assert client.post("/diagrams", json=_doc()).status_code == 200
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]

    body = _doc()
    body["title"] = "HQ East v2"
    assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200

    body = _doc()
    body["title"] = "HQ East v2"
    body["published"] = True
    assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200

    body = _doc()
    body["title"] = "HQ East v2"
    assert client.put(f"/diagrams/{doc_id}", json=body).status_code == 200

    rev_id = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"][0]["id"]
    assert client.post(f"/diagrams/{doc_id}/revisions/{rev_id}/restore").status_code == 200
    assert client.delete(f"/diagrams/{doc_id}").status_code == 200

    actions = [c[1] for c in calls]
    assert actions == [
        "infra.create", "infra.update", "infra.publish",
        "infra.unpublish", "infra.restore", "infra.delete",
    ]
    assert all(c[0] == "admin" for c in calls), "actor must be the admin username"
    assert all(c[4] for c in calls), "client ip must be captured"


def test_counts_live_in_columns_for_lists(client):
    """B1: list endpoints answer from stored counts, not the doc body."""
    client.post("/diagrams", json=_doc())
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    published = _doc()
    published["published"] = True
    assert client.put(f"/diagrams/{doc_id}", json=published).status_code == 200
    pub = client.get("/diagrams").json()["diagrams"][0]
    adm = client.get("/diagrams/admin/all").json()["diagrams"][0]
    for listed in (pub, adm):
        assert listed["nodeCount"] == 1
        assert listed["flowCount"] == 0
        assert "nodes" not in listed and "doc" not in listed


def test_draft_preview_uses_optional_admin(monkeypatch):  # type: ignore[no-untyped-def]
    """Drafts 404 for anonymous callers but resolve for an admin token/cookie."""
    client = _build_app(monkeypatch, _fake_require_admin)
    assert client.post("/diagrams", json=_doc()).status_code == 200
    assert client.get("/diagrams/hq-east").status_code == 404
    assert client.get(
        "/diagrams/hq-east", headers={"Authorization": "Bearer t"}
    ).status_code == 200
    assert client.get(
        "/diagrams/hq-east", cookies={"auth_token": "t"}
    ).status_code == 200


def test_draft_preview_denied_when_token_check_fails(monkeypatch):  # type: ignore[no-untyped-def]
    """_optional_admin fails closed: a broken token check still 404s drafts."""
    def boom(token):  # type: ignore[no-untyped-def]
        raise ValueError("bad token")

    client = _build_app(monkeypatch, _fake_require_admin, decode_token=boom)
    assert client.post("/diagrams", json=_doc()).status_code == 200
    assert client.get(
        "/diagrams/hq-east", headers={"Authorization": "Bearer t"}
    ).status_code == 404


# ── Round-3 leftovers (B10/B13/B14) ─────────────────────────────────────────


def test_blank_title_rejected(client):
    """B10: whitespace-only titles never reach slug derivation (422)."""
    body = _doc(slug="")
    body["title"] = "   "
    assert client.post("/diagrams", json=body).status_code == 422

    body["title"] = "Real Title"
    assert client.post("/diagrams", json=body).status_code == 200


def test_public_reads_send_cache_headers(client):
    """B13: published reads carry ETag + a short public Cache-Control, honor
    If-None-Match with a 304, and drafts stay no-store."""
    r = client.get("/diagrams")
    assert r.status_code == 200
    assert r.headers["cache-control"].startswith("public,")
    etag = r.headers["etag"]
    assert etag.startswith('"')

    r304 = client.get("/diagrams", headers={"If-None-Match": etag})
    assert r304.status_code == 304
    assert r304.content == b""

    r200 = client.get("/diagrams", headers={"If-None-Match": '"stale"'})
    assert r200.status_code == 200

    assert client.post("/diagrams", json=_doc()).status_code == 200
    draft = client.get("/diagrams/hq-east", headers={"Authorization": "Bearer t"})
    assert draft.status_code == 200
    assert draft.headers["cache-control"] == "no-store"

    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    published = _doc()
    published["published"] = True
    assert client.put(f"/diagrams/{doc_id}", json=published).status_code == 200
    pub = client.get("/diagrams/hq-east")
    assert pub.status_code == 200
    assert pub.headers["cache-control"].startswith("public,")
    pub_etag = pub.headers["etag"]
    assert client.get(
        "/diagrams/hq-east", headers={"If-None-Match": pub_etag}
    ).status_code == 304

    # Content changed -> different ETag -> full 200 again.
    changed = _doc()
    changed["published"] = True
    changed["title"] = "HQ East v2"
    assert client.put(f"/diagrams/{doc_id}", json=changed).status_code == 200
    moved = client.get("/diagrams/hq-east", headers={"If-None-Match": pub_etag})
    assert moved.status_code == 200
    assert moved.headers["etag"] != pub_etag


def test_unique_sqlstate_conflicts_not_substrings(monkeypatch):  # type: ignore[no-untyped-def]
    """B14: 409 comes from APIError.code == '23505' only — a failure whose
    message merely mentions duplication stays a 500."""
    from postgrest.exceptions import APIError

    client, _fake, _module = _build_app(monkeypatch, _fake_require_admin, return_fake=True)
    assert client.post("/diagrams", json=_doc()).status_code == 200
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]

    orig_execute = _Query.execute
    state = {"mode": None, "code": None, "message": ""}

    def flaky(self):  # type: ignore[no-untyped-def]
        if state["mode"] and self._table == "infra_diagrams" and self._op == state["mode"]:
            raise APIError({"code": state["code"], "message": state["message"]})
        return orig_execute(self)

    monkeypatch.setattr(_Query, "execute", flaky)

    state.update(
        mode="insert",
        code="23505",
        message="duplicate key value violates unique constraint",
    )
    assert client.post("/diagrams", json=_doc(slug="other")).status_code == 409

    state.update(
        mode="update",
        code="23505",
        message="duplicate key value violates unique constraint",
    )
    assert client.put(f"/diagrams/{doc_id}", json=_doc()).status_code == 409

    state.update(
        mode="update",
        code="23503",
        message="duplicate reference in foreign key constraint",
    )
    assert client.put(f"/diagrams/{doc_id}", json=_doc()).status_code == 500


# ── PR B: editable decorations (boxes/labels) ────────────────────────────────


def _decorations():
    return [
        {
            "id": "zone-hq", "kind": "box", "z": "back",
            "x": 100, "y": 60, "w": 420, "h": 240, "r": 12,
            "fill": "#0c1c308c", "stroke": "#78aade",
            "lines": [
                {"text": "HQ - East DC", "dx": 14, "dy": 18, "size": 12,
                 "weight": "700", "color": "cyan"}
            ],
            "connects": ["fw1"],
        },
        {
            "id": "note-a", "kind": "label", "z": "front",
            "text": "DR site standby", "size": 11, "weight": "700",
            "align": "center", "color": "amber",
            "anchor": {"id": "fw1", "dx": 12, "dy": 40},
        },
        {
            "id": "free-b", "kind": "label", "text": "Free label",
            "x": 20, "y": 30,
        },
    ]


def test_decorations_roundtrip(client):
    body = _doc(slug="decor-ok")
    body["published"] = True
    body["decorations"] = _decorations()
    r = client.post("/diagrams", json=body)
    assert r.status_code == 200, r.text
    decos = r.json()["diagram"]["decorations"]
    assert [d["id"] for d in decos] == ["zone-hq", "note-a", "free-b"]
    assert decos[0]["z"] == "back"
    assert decos[0]["lines"][0]["color"] == "cyan"
    assert decos[1]["anchor"] == {"id": "fw1", "dx": 12, "dy": 40}
    assert "text" not in decos[0]

    # Public GET serves them back too (published + no auth → anonymous read).
    got = client.get("/diagrams/decor-ok").json()["diagram"]
    assert [d["id"] for d in got["decorations"]] == ["zone-hq", "note-a", "free-b"]

    # Update that omits decorations drops them (whitelist rebuild, not merge).
    doc_id = r.json()["diagram"]["id"]
    stripped = _doc(slug="decor-ok")
    stripped["published"] = True
    assert client.put(f"/diagrams/{doc_id}", json=stripped).status_code == 200
    assert "decorations" not in client.get("/diagrams/decor-ok").json()["diagram"]


def test_decorations_revision_restore_roundtrip(client):
    body = _doc(slug="decor-rev")
    body["decorations"] = _decorations()
    assert client.post("/diagrams", json=body).status_code == 200
    doc_id = client.get("/diagrams/admin/all").json()["diagrams"][0]["id"]
    # Second save without decorations: the snapshot must keep the originals.
    assert client.put(f"/diagrams/{doc_id}", json=_doc(slug="decor-rev")).status_code == 200
    revs = client.get(f"/diagrams/{doc_id}/revisions").json()["revisions"]
    assert len(revs) == 1
    rev = client.get(f"/diagrams/{doc_id}/revisions/{revs[0]['id']}").json()["revision"]
    assert [d["id"] for d in rev["decorations"]] == ["zone-hq", "note-a", "free-b"]
    r = client.post(f"/diagrams/{doc_id}/revisions/{revs[0]['id']}/restore")
    assert r.status_code == 200, r.text
    restored = r.json()["diagram"]
    assert [d["id"] for d in restored["decorations"]] == ["zone-hq", "note-a", "free-b"]


def test_bad_decorations_rejected(client):
    # Unknown kind / z.
    for key, value in (("kind", "circle"), ("z", "middle")):
        body = _doc()
        deco = dict(_decorations()[0])
        deco[key] = value
        body["decorations"] = [deco]
        assert client.post("/diagrams", json=body).status_code == 400, (key, value)
    # Box missing geometry.
    body = _doc()
    deco = dict(_decorations()[0])
    del deco["x"]
    body["decorations"] = [deco]
    assert client.post("/diagrams", json=body).status_code == 400
    # Label with neither anchor nor coordinates.
    body = _doc()
    body["decorations"] = [{"id": "l1", "kind": "label", "text": "hi"}]
    assert client.post("/diagrams", json=body).status_code == 400
    # Not an object / duplicate ids.
    body = _doc()
    body["decorations"] = ["nope"]
    assert client.post("/diagrams", json=body).status_code == 400
    body = _doc()
    body["decorations"] = [_decorations()[2], dict(_decorations()[2])]
    assert client.post("/diagrams", json=body).status_code == 400
    # Colors: palette tokens OK, anything else rejected.
    for bad_color in ("#zz0000", "chartreuse", "#12345"):
        body = _doc()
        deco = dict(_decorations()[2])
        deco["color"] = bad_color
        body["decorations"] = [deco]
        assert client.post("/diagrams", json=body).status_code == 400, bad_color


def test_decoration_non_finite_geometry_rejected(client):
    import json as jsonlib

    for bad in (float("nan"), float("inf")):
        body = _doc()
        deco = dict(_decorations()[0])
        deco["x"] = bad
        body["decorations"] = [deco]
        r = client.post(
            "/diagrams",
            content=jsonlib.dumps(body),
            headers={"content-type": "application/json"},
        )
        assert r.status_code == 400, bad


def test_too_many_decorations_rejected(client):
    body = _doc()
    body["decorations"] = [
        {**_decorations()[2], "id": f"lab-{i}"} for i in range(101)
    ]
    # Pydantic list cap → 422; endpoint guard → 400. Either fail-closed is fine.
    assert client.post("/diagrams", json=body).status_code in (400, 422)
