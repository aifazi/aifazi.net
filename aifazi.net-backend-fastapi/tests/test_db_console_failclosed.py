"""Fail-closed tests for the DB console (routers/db_console.py).

Bypass payloads (WITH/CTE, EXPLAIN, comments, multi-statement semicolons,
pg_*/current_* probing, blocked tables) must be rejected with 403 and must
never reach the exec_sql RPC.
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


class _FakeRpc:
    def __init__(self, calls: list, sql: str):
        self._calls = calls
        self._sql = sql

    def execute(self):  # type: ignore[no-untyped-def]
        self._calls.append(self._sql)
        ns = types.SimpleNamespace()
        ns.data = [{"ok": 1}]
        return ns


class _FakeTableQuery:
    def insert(self, _row: dict):  # type: ignore[no-untyped-def]
        return self

    def execute(self):  # type: ignore[no-untyped-def]
        ns = types.SimpleNamespace()
        ns.data = []
        return ns


class _FakeSupabase:
    def __init__(self) -> None:
        self.rpc_calls: list[str] = []

    def rpc(self, _name: str, params: dict):  # type: ignore[no-untyped-def]
        return _FakeRpc(self.rpc_calls, str(params.get("sql_text", "")))

    def table(self, _name: str):  # type: ignore[no-untyped-def]
        return _FakeTableQuery()


async def _fake_require_admin() -> dict:
    return {"username": "tester", "role": "admin"}


async def _fake_require_staff() -> dict:
    return {"username": "tester", "role": "staff"}


def _load_db_console():  # type: ignore[no-untyped-def]
    # Load routers/db_console.py directly from its file path so importing it
    # does not execute routers/__init__.py (which pulls in every router).
    spec = importlib.util.spec_from_file_location(
        "db_console_under_test", os.path.join(BACKEND_DIR, "routers", "db_console.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def console(monkeypatch):  # type: ignore[no-untyped-def]
    fake = _FakeSupabase()
    db_stub = types.ModuleType("database")
    db_stub.supabase = fake
    deps_stub = types.ModuleType("dependencies")
    deps_stub.require_admin = _fake_require_admin
    deps_stub.require_staff = _fake_require_staff
    monkeypatch.setitem(sys.modules, "database", db_stub)
    monkeypatch.setitem(sys.modules, "dependencies", deps_stub)
    module = _load_db_console()
    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app), fake, module


BYPASS_PAYLOADS = [
    "WITH x AS (SELECT 1 AS a) SELECT * FROM x",                     # CTE wrapper
    "with x as (select 1) select * from media",                      # lowercase WITH
    "EXPLAIN SELECT * FROM media",                                   # EXPLAIN
    "explain select * from media",                                   # lowercase EXPLAIN
    "SELECT * FROM media -- exfiltrate",                             # line comment
    "SELECT * FROM media /* hidden */",                              # block comment
    "SELECT * /* comment */ FROM media",                             # inline block comment
    "SELECT * FROM media; SELECT * FROM users",                      # multi-statement
    "SELECT * FROM media;",                                          # trailing semicolon
    "SELECT pg_sleep(5)",                                            # pg_ function
    "SELECT * FROM media WHERE true; -- SELECT pg_sleep(5)",         # comment + smuggle
    "SELECT current_user",                                           # current_* probing
    "SELECT current_database()",                                     # current_* probing
    "SELECT * FROM users",                                           # blocked table
    "select * from IP_BANS",                                         # blocked table, case-insensitive
    "UPDATE media SET filename='x'",                                 # DML
    "DELETE FROM media",                                             # DML
    "DROP TABLE media",                                              # DDL
]


@pytest.mark.parametrize("sql", BYPASS_PAYLOADS)
def test_bypass_payloads_rejected_with_403(console, sql):  # type: ignore[no-untyped-def]
    client, fake, _module = console
    resp = client.post("/sql", json={"sql": sql})
    assert resp.status_code == 403, f"payload was not blocked: {sql!r} -> {resp.status_code} {resp.text}"
    assert fake.rpc_calls == [], f"blocked payload reached exec_sql: {sql!r}"


def test_valid_select_reaches_rpc_with_capped_limit(console):  # type: ignore[no-untyped-def]
    client, fake, _module = console
    resp = client.post("/sql", json={"sql": "SELECT * FROM media"})
    assert resp.status_code == 200
    assert len(fake.rpc_calls) == 1
    assert "LIMIT 100" in fake.rpc_calls[0]


def test_oversized_limit_is_clamped(console):  # type: ignore[no-untyped-def]
    client, fake, _module = console
    resp = client.post("/sql", json={"sql": "SELECT * FROM media LIMIT 99999"})
    assert resp.status_code == 200
    assert "LIMIT 100" in fake.rpc_calls[0]
    assert "99999" not in fake.rpc_calls[0]


def test_comment_helpers(console):  # type: ignore[no-untyped-def]
    _client, _fake, module = console
    assert module._has_sql_comment("SELECT 1 -- x") is True
    assert module._has_sql_comment("SELECT /* x */ 1") is True
    assert module._has_sql_comment("SELECT * FROM media") is False
    assert module._blocked_prefix_func("SELECT pg_sleep(1)") is not None
    assert module._blocked_prefix_func("SELECT current_user") is not None
    assert module._blocked_prefix_func("SELECT * FROM media") is None
