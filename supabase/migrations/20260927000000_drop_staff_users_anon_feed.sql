-- 20260927000000_drop_staff_users_anon_feed.sql
--
-- The staff presence/profile feed used to subscribe to `staff_users` over the
-- anon key (see 20260817000200 + AdminChat.jsx `chat_staff_sync` channel),
-- protected only by a column-denylist REVOKE: any future sensitive column
-- added to staff_users would leak to the world until someone remembered to
-- extend the denylist.
--
-- New model: the feed is served by the backend at GET /api/auth/staff/feed,
-- which requires a logged-in user (get_current_user) and returns allowlisted
-- safe columns only (username/display_name, avatar, role — never
-- password_hash, tokens or other secrets). The AdminChat subscriber already
-- only subscribes when authenticated (`authState === 'ok'`), so dropping the
-- anon policy keeps it working for logged-in users; anonymous callers now
-- fail closed (401 on the endpoint, no rows on direct reads).
--
-- Access after this file: service_role (backend, bypass) + an authenticated
-- SELECT policy for the realtime presence channel. anon is revoked entirely,
-- and the old sensitive-column denylist is additionally applied to the
-- authenticated role so a residual direct read can never leak secrets.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff_users') THEN
    DROP POLICY IF EXISTS staff_users_select_anon ON public.staff_users;

    REVOKE ALL ON public.staff_users FROM anon;
    GRANT SELECT ON public.staff_users TO authenticated;
    GRANT ALL ON public.staff_users TO service_role;

    DROP POLICY IF EXISTS staff_users_select_authenticated ON public.staff_users;
    CREATE POLICY staff_users_select_authenticated ON public.staff_users
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Column denylist for the authenticated role (mirrors the old anon list):
-- a direct authenticated read/realtime payload must never carry secrets.
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['password_hash', 'refresh_token', 'totp_secret', 'totp_enabled', 'email', 'staff_permissions']
  LOOP
    IF EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'staff_users' AND column_name = col
    ) THEN
      EXECUTE format('REVOKE SELECT (%I) ON public.staff_users FROM authenticated', col);
    END IF;
  END LOOP;
END $$;

-- ── Verify ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  -- No anon SELECT policy may remain on staff_users.
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'staff_users'
    AND cmd = 'SELECT'
    AND 'anon' = ANY (roles);
  IF n > 0 THEN
    RAISE EXCEPTION '20260927000000: % anon SELECT policies still present on staff_users', n;
  END IF;

  -- The authenticated presence policy must exist (when the table exists).
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff_users') THEN
    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_users'
      AND policyname = 'staff_users_select_authenticated';
    IF n < 1 THEN
      RAISE EXCEPTION '20260927000000: staff_users_select_authenticated policy missing';
    END IF;
  END IF;

  RAISE NOTICE '20260927000000_drop_staff_users_anon_feed completed successfully';
END $$;
