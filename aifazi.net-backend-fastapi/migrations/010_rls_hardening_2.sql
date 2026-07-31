-- 010_rls_hardening_2.sql
-- Security audit H1 / H2 / M3 — apply AFTER 005_security_hardening.sql + 009.
--
-- H1  — Chat RLS was still broken:
--        * migration.sql created chat_messages/chat_rooms policies with NO role
--          clause (-> TO PUBLIC), so anon retained full CRUD.
--        * 005 tried to DROP `anon_insert_chat_rooms` etc., but those policy
--          names never existed -> no-ops; the PUBLIC chat_rooms_insert/update
--          policies kept applying to anon.
--        * chat_room_roles still had anon INSERT/UPDATE/DELETE.
--        * fivem_connect_tokens had anon SELECT/INSERT/UPDATE (M3).
--
-- H2  — RLS was never enabled on users / staff_users / admin_2fa /
--        helpdesk_tickets / fivem_whitelist / player_records / player_sessions,
--        and discord_users was explicitly DISABLE ROW LEVEL SECURITY. The anon
--        key could therefore read password_hash / refresh_token / totp_secret /
--        identity data straight off the REST surface. Backend reads go through
--        the service_role key, which bypasses RLS, so locking these down does
--        not affect the app.
--
-- NOTE on chat_messages anon SELECT: the staff/public chat consumes live
-- updates via Supabase Realtime, which runs as the `anon` role. To keep live
-- messages working for public rooms while closing the "anon can read every
-- room incl. private/role-restricted ones" hole, anon SELECT is scoped to rooms
-- with an empty allowed_roles array. Private (allowed_roles-set) rooms are no
-- longer readable by anon; their history still loads via the API (service_role).

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. CHAT — remove PUBLIC / anon write access (H1)
-- ══════════════════════════════════════════════════════════════════════════════

-- chat_messages: drop the role-less (PUBLIC) policies from migration.sql and the
-- broad anon SELECT; recreate a scoped anon SELECT for public-room Realtime.
DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
DROP POLICY IF EXISTS chat_messages_update ON chat_messages;
DROP POLICY IF EXISTS chat_messages_delete ON chat_messages;
DROP POLICY IF EXISTS anon_read_chat_messages ON chat_messages;
DROP POLICY IF EXISTS anon_insert_chat_messages ON chat_messages;
DROP POLICY IF EXISTS anon_update_chat_messages ON chat_messages;
DROP POLICY IF EXISTS anon_delete_chat_messages ON chat_messages;
DROP POLICY IF EXISTS chat_messages_select_public ON chat_messages;

CREATE POLICY chat_messages_select_public ON chat_messages
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE r.id::text = chat_messages.room_id::text
      AND COALESCE(r.allowed_roles, '{}') = '{}'
  ));

-- chat_rooms: drop the role-less INSERT/UPDATE (anon could create/edit rooms).
-- anon_select_chat_rooms_safe (from 005) already covers room metadata reads,
-- with column-level REVOKE on encryption_key.
DROP POLICY IF EXISTS chat_rooms_insert ON chat_rooms;
DROP POLICY IF EXISTS chat_rooms_update ON chat_rooms;

-- chat_room_roles: anon SELECT stays (role badges render in chat); anon writes go.
DROP POLICY IF EXISTS anon_insert_chat_room_roles ON chat_room_roles;
DROP POLICY IF EXISTS anon_all_chat_room_roles ON chat_room_roles;
DROP POLICY IF EXISTS anon_update_chat_room_roles ON chat_room_roles;
DROP POLICY IF EXISTS anon_delete_chat_room_roles ON chat_room_roles;

-- fivem_connect_tokens (M3): no anon access at all — single-use connect tokens
-- are created/consumed by the backend via service_role only.
DROP POLICY IF EXISTS anon_read_fivem_tokens ON fivem_connect_tokens;
DROP POLICY IF EXISTS anon_insert_fivem_tokens ON fivem_connect_tokens;
DROP POLICY IF EXISTS anon_update_fivem_tokens ON fivem_connect_tokens;
REVOKE ALL ON public.fivem_connect_tokens FROM anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CREDENTIAL / IDENTITY TABLES — enable RLS + lock anon out (H2)
-- ══════════════════════════════════════════════════════════════════════════════

-- Every table below is only ever touched by the backend (service_role), so a
-- fail-closed posture (RLS on, no anon policies, no anon grants) is correct.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'forum_users', 'staff_users', 'admin_2fa',
    'fivem_whitelist', 'player_records', 'player_sessions',
    'helpdesk_tickets', 'helpdesk_messages',
    'forum_sessions', 'admin_sessions',
    'audit_logs', 'auth_logs', 'user_activity_logs'
  ] LOOP
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- discord_users: previously DISABLE ROW LEVEL SECURITY in migration.sql.
-- Re-enable RLS and revoke anon (backend reads via service_role).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discord_users') THEN
    ALTER TABLE public.discord_users ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.discord_users FROM anon;
  END IF;
END $$;

-- staff_users: the staff-chat presence/profile feed subscribes to staff_users
-- over Realtime as `anon`, so keep a SELECT policy for anon but hide the
-- sensitive columns (password/refresh/totp) at the column level if present.
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

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Verify
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'chat_messages'
    AND policyname IN ('chat_messages_select', 'chat_messages_insert',
                       'chat_messages_update', 'chat_messages_delete',
                       'anon_read_chat_messages', 'anon_insert_chat_messages',
                       'anon_update_chat_messages', 'anon_delete_chat_messages');
  IF n > 0 THEN RAISE EXCEPTION 'chat_messages: % PUBLIC/anon policies still present', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'chat_rooms'
    AND policyname IN ('chat_rooms_insert', 'chat_rooms_update');
  IF n > 0 THEN RAISE EXCEPTION 'chat_rooms: % PUBLIC write policies still present', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'chat_room_roles'
    AND cmd <> 'SELECT' AND roles::text ILIKE '%anon%';
  IF n > 0 THEN RAISE EXCEPTION 'chat_room_roles: % anon write policies still present', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'fivem_connect_tokens' AND roles::text ILIKE '%anon%';
  IF n > 0 THEN RAISE EXCEPTION 'fivem_connect_tokens: % anon policies still present', n; END IF;

  RAISE NOTICE '010_rls_hardening_2 completed: chat writes locked to service_role, anon chat reads scoped to public rooms, fivem tokens anon-locked, RLS enabled on credential/identity tables.';
END $$;
