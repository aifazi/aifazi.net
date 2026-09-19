-- 20260919000000_fix_open_rls_policies.sql
-- Audit round 2026-09-19: close open RLS policies and add missing WITH CHECKs.
-- Additive-only repair file: DROP POLICY IF EXISTS + CREATE POLICY scoped to
-- least privilege. Safe to replay. Does NOT touch existing migration files.

-- ── P0-2/3/4: FOR ALL USING(true) without TO service_role ───────────────────
-- These three policies were role-less (TO PUBLIC): any anon/authenticated
-- caller could read AND write the tables. Scope each to service_role.

DROP POLICY IF EXISTS "Service role manages notifications" ON public.notifications;
CREATE POLICY "Service role manages notifications" ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.store_wishlist;
CREATE POLICY "Service role full access" ON public.store_wishlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fonts_service_role ON public.fonts;
CREATE POLICY fonts_service_role ON public.fonts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── P0-5: vpn_peers holds WireGuard private + preshared keys ─────────────────
-- NOTE: private_key / preshared_key are stored server-side in plaintext.
-- Full client-side keygen (server never sees private keys) is out of scope
-- for this fix and should be done as follow-up work.
-- Access after this file: service_role (bypass) + owner RLS policies only.
-- anon is revoked entirely. authenticated keeps table-level grants ONLY so
-- the existing owner policies (auth.uid() = user_id) keep working — row
-- access stays owner-scoped; no broad SELECT remains.
REVOKE ALL ON public.vpn_peers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpn_peers TO authenticated;
GRANT ALL ON public.vpn_peers TO service_role;

-- ── P1-7/8: UPDATE policies missing WITH CHECK (privilege-escalation gap:
-- a row could be moved to another user_id on UPDATE) ─────────────────────────
DROP POLICY IF EXISTS push_tokens_update ON public.push_tokens;
CREATE POLICY push_tokens_update ON public.push_tokens
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_room_user_keys_update ON public.chat_room_user_keys;
CREATE POLICY chat_room_user_keys_update ON public.chat_room_user_keys
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── P1-9a: blog_comments UPDATE without WITH CHECK ───────────────────────────
DROP POLICY IF EXISTS "Users can update their own blog comments" ON public.blog_comments;
CREATE POLICY "Users can update their own blog comments" ON public.blog_comments
  FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

-- ── P1-9b: vpn_sessions INSERT/UPDATE must bind the session to a peer the
-- caller actually owns (prevents logging sessions against other users' peers) ─────────
DROP POLICY IF EXISTS "VPN sessions: users can insert own sessions" ON public.vpn_sessions;
CREATE POLICY "VPN sessions: users can insert own sessions" ON public.vpn_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.vpn_peers p
      WHERE p.id = vpn_sessions.peer_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "VPN sessions: users can update own sessions" ON public.vpn_sessions;
CREATE POLICY "VPN sessions: users can update own sessions" ON public.vpn_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.vpn_peers p
      WHERE p.id = vpn_sessions.peer_id AND p.user_id = auth.uid()
    )
  );

-- ── P1-14a: anon chat_rooms SELECT was USING(true) ───────────────────────────
-- No is_public column existed, so add it (default true = today's behavior,
-- no regression for existing rooms) and scope anon reads to public rooms.
-- Private rooms set is_public = false; clients must use authenticated calls
-- or the backend API (service_role) for those.
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS anon_select_chat_rooms_safe ON public.chat_rooms;
CREATE POLICY anon_select_chat_rooms_safe ON public.chat_rooms
  FOR SELECT TO anon USING (is_public IS TRUE);

-- Re-assert: E2EE key stays hidden from anon even on public rooms.
REVOKE SELECT (encryption_key) ON public.chat_rooms FROM anon;

-- ── P1-14b: staff_users anon policy ──────────────────────────────────────────
-- KEPT (not dropped): 20260817000200 documents the need (staff Realtime feed
-- over anon) and applies column-level REVOKEs on password_hash,
-- refresh_token, totp_secret, totp_enabled, email, staff_permissions.
-- Residual risk (denylist misses future sensitive columns): new sensitive
-- columns must be added to that REVOKE list, or the feed moved to
-- authenticated/service_role.

-- ── P2: vpn_server was readable by any authenticated user ────────────────────
-- Server public key + endpoint + subnet layout is infra detail. Clients must
-- fetch connection config through the backend API (service_role), never
-- directly. Revoke to service_role only.
DROP POLICY IF EXISTS "VPN server: authenticated read" ON public.vpn_server;
CREATE POLICY "VPN server: service role only" ON public.vpn_server
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.vpn_server FROM anon, authenticated;
GRANT ALL ON public.vpn_server TO service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  -- No permissive open (USING/WITH CHECK = true) PUBLIC policies may remain
  -- on the repaired tables. (Restrictive owner policies with roles={public}
  -- but a non-trivial USING, e.g. "Users see own notifications", are fine.)
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('notifications', 'store_wishlist', 'fonts', 'vpn_server')
    AND roles = '{public}'
    AND (qual = 'true' OR with_check = 'true');
  IF n > 0 THEN
    RAISE EXCEPTION '20260919000000: % open service policies still present', n;
  END IF;

  -- UPDATE policies must all carry a WITH CHECK (qual is NOT NULL).
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'push_tokens_update', 'chat_room_user_keys_update',
      'Users can update their own blog comments',
      'VPN sessions: users can update own sessions'
    )
    AND cmd = 'UPDATE' AND qual IS NOT NULL AND with_check IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '20260919000000: % UPDATE policies still missing WITH CHECK', n;
  END IF;

  RAISE NOTICE '20260919000000_fix_open_rls_policies completed successfully';
END $$;
