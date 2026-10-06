"""CDN settings scope: PUT is admin-only; secrets stay masked and sticky."""
from __future__ import annotations

import importlib.util
import os
import sys
import types

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_pkg = types.ModuleType("routers")
_pkg.__path__ = [os.path.join(BACKEND_DIR, "routers")]
sys.modules.setdefault("routers", _pkg)


class _CdnTable:
    def __init__(self, store):
        self._store = store
        self._insert = None
        self._update = None

    def select(self, *a):
        return self

    def eq(self, col, val):
        return self

    def insert(self, row):
        self._insert = row
        return self

    def update(self, patch):
        self._update = patch
        return self

    def execute(self):
        if self._insert is not None:
            self._store["settings"] = dict(self._insert.get("settings", {}))
            return types.SimpleNamespace(data=[{"key": "global", "settings": dict(self._store["settings"])}])
        if self._update is not None:
            # Real semantics: UPDATE sets the settings COLUMN to the merged dict.
            self._store["settings"] = dict(self._update.get("settings", {}))
            return types.SimpleNamespace(data=[{"key": "global", "settings": dict(self._store["settings"])}])
        settings = self._store.get("settings")
        if settings is None:
            return types.SimpleNamespace(data=[])
        return types.SimpleNamespace(data=[{"key": "global", "settings": dict(settings)}])


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
        table=lambda name: _CdnTable(store) if name == "cdn_config" else _EmptyTable())
    db._escape_ilike = lambda s: s
    db.safe_search_term = lambda s: (s or "").strip()[:64]
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _deps_stub(actor):
    deps = types.ModuleType("dependencies")
    staff_roles = ("admin", "moderator", "editor", "chat")

    def _require_admin():
        if actor.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        return actor

    def _require_staff():
        if actor.get("role") not in staff_roles:
            raise HTTPException(status_code=403, detail="Staff only")
        return actor

    deps.require_admin = _require_admin
    deps.require_staff = _require_staff
    deps.get_current_user = lambda: actor
    return deps


def _upload_stub():
    m = types.ModuleType("routers.cdn_upload")
    m.get_cdn_config = lambda *a, **k: {}
    return m


def _audit_stub():
    m = types.ModuleType("utils.audit")
    m.record = lambda *a, **k: None
    m.record_auth = lambda *a, **k: None
    return m


def _load(monkeypatch, settings, actor):
    store = {"settings": dict(settings)}
    monkeypatch.setitem(sys.modules, "database", _db_stub(store))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub(actor))
    monkeypatch.setitem(sys.modules, "routers.cdn_upload", _upload_stub())
    monkeypatch.setitem(sys.modules, "utils.audit", _audit_stub())
    for m in ("routers.cdn_settings",):
        monkeypatch.delitem(sys.modules, m, raising=False)
    spec = importlib.util.spec_from_file_location(
        "cdn_settings_under_test",
        os.path.join(BACKEND_DIR, "routers", "cdn_settings.py"))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix="/api/admin/cdn")
    return module, TestClient(app, raise_server_exceptions=False), store


MOD = {"id": "mod-1", "username": "mod", "role": "moderator"}
ADMIN = {"id": "admin-1", "username": "root", "role": "admin"}
SETTINGS = {"cdn_url": "https://cdn.example.com", "cloudinaryApiSecret": "real-secret"}


def test_put_requires_admin(monkeypatch):
    _, client, store = _load(monkeypatch, SETTINGS, dict(MOD))
    r = client.put("/api/admin/cdn", json={"cdn_url": "https://evil.example.com"})
    assert r.status_code == 403, r.text
    assert store["settings"]["cdn_url"] == "https://cdn.example.com"


def test_put_sentinel_preserves_secret_and_masks(monkeypatch):
    mod, client, store = _load(monkeypatch, SETTINGS, dict(ADMIN))
    masked = client.get("/api/admin/cdn").json()
    assert masked["cloudinaryApiSecret"] != "real-secret"
    assert "real-secret" not in masked.values()
    r = client.put("/api/admin/cdn", json={"cdn_url": "https://cdn2.example.com",
                              "cloudinaryApiSecret": masked["cloudinaryApiSecret"]})
    assert r.status_code == 200, r.text
    assert store["settings"]["cloudinaryApiSecret"] == "real-secret"
    assert store["settings"]["cdn_url"] == "https://cdn2.example.com"
    assert r.json()["cloudinaryApiSecret"] == masked["cloudinaryApiSecret"]


def test_put_rotates_secret(monkeypatch):
    _, client, store = _load(monkeypatch, SETTINGS, dict(ADMIN))
    r = client.put("/api/admin/cdn", json={"cloudinaryApiSecret": "brand-new"})
    assert r.status_code == 200, r.text
    assert store["settings"]["cloudinaryApiSecret"] == "brand-new"


def test_get_masked_for_staff(monkeypatch):
    _, client, _ = _load(monkeypatch, SETTINGS, dict(MOD))
    r = client.get("/api/admin/cdn")
    assert r.status_code == 200, r.text
    assert r.json()["cloudinaryApiSecret"] != "real-secret"
