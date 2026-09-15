"""Fail-closed auth tests: token claims must never grant staff access without
a live directory read (dependencies._enrich_user, permissions.resolve_staff_access).
"""
import os
import sys
import types

import pytest
from fastapi import HTTPException

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _FakeQuery:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._filters = []

    def select(self, _cols):
        return self

    def eq(self, key, value):
        self._filters.append(("eq", key, value))
        return self

    def ilike(self, key, value):
        self._filters.append(("ilike", key, value))
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self._db.fail:
            raise RuntimeError("simulated directory outage")
        rows = list(self._db.rows.get(self._table, []))
        for kind, key, value in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(key) == value]
            else:
                rows = [r for r in rows if str(r.get(key, "")).lower() == str(value).lower()]
        ns = types.SimpleNamespace()
        ns.data = rows
        return ns


class _FakeSupabase:
    def __init__(self, rows=None, fail=False):
        self.rows = rows or {}
        self.fail = fail

    def table(self, name):
        return _FakeQuery(self, name)


@pytest.fixture()
def fake_db(monkeypatch):
    db = _FakeSupabase()
    stub = types.ModuleType("database")
    stub.supabase = db
    monkeypatch.setitem(sys.modules, "database", stub)
    import dependencies
    import permissions
    dependencies._user_cache.clear()
    permissions._admin_verify_cache.clear()
    return db


ADMIN_ROW = {
    "id": "u-admin", "username": "boss", "email": "boss@x.test",
    "role": "admin", "staff_permissions": None, "banned": False, "ban_reason": "",
}
MOD_ROW = {
    "id": "u-mod", "username": "mod", "email": "mod@x.test",
    "role": "moderator", "staff_permissions": None, "banned": False, "ban_reason": "",
}


def test_claimed_admin_verified_against_directory(fake_db):
    import permissions
    fake_db.rows = {"users": [ADMIN_ROW]}
    access = permissions.resolve_staff_access({"id": "u-admin", "role": "admin"})
    assert access and access["role"] == "admin" and access["admin_access"] is True


def test_claimed_admin_denied_when_directory_says_moderator(fake_db):
    import permissions
    fake_db.rows = {"users": [MOD_ROW]}
    assert permissions.resolve_staff_access({"id": "u-mod", "role": "admin"}) is None


def test_admin_directory_outage_is_503(fake_db):
    import permissions
    fake_db.fail = True
    with pytest.raises(HTTPException) as exc:
        permissions.resolve_staff_access({"id": "u-admin", "role": "admin"})
    assert exc.value.status_code == 503


def test_moderator_without_row_is_denied(fake_db):
    import permissions
    fake_db.rows = {"users": []}
    assert permissions.resolve_staff_access({"id": "u-x", "username": "ghost", "role": "moderator"}) is None


def test_moderator_directory_outage_is_503(fake_db):
    import permissions
    fake_db.fail = True
    with pytest.raises(HTTPException) as exc:
        permissions.resolve_staff_access({"id": "u-mod", "role": "moderator"})
    assert exc.value.status_code == 503


def test_banned_admin_rejected(fake_db):
    import permissions
    row = dict(ADMIN_ROW, banned=True)
    fake_db.rows = {"users": [row]}
    with pytest.raises(HTTPException) as exc:
        permissions.resolve_staff_access({"id": "u-admin", "role": "admin"})
    assert exc.value.status_code == 403


def test_banned_moderator_rejected(fake_db):
    import permissions
    row = dict(MOD_ROW, banned=True)
    fake_db.rows = {"users": [row]}
    with pytest.raises(HTTPException) as exc:
        permissions.resolve_staff_access({"id": "u-mod", "role": "moderator"})
    assert exc.value.status_code == 403


def test_enrich_directory_outage_no_cache_is_503(fake_db):
    import dependencies
    fake_db.fail = True
    with pytest.raises(HTTPException) as exc:
        dependencies._enrich_user({"id": "u-admin", "role": "admin"})
    assert exc.value.status_code == 503


def test_enrich_directory_outage_uses_cache(fake_db):
    import dependencies
    fake_db.rows = {"users": [MOD_ROW]}
    first = dependencies._enrich_user({"id": "u-mod", "role": "member"})
    assert first["role"] == "moderator"
    fake_db.fail = True
    second = dependencies._enrich_user({"id": "u-mod", "role": "member"})
    assert second["role"] == "moderator"


def test_enrich_banned_rejected(fake_db):
    import dependencies
    fake_db.rows = {"users": [dict(MOD_ROW, banned=True, ban_reason="spam")]}
    with pytest.raises(HTTPException) as exc:
        dependencies._enrich_user({"id": "u-mod", "role": "member"})
    assert exc.value.status_code == 403


def test_decode_valid_token():
    import dependencies
    from paseto_token import create_token
    token = create_token({"id": "u-1", "role": "member"})
    data = dependencies.decode_token(token)
    assert data["id"] == "u-1"


def test_decode_garbage_rejected():
    import dependencies
    with pytest.raises(HTTPException) as exc:
        dependencies.decode_token("not-a-token")
    assert exc.value.status_code == 401


def test_decode_refresh_token_rejected():
    import dependencies
    from paseto_token import create_token
    token = create_token({"id": "u-1", "token_type": "refresh"})
    with pytest.raises(HTTPException) as exc:
        dependencies.decode_token(token)
    assert exc.value.status_code == 401


def test_decode_admin_gate_token_rejected():
    import dependencies
    from paseto_token import create_token
    token = create_token({"id": "u-1"}, purpose="admin_gate")
    with pytest.raises(HTTPException) as exc:
        dependencies.decode_token(token)
    assert exc.value.status_code == 401


def test_decode_tfa_pending_rejected():
    import dependencies
    from paseto_token import create_token
    token = create_token({"id": "u-1", "tfa_pending": True})
    with pytest.raises(HTTPException) as exc:
        dependencies.decode_token(token)
    assert exc.value.status_code == 401


def test_decode_expired_token_rejected():
    import dependencies
    from paseto_token import create_token
    token = create_token({"id": "u-1"}, expires_in=-10)
    with pytest.raises(HTTPException) as exc:
        dependencies.decode_token(token)
    assert exc.value.status_code == 401
