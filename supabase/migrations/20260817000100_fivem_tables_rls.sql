-- 20260817000100_fivem_tables_rls.sql
-- Supabase-folder mirror of backend migrations/041_fivem_tables_rls.sql.
--
-- Locks the FiveM/servers tables that base migration.sql created WITHOUT RLS:
--   fivem_status, server_status_history, fivem_players, fivem_realtime_events,
--   txadmin_webhook_log, fivem_bans.
--
-- The public anon key (embedded in the web bundle) could previously SELECT
-- player identifiers / license & steam hashes, admin-panel events, and webhook
-- payloads directly off PostgREST. All consumers are the backend via
-- service_role (which bypasses RLS), so fail-closed is correct. service_role
-- retains full access.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fivem_status', 'server_status_history', 'fivem_players',
    'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans'
  ] LOOP
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Verify
DO $$
DECLARE
  n     int;
  total int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('fivem_status', 'server_status_history', 'fivem_players',
                      'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans');
  IF n <> 6 THEN RAISE NOTICE 'fivem_tables_rls: found % of 6 expected tables', n; END IF;

  SELECT count(*) INTO total FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('fivem_status', 'server_status_history', 'fivem_players',
                      'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans')
    AND roles::text ILIKE '%anon%';
  IF total > 0 THEN RAISE EXCEPTION 'fivem_tables_rls: % anon policies still present', total; END IF;

  SELECT count(*) INTO n FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN ('fivem_status', 'server_status_history', 'fivem_players',
                      'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans')
    AND c.relrowsecurity = false;
  IF n > 0 THEN RAISE EXCEPTION 'fivem_tables_rls: % FiveM tables still have RLS disabled', n; END IF;

  RAISE NOTICE '20260817000100_fivem_tables_rls completed: RLS enabled + anon/authenticated revoked on all FiveM status/history/player/event/bans tables.';
END $$;