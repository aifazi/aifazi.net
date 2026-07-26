from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff, require_admin
from datetime import datetime, timezone
import re

router = APIRouter()

class SqlRequest(BaseModel):
    sql: str

DANGEROUS_PATTERNS = [
    r'\bDROP\s+',
    r'\bTRUNCATE\b',
    r'\bALTER\s+',
    r'\bGRANT\b',
    r'\bREVOKE\b',
    r'\bVACUUM\b',
    r'\bREINDEX\b',
    r'\bSET\s+ROLE\b',
    r'\bRESET\s+ROLE\b',
    r'\bCREATE\s+(TABLE|DATABASE|FUNCTION|EXTENSION|ROLE|USER)\b',
    r'\bDELETE\s+FROM\b',
    r'\bINSERT\s+INTO\s+(staff_users|admin_sessions|audit_logs|admin_2fa)\b',
    r'\bUPDATE\s+(staff_users|admin_2fa)\s+SET\b',
    r'\bCOPY\b',
    r'\bEXECUTE\b',
    r'\bDO\b\s*\$',
    r'\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b',
]

_DANGEROUS_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in DANGEROUS_PATTERNS]

MAX_SQL_LENGTH = 10000

def _is_dangerous_sql(sql: str) -> str | None:
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
            detail=f"Dangerous SQL pattern detected. This operation is blocked for security."
        )

    sql_lower = req.sql.lower().strip()
    if not sql_lower.startswith("select") and not sql_lower.startswith("with"):
        raise HTTPException(
            status_code=403,
            detail="Only SELECT queries and WITH clauses are allowed."
        )

    staff_username = user.get("username", "unknown")
    client_ip = request.client.host if request.client else ""
    now_iso = datetime.now(timezone.utc).isoformat()

    sql_to_run = req.sql.strip().rstrip(';')
    if sql_lower.startswith("select") and "limit" not in sql_lower:
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
                detail="exec_sql function not found. Run the migration SQL first: CREATE OR REPLACE FUNCTION exec_sql..."
            )
        raise HTTPException(status_code=400, detail=detail[:500])

@router.get("/check")
async def check_console(_=Depends(require_staff)):
    try:
        result = supabase.rpc("exec_sql", {"sql_text": "SELECT 1 AS ok"}).execute()
        return {"available": True}
    except Exception:
        return {"available": False, "detail": "exec_sql function not available. Run migration_db_console.sql first."}