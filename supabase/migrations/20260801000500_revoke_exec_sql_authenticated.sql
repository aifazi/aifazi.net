-- 008_revoke_exec_sql_authenticated.sql
-- C1 (audit): exec_sql is SECURITY DEFINER (superuser). Migration 005 granted
-- EXECUTE to `authenticated`, the JWT role of EVERY logged-in site user, letting
-- any registered user run SELECT via supabase.rpc('exec_sql', ...) from the
-- browser and read password_hash / totp_secret / refresh_token / chat
-- encryption keys as superuser, bypassing the Python require_admin gate.
-- Revoke it now. Only service_role (the backend) may call exec_sql.
-- Run AFTER 005_security_hardening.sql.

REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM PUBLIC, anon;

-- Verify
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_name = 'exec_sql' AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'exec_sql: authenticated still has EXECUTE — revoke failed';
  END IF;
  RAISE NOTICE 'exec_sql: EXECUTE revoked from authenticated/anon/PUBLIC (service_role only)';
END $$;
