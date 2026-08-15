"""routers/backup.py — JSON + SQL export of all tables
  GET /admin/backup/stats       → { collections: {name: count}, totalRecords: N }
  GET /admin/backup             → JSON file download
  GET /admin/backup/export-sql  → SQL dump (schema-only / data-only / full)
      ?mode=schema      → CREATE TABLE IF NOT EXISTS statements only (empty template)
      ?mode=data        → INSERT INTO statements only
      ?mode=full        → schema + data
      ?tables=posts,media → optional comma-separated filter
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse

from database import supabase
from dependencies import require_admin, require_staff

log = logging.getLogger("backup")
router = APIRouter()

FALLBACK_TABLES = [
    "posts", "media", "contacts", "users", "forum_categories",
    "forum_threads", "forum_replies", "chat_rooms", "chat_messages", "chat_members",
    "newsletter_subs", "notifications", "helpdesk_tickets", "banners",
    "site_config", "email_config", "cdn_config",
    "projects", "skill_categories", "certifications", "audit_logs",
    "auth_logs", "forum_sessions", "user_activity_logs", "admin_sessions",
    "fivem_whitelist", "fivem_realtime_events", "fivem_bans", "fivem_connect_tokens",
    "mail_queue", "mail_templates", "application_forms", "form_submissions",
    "helpdesk_messages", "helpdesk_settings", "chat_mutes", "chat_bans", "chat_room_roles",
    "visitor_sessions", "push_subscriptions", "discord_users", "steam_users", "admin_2fa",
]

PG_TYPE_MAP = {
    "uuid": "UUID", "text": "TEXT", "varchar": "TEXT", "character varying": "TEXT",
    "integer": "INTEGER", "bigint": "BIGINT", "smallint": "SMALLINT", "serial": "SERIAL",
    "bigserial": "BIGSERIAL", "boolean": "BOOLEAN", "bool": "BOOLEAN",
    "timestamp with time zone": "TIMESTAMPTZ", "timestamptz": "TIMESTAMPTZ",
    "timestamp without time zone": "TIMESTAMP", "timestamp": "TIMESTAMP",
    "date": "DATE", "time with time zone": "TIMETZ", "time without time zone": "TIME",
    "double precision": "FLOAT8", "real": "FLOAT4", "numeric": "NUMERIC", "decimal": "NUMERIC",
    "jsonb": "JSONB", "json": "JSON", "bytea": "BYTEA",
    "text[]": "TEXT[]", "integer[]": "INTEGER[]",
    "ARRAY": "JSONB",
}

SENSITIVE_COLS = {"password_hash", "password", "refresh_token", "totp_secret",
                   "verify_token", "reset_token", "api_key", "api_secret",
                   "secret_key", "access_token", "private_key",
                   "encryption_key", "session_token", "service_role_key"}
SENSITIVE_KEY_PARTS = ("password", "secret", "token", "private", "api_secret", "service_role", "totp")

def _is_sensitive_key(key: str) -> bool:
    k = str(key or "").lower()
    return k in SENSITIVE_COLS or any(part in k for part in SENSITIVE_KEY_PARTS)

def _redact_value(key: str, value):
    if _is_sensitive_key(key):
        return "***REDACTED***"
    if isinstance(value, dict):
        return {k: _redact_value(k, v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_value(key, item) for item in value]
    return value

def _redact_row(row: dict) -> dict:
    return {k: _redact_value(k, v) for k, v in row.items()}


def _discover_tables() -> list[str]:
    sql = (
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
        "ORDER BY table_name"
    )
    try:
        result = supabase.rpc("exec_sql", {"sql_text": sql}).execute()
        tables = [r.get("table_name") for r in (result.data or []) if r.get("table_name")]
        return tables or FALLBACK_TABLES
    except Exception as e:
        log.warning("exec_sql RPC failed for table discovery, using fallback list: %s", e)
        return FALLBACK_TABLES


def _safe_table_filter(tables: str) -> list[str] | None:
    if not tables:
        return None
    import re
    out = []
    for table in tables.split(","):
        name = table.strip()
        if not name:
            continue
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise HTTPException(400, f"Invalid table name: {name}")
        out.append(name)
    return out or None


def _sql_escape(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, (dict, list)):
        import json
        escaped = json.dumps(val, ensure_ascii=False).replace("'", "''")
        return f"'{escaped}'"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def _fetch_schema_via_rpc() -> dict[str, list[dict]]:
    """Fetch table schemas by querying information_schema via exec_sql RPC."""
    cols_sql = (
        "SELECT table_name, column_name, data_type, is_nullable, column_default "
        "FROM information_schema.columns "
        "WHERE table_schema = 'public' "
        "ORDER BY table_name, ordinal_position"
    )
    try:
        result = supabase.rpc("exec_sql", {"sql_text": cols_sql}).execute()
        rows = result.data or []
    except Exception as e:
        log.warning("exec_sql RPC failed for schema query, will fall back to sample: %s", e)
        return {}

    schema: dict[str, list[dict]] = {}
    for row in rows:
        tname = row.get("table_name", "")
        if tname not in schema:
            schema[tname] = []
        schema[tname].append({
            "name": row.get("column_name", ""),
            "type": row.get("data_type", ""),
            "nullable": row.get("is_nullable", "YES") == "YES",
            "default": row.get("column_default"),
        })
    return schema


def _fetch_schema_via_sample(table: str) -> list[dict]:
    """Fallback: infer schema by selecting one row and examining types."""
    try:
        res = supabase.table(table).select("*").limit(1).execute()
        row = (res.data or [None])[0]
        if not row:
            return []
        cols = []
        for key, val in row.items():
            dtype = "TEXT"
            if isinstance(val, bool):
                dtype = "BOOLEAN"
            elif isinstance(val, int):
                dtype = "BIGINT"
            elif isinstance(val, float):
                dtype = "FLOAT8"
            elif isinstance(val, (dict, list)):
                dtype = "JSONB"
            nullable = True
            if key in ("id", "created_at", "updated_at", "email"):
                nullable = False
            cols.append({"name": key, "type": dtype, "nullable": nullable, "default": None})
        return cols
    except Exception:
        return []


def _generate_create_table(table: str, columns: list[dict], if_not_exists: bool = True) -> str:
    if not columns:
        return f"-- {table}: no schema available\n"
    clause = "CREATE TABLE IF NOT EXISTS" if if_not_exists else "CREATE TABLE"
    lines = [f"{clause} public.{table} ("]
    col_defs = []
    for col in columns:
        name = col["name"]
        pg_type = col["type"].lower() if col.get("type") else "text"
        sql_type = PG_TYPE_MAP.get(pg_type, pg_type.upper())
        null_clause = "" if col.get("nullable", True) else " NOT NULL"
        default = col.get("default")
        def_clause = f" DEFAULT {default}" if default else ""
        col_defs.append(f'    "{name}" {sql_type}{null_clause}{def_clause}')
    lines.append(",\n".join(col_defs))
    lines.append("\n);\n")
    return "\n".join(lines)


def _generate_inserts(table: str, rows: list[dict], columns: list[str] | None = None) -> str:
    if not rows:
        return f"-- {table}: no data\n"
    if columns is None:
        columns = list(rows[0].keys()) if rows else []
    safe_cols = [c for c in columns if not _is_sensitive_key(c)]
    if not safe_cols:
        return f"-- {table}: all columns are sensitive, skipping data export\n"
    col_list = ", ".join(f'"{c}"' for c in safe_cols)
    lines = []
    lines.append(f"\n-- {table}: {len(rows)} row(s)")
    for row in rows:
        row = _redact_row(row)
        vals = ", ".join(_sql_escape(row.get(c)) for c in safe_cols)
        lines.append(f"INSERT INTO public.{table} ({col_list}) VALUES ({vals});")
    lines.append("")
    return "\n".join(lines)


@router.get("/stats")
async def backup_stats(_: dict = Depends(require_staff)):
    collections = {}
    errors = {}
    total = 0
    tables = _discover_tables()
    for table in tables:
        try:
            res = supabase.table(table).select("id", count="exact").execute()
            n = res.count or 0
            collections[table] = n
            total += n
        except Exception as e:
            collections[table] = 0
            errors[table] = str(e)
    return {"collections": collections, "totalRecords": total, "tableCount": len(tables), "errors": errors}


def _fetch_all_rows(table: str, page_size: int = 1000, max_rows: int = 200000) -> list[dict]:
    """Fetch ALL rows for a table, paging past PostgREST's 1000-row default cap.
    Without paging, backups silently truncated every table to 1000 rows."""
    out: list[dict] = []
    start = 0
    while True:
        res = supabase.table(table).select("*").range(start, start + page_size - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
        if len(out) >= max_rows:
            logging.getLogger(__name__).warning("backup: %s exceeds %d rows — truncated at %d", table, max_rows, len(out))
            break
    return out


@router.get("")
async def backup(_: dict = Depends(require_admin)):
    data = {}
    errors = {}
    tables = _discover_tables()
    for table in tables:
        try:
            res = _fetch_all_rows(table)
            data[table] = [_redact_row(r) for r in res]
        except Exception as e:
            data[table] = {"error": str(e)}
            errors[table] = str(e)
    return JSONResponse(
        content={"exported_at": datetime.now(timezone.utc).isoformat(), "table_count": len(tables), "errors": errors, "tables": data},
        headers={"Content-Disposition": f"attachment; filename=backup-{datetime.now().strftime('%Y%m%d')}.json"},
    )


@router.get("/export-sql")
async def export_sql(
    mode: str = Query("schema", description="schema | data | full"),
    tables: str = Query("", description="comma-separated table filter"),
    if_not_exists: bool = Query(True, description="Use IF NOT EXISTS in CREATE TABLE"),
    _: dict = Depends(require_admin),
):
    if mode not in ("schema", "data", "full"):
        raise HTTPException(400, "mode must be one of: schema, data, full")

    filter_tables = _safe_table_filter(tables)
    target_tables = filter_tables or _discover_tables()

    include_schema = mode in ("schema", "full")
    include_data = mode in ("data", "full")

    full_schema = _fetch_schema_via_rpc()

    lines = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines.append(f"-- aifazi.net database export ({mode})")
    lines.append(f"-- Generated: {ts}")
    lines.append(f"-- Tables: {', '.join(target_tables)}")
    lines.append("")

    for table in target_tables:
        columns = full_schema.get(table)
        if not columns:
            columns = _fetch_schema_via_sample(table)

        if include_schema:
            ddl = _generate_create_table(table, columns, if_not_exists=if_not_exists)
            lines.append(ddl)

        if include_data:
            try:
                rows = _fetch_all_rows(table)
            except Exception as e:
                lines.append(f"-- {table}: failed to fetch data ({e})\n")
                continue
            col_names = [c["name"] for c in columns] if columns else None
            ins = _generate_inserts(table, rows, col_names)
            lines.append(ins)

    sql_content = "\n".join(lines)
    filename = f"aifazi-{mode}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.sql"

    return PlainTextResponse(
        content=sql_content,
        media_type="application/sql",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
