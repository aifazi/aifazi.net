"""Round-9 fixes regression tests (AUDIT §21).

Covers the security batch shipped on `fix/round-9-batch`:
  R9-1 — partial-2FA token rejected by steam connect routes
  R9-2 — refresh token rejected by the shared identity bearer helper
  R9-4 — OAuth authorization code consumed atomically (single-use)
  R9-8 — authentik_id is in the admin generic-browser FORBIDDEN_FIELDS
  R9-10 — LDAP /oauth/userinfo only emits `email` when scope grants it
"""
from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ── Small stubs (same shape as tests/test_oauth_link_tokens.py) ───────────────

class _Res:
    def __init__(self, data=None):
        self.data = data or []


class _Q:
    def select(self, *a, **k):
        return self

    def insert(self, *a, **k):
        return self

    def update(self, *a, **k):
        return self

    def delete(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        return _Res()


def _db_stub():
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(table=lambda name: _Q())
    db._escape_ilike = lambda v: v
    db.safe_search_term = lambda v: v
    db.safe_or_in = lambda v: v
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _deps_stub():
    deps = types.ModuleType("dependencies")

    class _HTTPBearer:
        def __init__(self, auto_error=True):
            pass

        async def __call__(self):
            return None

    def _user():
        return {"id": "u-test", "username": "test", "role": "admin"}

    deps.CookieHTTPBearer = _HTTPBearer
    deps.bearer = _HTTPBearer()
    deps.get_current_user = _user
    deps.require_admin = _user
    deps.require_staff = _user
    deps._enrich_user = lambda user: user
    deps.decode_token = lambda token: None
    return deps


def _load_router(name: str):
    spec = importlib.util.spec_from_file_location(
        f"{name}_r9", os.path.join(BACKEND_DIR, "routers", f"{name}.py"))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def steam_module(monkeypatch):
    monkeypatch.setitem(sys.modules, "database", _db_stub())
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    return _load_router("steam_auth")


@pytest.fixture()
def shared_module(monkeypatch):
    monkeypatch.setitem(sys.modules, "database", _db_stub())
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    return _load_router("auth_shared")


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _mint(payload: dict, minutes: int = 60) -> str:
    from paseto_token import create_token
    return create_token(payload, expires_in=minutes * 60, purpose="auth")


# ── R9-1: partial-2FA token is not a valid connect bearer ────────────────────

def test_r91_steam_rejects_partial_2fa_token(steam_module):
    token = _mint({"id": "u1", "username": "u", "role": "user",
                   "tfa_pending": True, "token_type": "access"}, minutes=5)
    assert steam_module._get_forum_user(_creds(token)) is None


def test_r91_steam_rejects_refresh_token(steam_module):
    token = _mint({"id": "u1", "username": "u", "role": "user", "token_type": "refresh"})
    assert steam_module._get_forum_user(_creds(token)) is None


def test_r91_steam_accepts_access_token(steam_module):
    token = _mint({"id": "u1", "username": "u", "role": "user", "token_type": "access"})
    payload = steam_module._get_forum_user(_creds(token))
    assert payload is not None and payload["id"] == "u1"


# ── R9-2: shared bearer helper rejects partial-2FA and refresh tokens ────────

def test_r92_shared_rejects_partial_2fa_token(shared_module):
    token = _mint({"id": "u1", "username": "u", "role": "user",
                   "tfa_pending": True, "token_type": "access"}, minutes=5)
    assert shared_module._get_forum_user(_creds(token)) is None


def test_r92_shared_rejects_refresh_token(shared_module):
    token = _mint({"id": "u1", "username": "u", "role": "user", "token_type": "refresh"})
    assert shared_module._get_forum_user(_creds(token)) is None


def test_r92_shared_accepts_access_token(shared_module):
    token = _mint({"id": "u1", "username": "u", "role": "user", "token_type": "access"})
    payload = shared_module._get_forum_user(_creds(token))
    assert payload is not None and payload["id"] == "u1"


# ── R9-4: OAuth code consumed atomically ─────────────────────────────────────

class _FakeRedis:
    """Minimal Redis double tracking which primitive was used."""

    def __init__(self, with_getdel=True):
        self.store: dict = {}
        self.calls: list = []
        self._with_getdel = with_getdel

    def setex(self, key, ttl, value):
        self.store[key] = value

    def get(self, key):
        self.calls.append(("get", key))
        return self.store.get(key)

    def delete(self, key):
        self.calls.append(("delete", key))
        self.store.pop(key, None)

    def getdel(self, key):
        self.calls.append(("getdel", key))
        return self.store.pop(key, None)

    def eval(self, script, numkeys, key):
        self.calls.append(("eval", key))
        return self.store.pop(key, None)


class _FakeRedisNoGetdel:
    """Redis double without GETDEL (older server) — exercises the Lua path."""

    def __init__(self):
        self.store: dict = {}
        self.calls: list = []

    def setex(self, key, ttl, value):
        self.store[key] = value

    def get(self, key):
        self.calls.append(("get", key))
        return self.store.get(key)

    def delete(self, key):
        self.calls.append(("delete", key))
        self.store.pop(key, None)

    def eval(self, script, numkeys, key):
        self.calls.append(("eval", key))
        return self.store.pop(key, None)


class _FakeRedisGetdelBroken(_FakeRedisNoGetdel):
    """Redis double whose GETDEL method exists but the server rejects it."""

    def getdel(self, key):
        self.calls.append(("getdel", key))
        raise RuntimeError("ERR unknown command 'GETDEL'")


def test_r94_code_is_single_use(monkeypatch):
    from utils import oauth_store

    fake = _FakeRedis()
    monkeypatch.setattr(oauth_store, "_redis", lambda: fake)
    oauth_store.put_auth_code("abc", {"user_id": "u1"}, ttl=120)
    assert oauth_store.pop_auth_code("abc") == {"user_id": "u1"}
    assert oauth_store.pop_auth_code("abc") is None


def test_r94_uses_atomic_getdel_when_available(monkeypatch):
    from utils import oauth_store

    fake = _FakeRedis(with_getdel=True)
    monkeypatch.setattr(oauth_store, "_redis", lambda: fake)
    oauth_store.put_auth_code("abc", {"user_id": "u1"}, ttl=120)
    oauth_store.pop_auth_code("abc")
    assert ("getdel", "oauth:code:abc") in fake.calls
    assert ("get", "oauth:code:abc") not in fake.calls


def test_r94_falls_back_to_lua_when_getdel_missing(monkeypatch):
    from utils import oauth_store

    fake = _FakeRedisNoGetdel()
    monkeypatch.setattr(oauth_store, "_redis", lambda: fake)
    oauth_store.put_auth_code("abc", {"user_id": "u1"}, ttl=120)
    assert oauth_store.pop_auth_code("abc") == {"user_id": "u1"}
    assert ("eval", "oauth:code:abc") in fake.calls
    assert oauth_store.pop_auth_code("abc") is None


def test_r94_falls_back_to_lua_when_getdel_unsupported(monkeypatch):
    from utils import oauth_store

    fake = _FakeRedisGetdelBroken()
    monkeypatch.setattr(oauth_store, "_redis", lambda: fake)
    oauth_store.put_auth_code("abc", {"user_id": "u1"}, ttl=120)
    assert oauth_store.pop_auth_code("abc") == {"user_id": "u1"}
    assert ("getdel", "oauth:code:abc") in fake.calls
    assert ("eval", "oauth:code:abc") in fake.calls
    assert oauth_store.pop_auth_code("abc") is None


# ── R9-8: authentik_id blocked in the generic collection browser ─────────────

def test_r98_authentik_id_is_forbidden(monkeypatch):
    monkeypatch.setitem(sys.modules, "database", _db_stub())
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    ak = types.ModuleType("routers.authentik_oidc")
    ak._ak = dict
    monkeypatch.setitem(sys.modules, "routers.authentik_oidc", ak)
    rl = types.ModuleType("utils.rate_limit")
    rl.invalidate_ip_bans_cache = lambda: None
    monkeypatch.setitem(sys.modules, "utils.rate_limit", rl)
    mod = _load_router("admin_actions")
    assert "authentik_id" in mod.FORBIDDEN_FIELDS


# ── R9-10: userinfo email claim is scope-gated ───────────────────────────────

def _userinfo_client(monkeypatch, rec):
    monkeypatch.setitem(sys.modules, "database", _db_stub())
    routers_pkg = types.ModuleType("routers")
    routers_pkg.__path__ = []
    monkeypatch.setitem(sys.modules, "routers", routers_pkg)
    shared = types.ModuleType("routers.auth_shared")
    for attr in ("_audit", "_auth_log", "_find_user_by_ci", "_record_user_activity",
                 "_upsert_forum_session"):
        setattr(shared, attr, lambda *a, **k: None)
    monkeypatch.setitem(sys.modules, "routers.auth_shared", shared)

    ldap = types.ModuleType("utils.ldap_client")

    class _E(Exception):
        pass

    ldap.LdapAuthFailed = _E
    ldap.LdapUnavailable = _E
    ldap.LdapUser = type("LdapUser", (), {})
    ldap.bind_user = lambda u, p: None
    ldap.healthcheck = lambda: True
    monkeypatch.setitem(sys.modules, "utils.ldap_client", ldap)

    store = types.ModuleType("utils.oauth_store")
    store.get_access_token = lambda tok: rec
    store.pop_auth_code = lambda code: None
    store.put_access_token = lambda *a, **k: None
    store.put_auth_code = lambda *a, **k: None
    store.revoke_access_token = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "utils.oauth_store", store)

    admin = types.ModuleType("routers.oauth_admin")
    admin.get_oauth_config = lambda: {"enabled": True, "clients": {}}
    monkeypatch.setitem(sys.modules, "routers.oauth_admin", admin)

    mod = _load_router("ldap_oauth")
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app, raise_server_exceptions=False)


def test_r910_userinfo_omits_email_without_scope(monkeypatch):
    rec = {"user_id": "u1", "username": "bob", "email": "bob@x.test",
           "scope": "openid profile"}
    client = _userinfo_client(monkeypatch, rec)
    r = client.get("/oauth/userinfo", headers={"Authorization": "Bearer tok"})
    assert r.status_code == 200, r.text
    assert "email" not in r.json()


def test_r910_userinfo_includes_email_with_scope(monkeypatch):
    rec = {"user_id": "u1", "username": "bob", "email": "bob@x.test",
           "scope": "openid email profile"}
    client = _userinfo_client(monkeypatch, rec)
    r = client.get("/oauth/userinfo", headers={"Authorization": "Bearer tok"})
    assert r.status_code == 200, r.text
    assert r.json().get("email") == "bob@x.test"
    assert r.json().get("email_verified") is True
