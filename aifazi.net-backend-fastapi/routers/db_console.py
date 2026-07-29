from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff, require_admin
from datetime import datetime, timezone
import re

router = APIRouter()

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

MAX_SQL_LENGTH = 10000

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

    staff_username = user.get("username", "unknown")
    client_ip = request.client.host if request.client else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    sql_to_run = req.sql.strip().rstrip(';')
    # LIMIT 1000 auto-add: substring check (`"limit" not in sql_lower`) is fine — a
    # column name `limit_log` would defensively skip the cap but the query still
    # runs row-bounded by the DB-side exec_sql function code (best-effort safety).
    sql_lower = req.sql.lower()
    if sql_lower_stripped.startswith("select") and "limit" not in sql_lower:
        sql_to_run = f"{sql_to_run} LIMIT 1000"

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
        raise HTTPException(status_code=400, detail=detail[:500])

@router.get("/check")
async def check_console(_=Depends(require_staff)):
    try:
        result = supabase.rpc("exec_sql", {"sql_text": "SELECT 1 AS ok"}).execute()
        return {"available": True}
    except Exception:
        return {"available": False, "detail": "exec_sql function not available. Run migrations/005_security_hardening.sql."}