-- 009_rate_limit.sql
-- H5 (audit): the in-memory per-IP rate limiter in main.py is per-serverless-
-- instance. Vercel runs many instances behind one hostname, so a fast attacker
-- can exceed the intended per-IP limit by spraying requests across instances
-- (each instance keeps its own sliding window and never sees the others).
--
-- This migration adds a shared, atomic rate-limit counter so brute-force
-- sensitive endpoints (login, register, 2FA, OAuth, admin SQL, uploads, …)
-- are enforced against ONE store regardless of how many instances run.
--
-- The function is a single INSERT ... ON CONFLICT upsert — atomic under
-- concurrent instances. SECURITY DEFINER so it survives RLS; EXECUTE is
-- revoked from PUBLIC/anon/authenticated and granted only to service_role
-- (the backend), mirroring migration 008.
--
-- Run AFTER 008_revoke_exec_sql_authenticated.sql.

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       text PRIMARY KEY,
  count        int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION rate_limit_check(
  p_bucket text,
  p_max    int,
  p_window int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_count  int;
  v_start  timestamptz;
BEGIN
  -- Occasional sweep so dead buckets don't accumulate forever.
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < v_now - interval '1 hour';
  END IF;

  -- Atomic upsert: expired window resets the counter, otherwise increments.
  INSERT INTO rate_limits (bucket, count, window_start)
  VALUES (p_bucket, 1, v_now)
  ON CONFLICT (bucket) DO UPDATE SET
    count = CASE
      WHEN rate_limits.window_start < v_now - make_interval(secs => p_window) THEN 1
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < v_now - make_interval(secs => p_window) THEN v_now
      ELSE rate_limits.window_start
    END
  RETURNING count, window_start INTO v_count, v_start;

  RETURN v_count <= p_max;
END $$;

REVOKE EXECUTE ON FUNCTION rate_limit_check(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate_limit_check(text, int, int) TO service_role;

-- Verify
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_name = 'rate_limit_check' AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'rate_limit_check: EXECUTE not revoked from PUBLIC/anon/authenticated';
  END IF;
  RAISE NOTICE 'rate_limit_check: EXECUTE revoked from PUBLIC/anon/authenticated (service_role only)';
END $$;
