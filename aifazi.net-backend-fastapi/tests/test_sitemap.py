"""Tests for routers/sitemap.py (published-only URL sets)."""
import importlib.util
import os
import sys
import types
import xml.etree.ElementTree as ET

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class _Query:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._op = None

    def select(self, *args):
        self._op = "select"
        return self

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def limit(self, n):
        return self

    def execute(self):
        rows = self._store.setdefault(self._table, [])
        if self._op == "select":
            out = [
                dict(r) for r in rows
                if all(r.get(k) == v for k, v in self._filters)
            ]
            return types.SimpleNamespace(data=out)
        raise AssertionError("unknown op")


class _FakeSupabase:
    def __init__(self, store):
        self._store = store

    def table(self, name):
        return _Query(self._store, name)


def _client(monkeypatch, store):  # type: ignore[no-untyped-def]
    db_stub = types.ModuleType("database")
    db_stub.supabase = _FakeSupabase(store)
    monkeypatch.setitem(sys.modules, "database", db_stub)
    spec = importlib.util.spec_from_file_location(
        "sitemap_under_test", os.path.join(BACKEND_DIR, "routers", "sitemap.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app)


def test_sitemap_is_valid_xml_with_published_layouts(monkeypatch):  # type: ignore[no-untyped-def]
    client = _client(monkeypatch, {
        "posts": [],
        "forum_threads": [],
        "infra_diagrams": [],
        "page_layouts": [
            {"slug": "landing", "updated_at": "2026-09-30T10:00:00+00:00", "published": True},
            {"slug": "secret-draft", "updated_at": "2026-09-30T10:00:00+00:00", "published": False},
        ],
    })
    r = client.get("/sitemap.xml")
    assert r.status_code == 200
    ET.fromstring(r.text)  # parses ⇒ well-formed
    assert "/p/landing" in r.text
    assert "/p/secret-draft" not in r.text


def test_sitemap_escapes_layout_slugs(monkeypatch):  # type: ignore[no-untyped-def]
    client = _client(monkeypatch, {
        "posts": [],
        "forum_threads": [],
        "infra_diagrams": [],
        "page_layouts": [
            {"slug": "a&b", "updated_at": "2026-09-30T10:00:00+00:00", "published": True},
        ],
    })
    r = client.get("/sitemap.xml")
    assert r.status_code == 200
    ET.fromstring(r.text)  # '&' must be escaped as &amp; to parse
    assert "a&amp;b" in r.text


def test_sitemap_survives_missing_layout_table(monkeypatch):  # type: ignore[no-untyped-def]
    class _Broken(_FakeSupabase):
        def table(self, name):
            if name == "page_layouts":
                raise RuntimeError("missing relation")
            return super().table(name)

    db_stub = types.ModuleType("database")
    db_stub.supabase = _Broken({})
    monkeypatch.setitem(sys.modules, "database", db_stub)
    spec = importlib.util.spec_from_file_location(
        "sitemap_broken_under_test", os.path.join(BACKEND_DIR, "routers", "sitemap.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router)
    r = TestClient(app).get("/sitemap.xml")
    assert r.status_code == 200
    ET.fromstring(r.text)
