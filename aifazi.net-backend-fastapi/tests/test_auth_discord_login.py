"""Site Discord login start: redirect_uri must never be empty.

Regression test: DISCORD_REDIRECT_URI had no default, so with the env unset
(as on prod) the authorize URL carried `redirect_uri=` empty and Discord
rejected the login before any callback. Now it falls back to the registered
conventional callback; an explicit env value still wins.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import types
import urllib.parse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-only")


def _db_stub():
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(table=lambda name: None)
    return db


def _deps_stub():
    deps = types.ModuleType("dependencies")
    deps.get_current_user = lambda: {"id": "u-1", "username": "u", "role": "user"}
    deps.require_admin = lambda: {"id": "a-1", "username": "root", "role": "admin"}
    return deps


def _load(monkeypatch):
    for key in ("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
                "DISCORD_BOT_TOKEN", "DISCORD_WHITELIST_GUILD_ID",
                "DISCORD_WHITELIST_ROLE_ID"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setitem(sys.modules, "database", _db_stub())
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    spec = importlib.util.spec_from_file_location(
        "auth_discord_under_test",
        os.path.join(BACKEND_DIR, "routers", "auth_discord.py"),
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router, prefix="/api/auth")
    return module, TestClient(app, raise_server_exceptions=False)


def _redirect_uri_of(location: str) -> str:
    return urllib.parse.parse_qs(urllib.parse.urlparse(location).query).get("redirect_uri", [""])[0]


def test_login_redirect_uses_default_callback_when_env_unset(monkeypatch):
    monkeypatch.delenv("DISCORD_REDIRECT_URI", raising=False)
    monkeypatch.delenv("API_URL", raising=False)
    _, client = _load(monkeypatch)
    r = client.get("/api/auth/discord/login?dest=/profile", follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    target = _redirect_uri_of(r.headers["location"])
    assert target == "https://api.aifazi.net/api/auth/discord/callback", target


def test_login_redirect_prefers_explicit_env(monkeypatch):
    monkeypatch.setenv("DISCORD_REDIRECT_URI", "https://example.com/discord/cb")
    _, client = _load(monkeypatch)
    r = client.get("/api/auth/discord/login?dest=/profile", follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    assert _redirect_uri_of(r.headers["location"]) == "https://example.com/discord/cb"


def test_login_rejects_unsafe_dest(monkeypatch):
    monkeypatch.delenv("DISCORD_REDIRECT_URI", raising=False)
    _, client = _load(monkeypatch)
    r = client.get("/api/auth/discord/login?dest=https://evil.example/",
                   follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    assert "evil.example" not in r.headers["location"]
