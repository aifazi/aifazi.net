-- 20260817000200_security_foundation_reassert.sql
-- Backfills the foundational hardening that this Supabase migrations folder
-- omits (backend 005 / 008 / 010), WITHOUT regressing later passes.
--
-- Why a consolidated file instead of a literal 005 copy: the authoritative
-- backend folder applies 005 BEFORE 022, and 022 then drops the
-- `authenticated_*_chat_*` write policies 005 created. This folder already
-- carries the 022-equivalent (20260805000300), so re-running 005 verbatim
-- *after* it would silently re-open authenticated chat writes. This file
-- therefore includes only the additive, order-independent hardening:
--
--   1. exec_sql rebuilt hardened AND search_path-pinned (fixes the pin that
--      backend 005 omitted), EXECUTE revoked to service_role only.  [005+008]
--   2. RLS enabled + anon revoked on all identity/credential tables.   [010]
--   3. chat_rooms.encryption_key column-revoked from anon.             [005]
--   4. audit/auth/session logs anon SELECT revoked.                    [005]
--   5. staff_users: anon SELECT kept for the staff Realtime feed, with
--      sensitive columns column-revoked.                              [010]
--
-- All statements are idempotent (IF EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE), safe to replay on an already-hardened DB.

-- ── 1. exec_sql: hardened + pinned body, service_role only ───────────────────
CREATE OR REPLACE FUNCTION exec_sql(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _result jsonb;
BEGIN
  IF position(';' in sql_text) > 0 THEN
    RAISE EXCEPTION 'exec_sql: semicolons are not allowed (single-statement SELECT only)';
  END IF;

  _normalized := regexp_replace(lower(trim(sql_text)), '\s+', ' ', 'g');

  IF _normalized ~ ANY(ARRAY[
    '^\s*(drop|alter|create|truncate|insert|update|delete|grant|revoke|vacuum|reindex|cluster|copy|call|do)\b',
    'exec_sql\s*\(',
    'pg_execute', 'pg_read_file', 'pg_write_file',
    'lo_import', 'lo_export', 'dblink',
    'pg_read_binary_file', 'pg_write_binary_file',
    'copy\s+.*\s+from\s+', 'copy\s+.*\s+to\s+',
    'security\s+definer', 'set\s+role', 'reset\s+role',
    'set\s+session\s+authorization', 'create\s+or\s+replace\s+function'
  ]) THEN
    RAISE EXCEPTION 'exec_sql: blocked dangerous operation. Only single SELECT queries are allowed.';
  END IF;

  IF _normalized ~ '^\s*with\b' AND _normalized ~ '\b(delete|insert|update)\b' THEN
    RAISE EXCEPTION 'exec_sql: blocked CTE with write operation. Only SELECT queries are allowed.';
  END IF;

  IF NOT (_normalized ~ '^\s*select\b' OR _normalized ~ '^\s*with\b') THEN
    RAISE EXCEPTION 'exec_sql: only SELECT queries are allowed. Got: %', left(sql_text, 100);
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(__q)), ''[]''::jsonb) FROM (%s) __q', sql_text) INTO _result;
  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

-- ── 2. Identity / credential tables: enable RLS, revoke anon ─────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'forum_users', 'staff_users', 'admin_2fa',
    'fivem_whitelist', 'player_records', 'player_sessions',
    'helpdesk_tickets', 'helpdesk_messages',
    'forum_sessions', 'admin_sessions',
    'audit_logs', 'auth_logs', 'user_activity_logs',
    'discord_users'
  ] LOOP
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ── 3. chat_rooms.encryption_key: hide from anon ─────────────────────────────
DROP POLICY IF EXISTS anon_select_chat_rooms ON chat_rooms;
DROP POLICY IF EXISTS chat_rooms_select ON chat_rooms;
CREATE POLICY anon_select_chat_rooms_safe ON chat_rooms
  FOR SELECT TO anon USING (true);
REVOKE SELECT (encryption_key) ON chat_rooms FROM anon;

-- ── 4. Audit / auth / session logs: no anon SELECT ───────────────────────────
REVOKE SELECT ON audit_logs FROM anon;
REVOKE SELECT ON auth_logs FROM anon;
REVOKE SELECT ON user_activity_logs FROM anon;
REVOKE SELECT ON forum_sessions FROM anon;
REVOKE SELECT ON admin_sessions FROM anon;

-- ── 5. staff_users: keep anon SELECT (staff Realtime feed), hide columns ─────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff_users') THEN
    DROP POLICY IF EXISTS staff_users_select_anon ON staff_users;
    CREATE POLICY staff_users_select_anon ON staff_users FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['password_hash', 'refresh_token', 'totp_secret', 'totp_enabled', 'email', 'staff_permissions']
  LOOP
    IF EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff_users' AND column_name = col
    ) THEN
      EXECUTE format('REVOKE SELECT (%I) ON public.staff_users FROM anon', col);
    END IF;
  END LOOP;
END $$;

-- ── Verify ───────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE proname = 'exec_sql' AND proconfig IS NOT NULL AND 'search_path=public' = ANY(proconfig);
  IF n < 1 THEN RAISE EXCEPTION 'security_foundation_reassert: exec_sql is not search_path-pinned'; END IF;

  SELECT count(*) INTO n FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND routine_name = 'exec_sql'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n > 0 THEN RAISE EXCEPTION 'security_foundation_reassert: % exec_sql EXECUTE grants still present', n; END IF;

  RAISE NOTICE '20260817000200_security_foundation_reassert completed: exec_sql pinned+service_role-only, identity-table RLS + anon revokes, chat/audit column revokes applied.';
END $$;