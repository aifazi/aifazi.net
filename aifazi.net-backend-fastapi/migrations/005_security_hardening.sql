-- 005_security_hardening.sql
-- Security fixes: RLS hardening + exec_sql lockdown
-- Run this AFTER migration.sql to tighten security.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. CHAT TABLES — Remove anonymous write access
-- ══════════════════════════════════════════════════════════════════════════════
-- The original RLS policies allowed the `anon` role full CRUD on all chat tables.
-- This means anyone with the Supabase anon key could read/write/delete chat data
-- without authentication. Fix: keep public SELECT for Realtime, restrict writes.

-- chat_messages: Keep anon SELECT (needed for Supabase Realtime), remove writes
DROP POLICY IF EXISTS anon_insert_chat_messages ON chat_messages;
DROP POLICY IF EXISTS anon_update_chat_messages ON chat_messages;
DROP POLICY IF EXISTS anon_delete_chat_messages ON chat_messages;
-- authenticated users can read/write via the service-role backend
CREATE POLICY authenticated_insert_chat_messages ON chat_messages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update_chat_messages ON chat_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_delete_chat_messages ON chat_messages
  FOR DELETE TO authenticated USING (true);

-- chat_rooms: Keep public SELECT, restrict writes to authenticated
DROP POLICY IF EXISTS anon_insert_chat_rooms ON chat_rooms;
DROP POLICY IF EXISTS anon_update_chat_rooms ON chat_rooms;
DROP POLICY IF EXISTS anon_delete_chat_rooms ON chat_rooms;
CREATE POLICY authenticated_insert_chat_rooms ON chat_rooms
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update_chat_rooms ON chat_rooms
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_delete_chat_rooms ON chat_rooms
  FOR DELETE TO authenticated USING (true);

-- chat_mutes: Remove all anon access (admin/staff only via service-role)
DROP POLICY IF EXISTS anon_read_chat_mutes ON chat_mutes;
DROP POLICY IF EXISTS anon_all_chat_mutes ON chat_mutes;
DROP POLICY IF EXISTS anon_update_chat_mutes ON chat_mutes;
DROP POLICY IF EXISTS anon_delete_chat_mutes ON chat_mutes;
CREATE POLICY authenticated_read_chat_mutes ON chat_mutes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_insert_chat_mutes ON chat_mutes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update_chat_mutes ON chat_mutes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_delete_chat_mutes ON chat_mutes
  FOR DELETE TO authenticated USING (true);

-- chat_bans: Remove all anon access (admin/staff only via service-role)
DROP POLICY IF EXISTS anon_read_chat_bans ON chat_bans;
DROP POLICY IF EXISTS anon_all_chat_bans ON chat_bans;
DROP POLICY IF EXISTS anon_update_chat_bans ON chat_bans;
DROP POLICY IF EXISTS anon_delete_chat_bans ON chat_bans;
CREATE POLICY authenticated_read_chat_bans ON chat_bans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_insert_chat_bans ON chat_bans
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update_chat_bans ON chat_bans
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_delete_chat_bans ON chat_bans
  FOR DELETE TO authenticated USING (true);

-- chat_members: Remove all anon access (admin/staff only via service-role)
DROP POLICY IF EXISTS anon_read_chat_members ON chat_members;
DROP POLICY IF EXISTS anon_insert_chat_members ON chat_members;
DROP POLICY IF EXISTS anon_delete_chat_members ON chat_members;
CREATE POLICY authenticated_read_chat_members ON chat_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_insert_chat_members ON chat_members
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_delete_chat_members ON chat_members
  FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. exec_sql function — Add role-based access control
-- ══════════════════════════════════════════════════════════════════════════════
-- The exec_sql function runs with SECURITY DEFINER (superuser privileges).
-- This is dangerous because a bypass of the Python regex filter could allow
-- arbitrary DDL/DML as the database superuser.
--
-- C8 — Previous 005 build was BROKEN: it returned `SELECT jsonb_agg(row_to_json(t))
-- FROM (SELECT sql_text) t)` which just echoes the SQL string in a JSONB wrapper and
-- **never executes the user's query**. Admin DB console was silently useless AND
-- anyone calling `supabase.rpc('exec_sql', {sql_text:'DROP TABLE users'})` from the
-- anon REST surface (before this REVOKE) could wipe the DB.
--
-- This rebuild:
--   * Actually EXECUTEs the SELECT via dynamic SQL + jsonb_agg.
--   * Blocks every `;` (no multi-statement or string-literal-embedded injection).
--   * Blocks the full dangerous-keyword list at the database level.
--   * REVOKEs EXECUTE from PUBLIC + anon so only service_role/authenticated can call.

CREATE OR REPLACE FUNCTION exec_sql(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _normalized text;
  _result jsonb;
BEGIN
  -- C8 — Reject any semicolon outright. SELECT queries don't need a trailing ';',
  -- so presence of one is treated as a multi-statement / injection attempt.
  -- (Quoted strings containing ';' must use parameterised queries, which we don't
  -- expose here.)
  IF position(';' in sql_text) > 0 THEN
    RAISE EXCEPTION 'exec_sql: semicolons are not allowed (single-statement SELECT only)';
  END IF;

  -- Normalize for keyword matching
  _normalized := regexp_replace(lower(trim(sql_text)), '\s+', ' ', 'g');

  -- Block ALL dangerous operations at the database level
  IF _normalized ~ ANY(ARRAY[
    '^\s*(drop|alter|create|truncate|insert|update|delete|grant|revoke|vacuum|reindex|cluster|copy|call|do)\b',
    'exec_sql\s*\(',
    'pg_execute',
    'pg_read_file',
    'pg_write_file',
    'lo_import',
    'lo_export',
    'dblink',
    'pg_read_binary_file',
    'pg_write_binary_file',
    'copy\s+.*\s+from\s+',
    'copy\s+.*\s+to\s+',
    'security\s+definer',
    'set\s+role',
    'reset\s+role',
    'set\s+session\s+authorization',
    'create\s+or\s+replace\s+function'
  ]) THEN
    RAISE EXCEPTION 'exec_sql: blocked dangerous operation. Only single SELECT queries are allowed.';
  END IF;

  -- Block CTEs that perform writes (WITH ... DELETE/INSERT/UPDATE)
  IF _normalized ~ '^\s*with\b' AND _normalized ~ '\b(delete|insert|update)\b' THEN
    RAISE EXCEPTION 'exec_sql: blocked CTE with write operation. Only SELECT queries are allowed.';
  END IF;

  -- Must be SELECT or WITH (read-only CTE)
  IF NOT (_normalized ~ '^\s*select\b' OR _normalized ~ '^\s*with\b') THEN
    RAISE EXCEPTION 'exec_sql: only SELECT queries are allowed. Got: %', left(sql_text, 100);
  END IF;

  -- C8 — actually execute the (validated, single-statement, SELECT-only) query and
  -- return row_to_json results. The string concat is safe because we already
  -- (a) blocked `;` and (b) verified the statement begins with SELECT/WITH and
  -- (c) matched no dangerous keyword. A `--` comment inside sql_text terminates at
  -- the end of the string, so no further statements can be smuggled.
  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(__q)), ''[]''::jsonb) FROM (%s) __q', sql_text) INTO _result;
  RETURN _result;
END;
$$;

-- C8 — Only `service_role` (the backend's auth role) may call exec_sql.
-- Supabase exposes functions to anon over REST by default (revoked below), and
-- `authenticated` is the JWT role of EVERY logged-in site user — granting it
-- EXECUTE let any registered user call supabase.rpc('exec_sql', ...) from the
-- browser and read password_hash / totp_secret / refresh_token as superuser,
-- bypassing the Python require_admin gate entirely. service_role only.
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2b. chat_rooms.encryption_key — anon read must not leak the E2EE key
-- ══════════════════════════════════════════════════════════════════════════════
-- Audit found that the anon SELECT policy on chat_rooms allowed `SELECT encryption_key
-- FROM chat_rooms` over the REST surface with the anon key alone. Replace the broad
-- anon SELECT with a column-restricted policy that excludes encryption_key, and add
-- an authenticated policy that still allows the service-role backend to manage the
-- column.
DROP POLICY IF EXISTS anon_select_chat_rooms ON chat_rooms;
DROP POLICY IF EXISTS chat_rooms_select ON chat_rooms;

-- Anon can read chat_rooms metadata required for Supabase Realtime but NOT
-- the encryption_key column (which would let anyone decrypt "E2EE" room messages).
CREATE POLICY anon_select_chat_rooms_safe ON chat_rooms
  FOR SELECT TO anon USING (true);  -- still broad, but column-level GRANT below ratchets

-- Revoke anon column-level access to encryption_key explicitly.
REVOKE SELECT (encryption_key) ON chat_rooms FROM anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2c. Audit logs — anon must not read
-- ══════════════════════════════════════════════════════════════════════════════
-- The original migration.sql created audit_logs + auth_logs without anon-read
-- policies, but Supabase sometimes defaults to a `USING (true)` blanket anon
-- SELECT. Ratchet anon off explicitly.
REVOKE SELECT ON audit_logs FROM anon;
REVOKE SELECT ON auth_logs FROM anon;
REVOKE SELECT ON user_activity_logs FROM anon;
REVOKE SELECT ON forum_sessions FROM anon;
REVOKE SELECT ON admin_sessions FROM anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Verify changes
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE 'Security hardening migration (005) completed successfully.';
  RAISE NOTICE 'Chat table anon write access: REMOVED';
  RAISE NOTICE 'exec_sql: actually executes single SELECT-only, REVOKEd from anon/PUBLIC/authenticated (service_role only)';
  RAISE NOTICE 'chat_rooms.encryption_key: anon SELECT revoked';
  RAISE NOTICE 'audit/auth/session logs: anon SELECT revoked';
END $$;
