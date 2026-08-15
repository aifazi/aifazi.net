"""
utils/audit.py — Shared audit-log helper used by all routers.

Single source of truth so fixes here propagate everywhere.

Tables required in Supabase (run /api/admin/audit/migrate once, or paste
the SQL below into the Supabase SQL editor manually):

    CREATE TABLE IF NOT EXISTS audit_logs (
        id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
        actor      TEXT        NOT NULL DEFAULT 'system',
        action     TEXT        NOT NULL DEFAULT '',
        target     TEXT                 DEFAULT '',
        details    JSONB                DEFAULT '{}',
        ip         TEXT                 DEFAULT '',
        created_at TIMESTAMPTZ          DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON audit_logs (actor);

    CREATE TABLE IF NOT EXISTS auth_logs (
        id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
        username   TEXT        NOT NULL DEFAULT '',
        success    BOOLEAN     NOT NULL DEFAULT FALSE,
        ip         TEXT                 DEFAULT '',
        user_agent TEXT                 DEFAULT '',
        role       TEXT                 DEFAULT '',
        reason     TEXT                 DEFAULT '',
        created_at TIMESTAMPTZ          DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS auth_logs_created_at_idx ON auth_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS auth_logs_username_idx   ON auth_logs (username);
"""
import logging

from database import supabase

logger = logging.getLogger("audit")

# SQL to fix both tables — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it
# is safe to run multiple times.  audit_logs may already exist with old schema
# (missing action/target/details/ip columns) — ALTER TABLE handles that.
_MIGRATION_SQL = """
-- Fix audit_logs: add missing columns if the table was created with old schema
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action  TEXT        NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target  TEXT                 DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB                DEFAULT '{}';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip      TEXT                 DEFAULT '';

-- Ensure the base table exists in case it was never created
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    actor      TEXT        NOT NULL DEFAULT 'system',
    action     TEXT        NOT NULL DEFAULT '',
    target     TEXT                 DEFAULT '',
    details    JSONB                DEFAULT '{}',
    ip         TEXT                 DEFAULT '',
    created_at TIMESTAMPTZ          DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON public.audit_logs (actor);

-- Create auth_logs (was never created on Supabase free tier)
CREATE TABLE IF NOT EXISTS public.auth_logs (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    username   TEXT        NOT NULL DEFAULT '',
    success    BOOLEAN     NOT NULL DEFAULT FALSE,
    ip         TEXT                 DEFAULT '',
    user_agent TEXT                 DEFAULT '',
    role       TEXT                 DEFAULT '',
    reason     TEXT                 DEFAULT '',
    created_at TIMESTAMPTZ          DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_logs_created_at_idx ON public.auth_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_logs_username_idx   ON public.auth_logs (username);

-- Forum sessions (one row per device per user)
CREATE TABLE IF NOT EXISTS public.forum_sessions (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    username   TEXT        NOT NULL DEFAULT '',
    ip         TEXT                 DEFAULT '',
    user_agent TEXT                 DEFAULT '',
    last_active TIMESTAMPTZ         DEFAULT now(),
    created_at TIMESTAMPTZ          DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_sessions_user_id_idx ON public.forum_sessions (user_id);

-- User activity logs (forum users)
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    username   TEXT        NOT NULL DEFAULT '',
    action     TEXT        NOT NULL DEFAULT '',
    detail     TEXT                 DEFAULT '',
    ip         TEXT                 DEFAULT '',
    created_at TIMESTAMPTZ          DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_activity_logs_user_id_idx ON public.user_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx ON public.user_activity_logs (created_at DESC);

-- Link helpdesk tickets to forum users
ALTER TABLE public.helpdesk_tickets ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS helpdesk_tickets_user_id_idx ON public.helpdesk_tickets (user_id);
""".strip()


def record(
    actor: str,
    action: str,
    target: str = "",
    details: dict | None = None,
    ip: str = "",
) -> bool:
    """Insert a row into audit_logs.
    
    Writes ONLY the columns that exist in the ORIGINAL schema (username / event / ip)
    so inserts succeed on instances that haven't run the migration yet.
    Once the migration SQL is applied (adding action/actor/target/details columns),
    this function will automatically start writing those too — it tries the full
    schema first and falls back to the legacy schema on PGRST204.
    Never raises.
    """
    if supabase is None:
        logger.warning("audit.record: Supabase not initialised — skipping")
        return False

    # Try full schema first (post-migration columns: actor/action/target/details/ip)
    try:
        supabase.table("audit_logs").insert({
            "actor":    actor   or "system",
            "action":   action  or "",
            "target":   target  or "",
            "details":  details or {},
            "username": actor   or "system",   # legacy alias
            "event":    action  or "",          # legacy alias
            "ip":       ip      or "",
        }).execute()
        return True
    except Exception as exc:
        err = str(exc)
        # PGRST204 = column not found → table is on old schema, fall back
        if "PGRST204" not in err and "column" not in err.lower():
            logger.error("audit.record failed — actor=%s action=%s error=%s", actor, action, exc)
            return False

    # Legacy schema fallback (original table: username / event / ip only)
    try:
        supabase.table("audit_logs").insert({
            "username": actor  or "system",
            "event":    action or "",
            "ip":       ip     or "",
        }).execute()
        return True
    except Exception as exc2:
        logger.error("audit.record legacy fallback failed — actor=%s action=%s error=%s", actor, action, exc2)
        return False


def record_auth(
    username: str,
    success: bool,
    ip: str = "",
    user_agent: str = "",
    role: str = "",
    reason: str = "",
) -> bool:
    """Insert a row into auth_logs. Returns True on success, never raises."""
    try:
        supabase.table("auth_logs").insert({
            "username":   username   or "unknown",
            "success":    success,
            "ip":         ip         or "",
            "user_agent": user_agent or "",
            "role":       role       or "",
            "reason":     reason     or ("login_success" if success else "login_failed"),
        }).execute()
        return True
    except Exception as exc:
        logger.error("audit.record_auth failed — username=%s error=%s", username, exc)
        return False


def migrate() -> dict:
    """
    Idempotent: create audit_logs + auth_logs tables if they don't exist.
    Called by GET /api/admin/audit/migrate at startup and on demand.
    """
    try:
        supabase.rpc("exec_sql", {"sql_text": _MIGRATION_SQL}).execute()
        return {"ok": True, "message": "audit_logs + auth_logs tables ensured via exec_sql RPC"}
    except Exception as rpc_exc:
        logger.warning("audit.migrate: exec_sql RPC unavailable (%s) — trying table probe", rpc_exc)

    # Fallback: probe each table with a lightweight query to check existence
    results = {}
    for table in ("audit_logs", "auth_logs"):
        try:
            supabase.table(table).select("id").limit(1).execute()
            results[table] = "exists"
        except Exception as exc:
            results[table] = f"missing ({exc})"

    all_exist = all("exists" in v for v in results.values())
    if all_exist:
        return {"ok": True, "message": "Both tables already exist.", "tables": results}

    return {
        "ok": False,
        "message": (
            "Auto-migration unavailable on Supabase free tier. "
            "Please run the SQL below in your Supabase project → SQL Editor."
        ),
        "tables": results,
        "sql": _MIGRATION_SQL,
    }
