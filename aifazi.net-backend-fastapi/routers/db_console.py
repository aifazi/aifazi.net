import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from dependencies import require_admin, require_staff

router = APIRouter()
log = logging.getLogger("db_console")

class SqlRequest(BaseModel):
    sql: str

# C8 — comprehensive dangerous-pattern list. The previous version only blocked
# `UPDATE staff_users / admin_2fa`, leaving `UPDATE users SET role='admin'` wide
# open to a moderator-or-above escalation. We now block every DML/DDL keyword,
# `;` (no multi-statement), `CALL ` / `DO $$`, `CREATE OR REPLACE FUNCTION`,
# `pg_read_file` / `pg_write_file` / `dblink` / `lo_import` / `pg_execute`, etc.
DANGEROUS_PATTERNS = [
    r';',
    r'\bDROP\s+',
    r'\bTRUNCATE\b',
    r'\bALTER\s+',
    r'\bGRANT\b',
    r'\bREVOKE\b',
    r'\bVACUUM\b',
    r'\bREINDEX\b',
    r'\bCLUSTER\b',
    r'\bSET\s+ROLE\b',
    r'\bRESET\s+ROLE\b',
    r'\bSET\s+SESSION\s+AUTHORIZATION\b',
    r'\bCREATE\b',
    r'\bDELETE\s+FROM\b',
    r'\bDELETE\b',                  # also any bare DELETE
    r'\bINSERT\s+INTO\b',
    r'\bINSERT\b',                  # also any bare INSERT
    r'\bUPDATE\s+\w+\s+SET\b',
    r'\bUPDATE\b',                  # also any bare UPDATE
    r'\bCOPY\b',
    r'\bEXECUTE\b',
    r'\bCALL\b',
    r'\bDO\b\s*\$',
    r'\bexec_sql\s*\(',
    r'\bpg_execute\b',
    r'\bpg_read_file\b',
    r'\bpg_write_file\b',
    r'\bpg_read_binary_file\b',
    r'\bpg_write_binary_file\b',
    r'\blo_import\b',
    r'\blo_export\b',
    r'\bdblink\b',
    r'\bsecurity\s+definer\b',
]

_DANGEROUS_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in DANGEROUS_PATTERNS]

# P1-10 — tables that are never readable via the console (credentials, tokens,
# sessions, bans). Matched case-insensitively against the raw SQL.
_BLOCKED_TABLES = (
    "users", "staff_users", "recovery_codes", "password_reset_tokens",
    "email_verification_tokens", "auth_sessions", "ip_bans",
)
_BLOCKED_TABLES_COMPILED = [re.compile(rf"\b{t}\b", re.IGNORECASE) for t in _BLOCKED_TABLES]

# P1-10 — time-based exfiltration / defences probing via the SQL console.
_BLOCKED_SQL_FUNCS = ("pg_sleep", "pg_terminate", "information_schema", "pg_catalog")
_BLOCKED_SQL_FUNCS_COMPILED = [re.compile(rf"\b{f}\b", re.IGNORECASE) for f in _BLOCKED_SQL_FUNCS]

MAX_SQL_LENGTH = 10000
MAX_RESULT_LIMIT = 100


def _blocked_table(sql: str) -> str | None:
    for rx in _BLOCKED_TABLES_COMPILED:
        if rx.search(sql):
            return rx.pattern
    return None


def _blocked_func(sql: str) -> str | None:
    for rx in _BLOCKED_SQL_FUNCS_COMPILED:
        if rx.search(sql):
            return rx.pattern
    return None


def _cap_limit(sql: str) -> str:
    """Cap any LIMIT clause at MAX_RESULT_LIMIT (case-insensitive)."""
    def _repl(m: re.Match) -> str:
        try:
            n = int(m.group(1))
        except (TypeError, ValueError):
            return f"LIMIT {MAX_RESULT_LIMIT}"
        return f"LIMIT {min(n, MAX_RESULT_LIMIT)}"
    return re.sub(r"\bLIMIT\s+(\d+)", _repl, sql, flags=re.IGNORECASE)

def _is_dangerous_sql(sql: str) -> str | None:
    # Strip line comments and block comments first so `DROP /* x */ TABLE` is
    # caught by the bare DROP rule after normalisation.
    normalized = re.sub(r'--[^\n]*', '', sql)
    normalized = re.sub(r'/\*.*?\*/', '', normalized, flags=re.DOTALL)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    for pattern in _DANGEROUS_COMPILED:
        if pattern.search(normalized):
            return pattern.pattern
    return None

def _sanitize_sql(sql: str) -> str:
    return " ".join(sql.split())[:500]

@router.post("/sql")
async def execute_sql(req: SqlRequest, request: Request, user: dict = Depends(require_admin)):
    if len(req.sql) > MAX_SQL_LENGTH:
        raise HTTPException(400, f"SQL too long. Maximum {MAX_SQL_LENGTH} characters.")

    dangerous_pattern = _is_dangerous_sql(req.sql)
    if dangerous_pattern:
        raise HTTPException(
            status_code=403,
            detail="Dangerous SQL pattern detected. This operation is blocked for security."
        )

    # C8 — Stronger separator strip. Bare SELECT / WITH only; multi-statement is
    # blocked by `;` in DANGEROUS_PATTERNS above but we ratchet further by refusing
    # anything that doesn't start with `select` / `with`.
    sql_lower_stripped = req.sql.lstrip().lower()
    if not (sql_lower_stripped.startswith("select") or sql_lower_stripped.startswith("with")):
        raise HTTPException(
            status_code=403,
            detail="Only single SELECT queries and read-only WITH clauses are allowed."
        )

    blocked_table = _blocked_table(req.sql)
    if blocked_table:
        raise HTTPException(
            status_code=403,
            detail="Query touches a restricted table and is blocked."
        )

    blocked_func = _blocked_func(req.sql)
    if blocked_func:
        raise HTTPException(
            status_code=400,
            detail="Query uses a blocked function or schema and is rejected."
        )

    staff_username = user.get("username", "unknown")
    client_ip = request.client.host if request.client else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    sql_to_run = req.sql.strip().rstrip(';')
    # LIMIT cap: clamp any client-supplied LIMIT to MAX_RESULT_LIMIT and add a
    # bounded LIMIT when none is present.
    sql_lower = req.sql.lower()
    if sql_lower_stripped.startswith("select"):
        if "limit" not in sql_lower:
            sql_to_run = f"{sql_to_run} LIMIT {MAX_RESULT_LIMIT}"
        else:
            sql_to_run = _cap_limit(sql_to_run)

    try:
        result = supabase.rpc("exec_sql", {"sql_text": sql_to_run}).execute()
        try:
            supabase.table("audit_logs").insert({
                "actor": staff_username,
                "action": "db_console_query",
                "target": "exec_sql",
                "details": {"sql": _sanitize_sql(req.sql)},
                "ip": client_ip,
                "created_at": now_iso,
            }).execute()
        except Exception:
            pass
        return {"data": result.data}
    except Exception as e:
        detail = str(e)
        log.error("db_console exec_sql failed for user=%s: %s", staff_username, detail)
        try:
            supabase.table("audit_logs").insert({
                "actor": staff_username,
                "action": "db_console_error",
                "target": "exec_sql",
                "details": {"sql": _sanitize_sql(req.sql), "error": detail[:500]},
                "ip": client_ip,
                "created_at": now_iso,
            }).execute()
        except Exception:
            pass
        if "function exec_sql" in detail.lower() or "does not exist" in detail.lower():
            raise HTTPException(
                status_code=400,
                detail="exec_sql function not found. Run migrations/005_security_hardening.sql to install it."
            )
        raise HTTPException(status_code=400, detail="Query failed.")

@router.get("/check")
async def check_console(_=Depends(require_staff)):
    try:
        result = supabase.rpc("exec_sql", {"sql_text": "SELECT 1 AS ok"}).execute()
        return {"available": True}
    except Exception:
        return {"available": False, "detail": "exec_sql function not available. Run migrations/005_security_hardening.sql."}