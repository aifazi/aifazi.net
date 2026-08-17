-- 044_chat_member_policy_cleanup.sql
-- Security audit C1 (2026-08-17): migration 039_chat_realtime_auth.sql was
-- applied to prod while its policies were role-less (-> TO PUBLIC), leaving the
-- `anon` role with:
--   * INSERT / UPDATE / DELETE on chat_messages (chat_messages_member_*)
--   * SELECT on chat_mutes / chat_bans
-- over the REST surface. 039 has been fixed in-repo (syntax + TO authenticated),
-- but the live PUBLIC policies must be dropped explicitly. chat_messages keeps
-- its scoped anon SELECT (chat_messages_select_public from 010) for Realtime.

-- chat_messages: drop the PUBLIC member policies
DROP POLICY IF EXISTS chat_messages_member_select     ON chat_messages;
DROP POLICY IF EXISTS chat_messages_member_insert     ON chat_messages;
DROP POLICY IF EXISTS chat_messages_member_update     ON chat_messages;
DROP POLICY IF EXISTS chat_messages_moderator_delete  ON chat_messages;

-- chat_mutes / chat_bans: drop PUBLIC member SELECT (service_role-only per 037)
DROP POLICY IF EXISTS chat_mutes_member_select        ON chat_mutes;
DROP POLICY IF EXISTS chat_bans_member_select         ON chat_bans;

-- Verify: no chat table may have a policy scoped to PUBLIC
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('chat_messages','chat_mutes','chat_bans','chat_members','chat_room_roles','chat_rooms')
    AND roles::text ILIKE '%public%';
  IF n > 0 THEN RAISE EXCEPTION '044: % PUBLIC policies still present on chat tables', n; END IF;
  RAISE NOTICE '044_chat_member_policy_cleanup completed: PUBLIC chat policies dropped.';
END $$;
