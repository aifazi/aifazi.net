-- 041_fivem_tables_rls.sql
-- Fifth RLS hardening pass — lock the FiveM/servers tables that base
-- migration.sql created WITHOUT row level security.
--
-- Affected tables: fivem_status, server_status_history, fivem_players,
-- fivem_realtime_events, txadmin_webhook_log, fivem_bans.
--
-- Why: under Supabase's default anon/authenticated table grants, anyone holding
-- the public anon key could SELECT identifiers / license & steam hashes
-- (fivem_bans.all_ids, fivem_players), live admin-panel events
-- (fivem_realtime_events), and webhook payloads (txadmin_webhook_log) straight
-- off PostgREST.
--
-- Every consumer of these tables is the backend (service_role, bypasses RLS):
--   * routers/fivem.py, routers/webhooks.py, routers/txadmin_webhook.py,
--   * utils/fivem_shared.py, routers/backup.py.
-- Neither the web app nor the mobile app touches them directly (verified by
-- grep across aifazi.net-frontend-next and apps/). A fail-closed posture
-- (RLS on, no anon/authenticated grants) is therefore correct.
--
-- service_role keeps full access; public reads still work through the
-- /api/fivem/* endpoints (backend → service_role).

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

-- ── Verify ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n     int;
  total int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('fivem_status', 'server_status_history', 'fivem_players',
                      'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans');
  IF n <> 6 THEN RAISE NOTICE '041: found % of 6 expected tables', n; END IF;

  SELECT count(*) INTO total FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('fivem_status', 'server_status_history', 'fivem_players',
                      'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans')
    AND roles::text ILIKE '%anon%';
  IF total > 0 THEN RAISE EXCEPTION '041: % anon policies still present on FiveM tables', total; END IF;

  SELECT count(*) INTO n FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN ('fivem_status', 'server_status_history', 'fivem_players',
                      'fivem_realtime_events', 'txadmin_webhook_log', 'fivem_bans')
    AND c.relrowsecurity = false;
  IF n > 0 THEN RAISE EXCEPTION '041: % FiveM tables still have RLS disabled', n; END IF;

  RAISE NOTICE '041_fivem_tables_rls completed: RLS enabled + anon/authenticated revoked on all FiveM status/history/player/event/bans tables.';
END $$;