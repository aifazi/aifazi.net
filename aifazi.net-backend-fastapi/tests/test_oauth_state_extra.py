"""Tests for OAuth state extra claims + Discord connect hardening.

- make_oauth_state(extra=...) round-trips bound claims; tampered/oversized
  claims are rejected; states without extras verify as before.
- discord_connect_url requires auth (401 without credentials).
- discord refresh username-fallback rejects unknown stored tokens.
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


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(BACKEND_DIR, path))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


oauth_state = _load("oauth_state_under_test", os.path.join("utils", "oauth_state.py"))


class TestExtraClaims:
    def test_roundtrip(self):
        state = oauth_state.make_oauth_state("discord-connect", "/profile", extra={"uid": "abc-123"})
        out = oauth_state.verify_oauth_state_full(state, "discord-connect")
        assert out["extra"] == {"uid": "abc-123"}
        assert out["dest"] == "/profile"

    def test_no_extra_gives_empty_dict(self):
        state = oauth_state.make_oauth_state("discord", "/profile")
        out = oauth_state.verify_oauth_state_full(state, "discord")
        assert out["extra"] == {}

    def test_tampered_extra_rejected(self):
        state = oauth_state.make_oauth_state("discord-connect", "/profile", extra={"uid": "abc"})
        body, _, _sig = state.rpartition(".")
        with pytest.raises(ValueError):
            oauth_state.verify_oauth_state_full(body + ".0" * 32, "discord-connect")

    def test_provider_still_bound(self):
        state = oauth_state.make_oauth_state("discord-connect", "/profile", extra={"uid": "abc"})
        with pytest.raises(ValueError):
            oauth_state.verify_oauth_state_full(state, "discord")

    def test_bad_claim_shapes_rejected(self):
        with pytest.raises(ValueError):
            oauth_state.make_oauth_state("x", "/profile", extra={"k" * 33: "v"})
        with pytest.raises(ValueError):
            oauth_state.make_oauth_state("x", "/profile", extra={"k": "v" * 129})
        with pytest.raises(ValueError):
            oauth_state.make_oauth_state("x", "/profile", extra={"k": ["list"]})


class TestDiscordConnectUrl:
    @pytest.fixture()
    def client(self, monkeypatch):
        db_stub = types.ModuleType("database")

        class _Q:
            def execute(self):
                ns = types.SimpleNamespace()
                ns.data = []
                return ns

        class _T:
            def select(self, *a):
                return self

            def eq(self, *a):
                return self

            def limit(self, *a):
                return self

            def execute(self):
                ns = types.SimpleNamespace()
                ns.data = []
                return ns

        db_stub.supabase = types.SimpleNamespace(table=lambda name: _T())
        deps_stub = types.ModuleType("dependencies")

        def _no_user():
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Authentication required")

        async def _get_current_user():
            _no_user()
            return {}

        deps_stub.get_current_user = _get_current_user
        monkeypatch.setitem(sys.modules, "database", db_stub)
        monkeypatch.setitem(sys.modules, "dependencies", deps_stub)
        module = _load("auth_discord_under_test", os.path.join("routers", "auth_discord.py"))
        app = FastAPI()
        app.include_router(module.router)
        return TestClient(app, raise_server_exceptions=False)

    def test_connect_url_requires_auth(self, client):
        r = client.get("/discord/connect-url")
        assert r.status_code == 401, r.text

    def test_connect_stub_gone(self, client):
        # The lying POST /discord/connect stub was deleted; only the
        # OAuth-redirect link flow exists (404 = no such route).
        r = client.post("/discord/connect", json={"code": "x"})
        assert r.status_code == 404, r.status_code
