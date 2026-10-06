"""H2/C6 Ã¢â‚¬â€ one-time exchange codes for mobile OAuth deep links.

Covers:
- utils.mobile_oauth_codes: issueÃ¢â€ â€™exchange round-trip, single-use
  enforcement, unknown / wrong-purpose / garbage / expired codes rejected,
  fragment builder shape (code + state echo, never a token).
- POST /api/auth/mobile/exchange: success (token + refreshToken + dest),
  already-used code rejected, invalid code rejected, short code rejected.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import time
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _load(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, os.path.join(BACKEND_DIR, path))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Ã¢â€â‚¬Ã¢â€â‚¬ In-memory Supabase stand-in (mobile_oauth_claims + users) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
class _Resp:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, db, name):
        self._db = db
        self._name = name
        self._filters: dict = {}
        self._insert = None
        self._update = None

    def insert(self, row):
        self._insert = dict(row)
        return self

    def update(self, row):
        self._update = dict(row)
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def is_(self, col, val):
        assert val == "null"
        self._filters[col] = "__null__"
        return self

    def select(self, *cols):
        return self

    def execute(self):
        if self._insert is not None:
            if self._name == "mobile_oauth_claims":
                h = self._insert["code_hash"]
                if h in self._db.claims:
                    raise RuntimeError("duplicate claim")
                row = dict(self._insert)
                row["consumed_at"] = None
                self._db.claims[h] = row
                return _Resp([row])
            return _Resp([dict(self._insert)])
        if self._update is not None:
            if self._name == "mobile_oauth_claims":
                out = []
                for row in self._db.claims.values():
                    if row.get("consumed_at") is not None:
                        continue
                    ok = True
                    for k, v in self._filters.items():
                        if v == "__null__":
                            ok = ok and row.get(k) is None
                        else:
                            ok = ok and row.get(k) == v
                    if ok:
                        row.update(self._update)
                        out.append(row)
                return _Resp(out)
            self._db.user_updates.append((self._name, dict(self._update), dict(self._filters)))
            return _Resp([{**self._update}])
        if self._name == "users":
            rows = list(self._db.users.values())
            for k, v in self._filters.items():
                if v == "__null__":
                    rows = [r for r in rows if r.get(k) is None]
                else:
                    rows = [r for r in rows if r.get(k) == v]
            return _Resp(rows)
        return _Resp([])


class _ClaimsDB:
    def __init__(self):
        self.claims: dict = {}
        self.users: dict = {}
        self.user_updates: list = []

    def table(self, name):
        return _Table(self, name)


def _db_stub(db: _ClaimsDB):
    stub = types.ModuleType("database")
    stub.supabase = db
    stub._escape_ilike = lambda v: v
    return stub


_load_counter = 0


@pytest.fixture()
def codes(monkeypatch):
    """Fresh utils.mobile_oauth_codes bound to a fresh in-memory claims store."""
    global _load_counter
    _load_counter += 1
    db = _ClaimsDB()
    monkeypatch.setitem(sys.modules, "database", _db_stub(db))
    mod = _load(f"mobile_oauth_codes_under_test{_load_counter}", os.path.join("utils", "mobile_oauth_codes.py"))
    return mod, db


# Ã¢â€â‚¬Ã¢â€â‚¬ utils.mobile_oauth_codes Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
class TestIssueExchange:
    def test_roundtrip(self, codes):
        mod, db = codes
        code = mod.issue_code("github", "u1", "alice", "user", "/forum/profile")
        payload = mod.exchange_code(code)
        assert payload is not None
        assert payload["user_id"] == "u1"
        assert payload["provider"] == "github"
        assert payload["dest"] == "/forum/profile"
        assert payload["kind"] == "forum"
        assert payload["token_type"] == mod.CODE_TOKEN_TYPE

    def test_single_use(self, codes):
        mod, _ = codes
        code = mod.issue_code("steam", "u2", "bob", "user", "/profile")
        assert mod.exchange_code(code) is not None
        assert mod.exchange_code(code) is None  # second use rejected

    def test_unknown_code_rejected(self, codes, monkeypatch):
        mod, db = codes
        # Valid PASETO with the right purpose but no claim row ever issued.
        from paseto_token import create_token
        rogue = create_token(
            {"purpose": "mobile_oauth_code", "user_id": "ux"},
            expires_in=300, purpose="auth",
        )
        assert mod.exchange_code(rogue) is None
        assert db.claims == {}

    def test_wrong_purpose_rejected(self, codes):
        mod, _ = codes
        from paseto_token import create_token
        token = create_token({"id": "u1", "username": "a", "role": "user"},
                              expires_in=300, purpose="auth")
        assert mod.exchange_code(token) is None

    def test_garbage_rejected(self, codes):
        mod, _ = codes
        assert mod.exchange_code(None) is None
        assert mod.exchange_code("") is None
        assert mod.exchange_code("not-a-token") is None
        assert mod.exchange_code("v" * 5000) is None

    def test_expired_code_rejected(self, codes, monkeypatch):
        mod, _ = codes
        code = mod.issue_code("github", "u3", "carol", "user", "/profile")
        import paseto_token
        monkeypatch.setattr(
            paseto_token, "time",
            types.SimpleNamespace(time=lambda: time.time() + 3600),
        )
        assert mod.exchange_code(code) is None


class TestFragmentShape:
    def test_fragment_carries_code_dest_state_never_token(self, codes):
        mod, _ = codes
        frag = mod.mobile_fragment("ABC.token123", "/forum/profile", "xyz")
        assert frag.startswith("#code=ABC.token123")
        assert "dest=/forum/profile" in frag
        assert frag.endswith("&state=xyz")
        assert "token=" not in frag

    def test_fragment_without_state(self, codes):
        mod, _ = codes
        frag = mod.mobile_fragment("C1", "/profile")
        assert frag == "#code=C1&dest=/profile"

    def test_state_echo(self, codes):
        mod, _ = codes
        assert mod.state_echo({"state": "abc"}) == "&state=abc"
        assert mod.state_echo({"state": ""}) == ""
        assert mod.state_echo({}) == ""
        assert mod.state_echo(None) == ""


# Ã¢â€â‚¬Ã¢â€â‚¬ POST /api/auth/mobile/exchange Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
class TestExchangeEndpoint:
    @pytest.fixture()
    def client(self, monkeypatch):
        db = _ClaimsDB()
        monkeypatch.setitem(sys.modules, "database", _db_stub(db))

        # Load the real utils module under its canonical name so the router's
        # `from utils.mobile_oauth_codes import exchange_code` binds to this
        # object (and therefore to this test's in-memory claims store).
        spec = importlib.util.spec_from_file_location(
            "utils.mobile_oauth_codes",
            os.path.join(BACKEND_DIR, "utils", "mobile_oauth_codes.py"),
        )
        assert spec is not None and spec.loader is not None
        codes_mod = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, "utils.mobile_oauth_codes", codes_mod)
        spec.loader.exec_module(codes_mod)

        router_mod = _load("mobile_oauth_under_test", os.path.join("routers", "mobile_oauth.py"))
        app = FastAPI()
        app.include_router(router_mod.router)
        return TestClient(app, raise_server_exceptions=False), db, codes_mod

    def test_exchange_success_and_single_use(self, client):
        c, db, codes_mod = client
        db.users["u9"] = {"id": "u9", "username": "dave", "role": "user", "banned": False}
        code = codes_mod.issue_code("github", "u9", "dave", "user", "/forum/profile")
        r = c.post("/mobile/exchange", json={"code": code})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token"] and body["refreshToken"]
        assert body["dest"] == "/forum/profile"
        assert len(db.user_updates) == 1  # users.refresh_token rotated

        r2 = c.post("/mobile/exchange", json={"code": code})
        assert r2.status_code == 400  # already consumed

    def test_exchange_invalid_code(self, client):
        c, _, _ = client
        r = c.post("/mobile/exchange", json={"code": "v4.local.abcdef"})
        assert r.status_code == 400
        assert "token" not in r.text

    def test_exchange_code_too_short(self, client):
        c, _, _ = client
        r = c.post("/mobile/exchange", json={"code": "abc"})
        assert r.status_code == 422  # pydantic min_length


class TestAppStateBinding:
    """H2 follow-up: codes bind the app's one-time OAuth state when the
    issuer provides it; exchange then requires the same state."""

    @pytest.fixture()
    def bound_client(self, monkeypatch):
        db = _ClaimsDB()
        monkeypatch.setitem(sys.modules, "database", _db_stub(db))

        spec = importlib.util.spec_from_file_location(
            "utils.mobile_oauth_codes_bound",
            os.path.join(BACKEND_DIR, "utils", "mobile_oauth_codes.py"),
        )
        assert spec is not None and spec.loader is not None
        codes_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(codes_mod)
        # Canonical name too: the router does `from utils.mobile_oauth_codes
        # import exchange_code`, which would otherwise reuse a stale cached
        # instance bound to another test's store.
        monkeypatch.setitem(sys.modules, "utils.mobile_oauth_codes", codes_mod)

        router_mod = _load("mobile_oauth_bound_under_test", os.path.join("routers", "mobile_oauth.py"))
        app = FastAPI()
        app.include_router(router_mod.router)
        return TestClient(app, raise_server_exceptions=False), db, codes_mod

    def test_bound_code_exchanges_with_state(self, bound_client):
        c, db, codes_mod = bound_client
        db.users["u10"] = {"id": "u10", "username": "erin", "role": "user", "banned": False}
        code = codes_mod.issue_code(
            "github", "u10", "erin", "user", "/profile", app_state="s3cr3t-state")
        r = c.post("/mobile/exchange", json={"code": code, "state": "s3cr3t-state"})
        assert r.status_code == 200, r.text
        assert r.json()["token"]

    def test_bound_code_rejects_wrong_state(self, bound_client):
        c, _, codes_mod = bound_client
        code = codes_mod.issue_code(
            "github", "u11", "fred", "user", "/profile", app_state="right")
        r = c.post("/mobile/exchange", json={"code": code, "state": "wrong"})
        assert r.status_code == 400

    def test_bound_code_rejects_missing_state(self, bound_client):
        c, _, codes_mod = bound_client
        code = codes_mod.issue_code(
            "github", "u12", "gina", "user", "/profile", app_state="right")
        r = c.post("/mobile/exchange", json={"code": code})
        assert r.status_code == 400

    def test_unbound_legacy_code_still_exchanges(self, bound_client):
        c, db, codes_mod = bound_client
        db.users["u13"] = {"id": "u13", "username": "hal", "role": "user", "banned": False}
        code = codes_mod.issue_code("github", "u13", "hal", "user", "/profile")
        r = c.post("/mobile/exchange", json={"code": code})
        assert r.status_code == 200, r.text
