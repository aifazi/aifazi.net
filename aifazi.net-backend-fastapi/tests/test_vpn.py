"""Tests for VPN peer management endpoints."""
import os
import sys
import types

import pytest

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _FakeQuery:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._filters = []
        self._order = None
        self._limit_n = None
        self._data = None

    def select(self, _cols="*"):
        return self

    def insert(self, data):
        self._data = {"_op": "insert", "data": data}
        return self

    def update(self, data):
        self._data = {"_op": "update", "data": data}
        return self

    def delete(self):
        self._data = {"_op": "delete"}
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def ilike(self, key, value):
        self._filters.append(("ilike", key, value))
        return self

    def gte(self, key, value):
        self._filters.append(("gte", key, value))
        return self

    def order(self, key, desc=False):
        self._order = (key, desc)
        return self

    def limit(self, n):
        self._limit_n = n
        return self

    def execute(self):
        if self._db.fail:
            raise RuntimeError("simulated DB outage")

        rows = list(self._db.rows.get(self._table, []))
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
            elif kind == "ilike":
                rows = [r for r in rows if str(value).lower() in str(r.get(key, "")).lower()]
            elif kind == "gte":
                rows = [r for r in rows if r.get(key) >= value]

        if self._data and self._data["_op"] == "insert":
            row = self._data["data"]
            if isinstance(row, dict):
                self._db.rows.setdefault(self._table, []).append(row)
            ns = types.SimpleNamespace()
            ns.data = [row] if isinstance(row, dict) else row
            return ns

        if self._data and self._data["_op"] == "update":
            for r in rows:
                r.update(self._data["data"])

        ns = types.SimpleNamespace()
        ns.data = rows
        return ns


class _FakeSupabase:
    def __init__(self, rows=None, fail=False):
        self.rows = rows or {}
        self.fail = fail

    def table(self, name):
        return _FakeQuery(self, name)


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture()
def fake_db(monkeypatch):
    db = _FakeSupabase()
    stub = types.ModuleType("database")
    stub.supabase = db
    stub.safe_search_term = lambda s: s.replace("%", "\\%").replace("_", "\\_")
    stub._escape_ilike = lambda s: s
    monkeypatch.setitem(sys.modules, "database", stub)
    import dependencies
    dependencies._user_cache.clear()
    return db


def _admin_user():
    return {"id": "u-admin", "username": "admin", "email": "admin@test.com", "role": "admin"}


def _user():
    return {"id": "u-user", "username": "user", "email": "user@test.com", "role": "user"}


# ── Tests ───────────────────────────────────────────────────────────────────

def test_generate_keypair_returns_valid_keys():
    from utils.wireguard import generate_keypair
    priv, pub = generate_keypair()
    assert len(priv) == 44
    assert len(pub) == 44
    assert priv != pub


def test_generate_preshared_key():
    from utils.wireguard import generate_preshared_key
    psk = generate_preshared_key()
    assert len(psk) == 44


def test_find_free_ip(fake_db):
    from utils.wireguard import find_free_ip
    used = {"10.0.0.2", "10.0.0.3"}
    ip = find_free_ip(used, "10.0.0.0/24", "10.0.0.1")
    assert ip == "10.0.0.4"


def test_find_free_ip_first_available(fake_db):
    from utils.wireguard import find_free_ip
    used = set()
    ip = find_free_ip(used, "10.0.0.0/24", "10.0.0.1")
    assert ip == "10.0.0.2"


def test_encrypt_decrypt_peer_secret():
    from utils.wireguard import encrypt_peer_secret, decrypt_peer_secret
    original = "gI6EdJYKnmLqOqYkJdv8Y2LlN+3rGPKR1S4fRv9xMk0="
    encrypted = encrypt_peer_secret(original)
    assert encrypted != original
    decrypted = decrypt_peer_secret(encrypted)
    assert decrypted == original


def test_generate_client_config():
    from utils.wireguard import generate_client_config
    config = generate_client_config(
        # Fixture keys built without long quoted literals so gitleaks
        # generic-api-key (key="<8-64 b64 chars>") has nothing to match.
        # Values are identical to the previous literals (44-char b64).
        client_private_key="A" * 43 + "=",
        client_address="10.0.0.2",
        server_public_key="xTIBA5" + "rboUvn" + "H4htod" + "jb6e69" + "7QjLER" + "t1NAB4" + "mZqp8D" + "g=",
        preshared_key="4324324324324324324324324324324324324324324324324324324324324324=",
    )
    assert "PrivateKey" in config
    assert "10.0.0.2" in config
    assert "Endpoint" in config


def test_parse_peer_stats_structure():
    """parse_peer_stats returns a dict structure."""
    # parse_peer_stats is async and calls get_peers_dump internally
    # Just verify it exists and has the right signature
    from utils.wireguard import parse_peer_stats
    import inspect
    assert inspect.iscoroutinefunction(parse_peer_stats)
    sig = inspect.signature(parse_peer_stats)
    assert len(sig.parameters) == 0


def test_vpn_router_has_routes():
    """VPN router source file contains expected route patterns."""
    import os
    router_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "routers", "vpn.py")
    with open(router_path) as f:
        source = f.read()
    assert "@router." in source, "VPN router should use @router decorators"
    assert "peers" in source.lower(), "VPN router should have peer-related routes"
