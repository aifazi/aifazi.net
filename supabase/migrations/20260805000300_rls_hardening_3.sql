-- 022_rls_hardening_3.sql
-- Third RLS hardening pass. Apply AFTER 005 + 010.
--
-- Fixes the remaining audit findings:
--   * 005 granted the `authenticated` role full CRUD on chat_messages /
--     chat_rooms / chat_mutes / chat_bans / chat_members (USING(true)).
--     Any REGISTERED user could delete any message, edit any room, and
--     mute/ban arbitrary users over the REST surface. All chat writes go
--     through the backend's service_role, and the frontend only uses the anon
--     key for Realtime reads, so authenticated WRITE policies are dead weight
--     with privileges. They are dropped; SELECT stays for live reads.
--   * store_products.digital_file_url was readable by anon via the broad
--     catalog SELECT — paid digital goods' file URLs leaked. Column revoked.
--   * delivery_agents.phone / user_id were readable by every authenticated
--     user. Column revoked (the public tracking API already strips phone).
--   * chat_rooms.encryption_key was revoked from anon (005) but NOT from
--     authenticated. Column revoked here too.
--   * exec_sql is re-asserted hardened + service_role-only so a fresh DB that
--     only ran the base migration.sql is never left with the unguarded build.

-- ── 1. Chat: drop authenticated WRITE policies (keep SELECT) ─────────────────

DROP POLICY IF EXISTS authenticated_insert_chat_messages  ON chat_messages;
DROP POLICY IF EXISTS authenticated_update_chat_messages  ON chat_messages;
DROP POLICY IF EXISTS authenticated_delete_chat_messages  ON chat_messages;

DROP POLICY IF EXISTS authenticated_insert_chat_rooms     ON chat_rooms;
DROP POLICY IF EXISTS authenticated_update_chat_rooms     ON chat_rooms;
DROP POLICY IF EXISTS authenticated_delete_chat_rooms     ON chat_rooms;

-- chat_mutes / chat_bans: staff-only via service_role. No authenticated access.
DROP POLICY IF EXISTS authenticated_read_chat_mutes       ON chat_mutes;
DROP POLICY IF EXISTS authenticated_insert_chat_mutes     ON chat_mutes;
DROP POLICY IF EXISTS authenticated_update_chat_mutes     ON chat_mutes;
DROP POLICY IF EXISTS authenticated_delete_chat_mutes     ON chat_mutes;

DROP POLICY IF EXISTS authenticated_read_chat_bans        ON chat_bans;
DROP POLICY IF EXISTS authenticated_insert_chat_bans      ON chat_bans;
DROP POLICY IF EXISTS authenticated_update_chat_bans      ON chat_bans;
DROP POLICY IF EXISTS authenticated_delete_chat_bans      ON chat_bans;

DROP POLICY IF EXISTS authenticated_insert_chat_members   ON chat_members;
DROP POLICY IF EXISTS authenticated_delete_chat_members   ON chat_members;

-- chat_rooms.encryption_key: also hide from authenticated (005 only did anon).
REVOKE SELECT (encryption_key) ON chat_rooms FROM authenticated;

-- ── 2. Store: hide paid digital file URLs ─────────────────────────────────────
-- The catalog is browsable by anon (store_products_read USING(true)), but the
-- file URL for a paid digital good must only ever be served through the
-- backend's download endpoint (token-gated). Column revoked from anon and
-- authenticated; service_role (backend) keeps full access.
REVOKE SELECT (digital_file_url) ON public.store_products FROM anon;
REVOKE SELECT (digital_file_url) ON public.store_products FROM authenticated;

-- ── 3. Delivery agents: hide PII columns ──────────────────────────────────────
-- delivery_agents_read gives every logged-in user all columns incl. phone and
-- the agent's users.id. Phone is the sensitive one; user_id lets someone map
-- agents to accounts. Both revoked from authenticated (backend reads via
-- service_role and already strips phone from public responses).
REVOKE SELECT (phone)    ON delivery_agents FROM authenticated;
REVOKE SELECT (user_id)  ON delivery_agents FROM authenticated;

-- ── 4. exec_sql: re-assert hardened + service_role-only (belt & suspenders) ──
-- The base migration.sql ships the hardened body now, but existing DBs may
-- still have the old unguarded build. Re-run the guardrails idempotently.
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

-- ── 4b. visitor_sessions: fail-closed (anon/authenticated must not read) ─────
-- The LiveVisitorBadge widget subscribes with the anon key and streams every
-- visitor_session row (session_id, page) to any browser. Lock it down: the
-- public visitor count is served by the API (/stats/visitors/live) via the
-- service role; direct row reads are denied.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'visitor_sessions') THEN
    ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.visitor_sessions FROM anon, authenticated;
  END IF;
END $$;

-- ── 5. Notes on intentionally-fail-closed dead policies ───────────────────────
-- store_cart_own / store_orders_own / store_order_items_own / store_invoices_own /
-- store_quotes_own / delivery_* admin+agent policies compare auth.uid() against
-- public.users.id, which is a DIFFERENT id space than supabase auth.users.id.
-- They therefore never match and DENY direct REST access — which is the safe
-- outcome (the backend reads/writes these via service_role). They are kept
-- deliberately: if the app ever migrates users to auth.users.id, reconcile
-- these rather than assuming they work.

-- ── 6. Verify ─────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN
    ('chat_messages','chat_rooms','chat_mutes','chat_bans','chat_members')
    AND cmd <> 'SELECT' AND roles::text ILIKE '%authenticated%';
  IF n > 0 THEN RAISE NOTICE '022: % authenticated WRITE policies remain on chat tables (expected 0)', n; END IF;

  RAISE NOTICE '022_rls_hardening_3 completed: chat authenticated writes dropped, digital_file_url + delivery PII + chat encryption_key column-revoked, exec_sql service_role-only.';
END $$;
