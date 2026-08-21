-- 037_chat_moderation_anon_lockdown.sql
-- Security audit: anon key (public, embedded in web bundle) retained full
-- CRUD on chat_mutes / chat_bans / chat_members via base migration.sql
-- policies. Verified live: DELETE /rest/v1/chat_mutes?id=eq.<uuid> returned
-- 204 with only the anon key. Attack scenarios:
--   * any user can unban / unmute themselves (chat moderation bypass),
--   * any user can read ban/mute lists (moderation enumeration),
--   * any user can add/remove themselves or others from chat_members
--     (role / membership tampering; custom roles were assigned in chat.py).
-- Moderation state is read/written exclusively by the backend (service_role),
-- so a fail-closed posture is correct. chat_members keeps a scoped anon
-- SELECT because AdminChat.jsx subscribes to Realtime presence as `anon`;
-- membership changes still flow through the API (service_role).

-- chat_mutes: full anon lockdown
DROP POLICY IF EXISTS anon_read_chat_mutes   ON chat_mutes;
DROP POLICY IF EXISTS anon_all_chat_mutes    ON chat_mutes;
DROP POLICY IF EXISTS anon_update_chat_mutes ON chat_mutes;
DROP POLICY IF EXISTS anon_delete_chat_mutes ON chat_mutes;
REVOKE ALL ON public.chat_mutes FROM anon;

-- chat_bans: full anon lockdown
DROP POLICY IF EXISTS anon_read_chat_bans   ON chat_bans;
DROP POLICY IF EXISTS anon_all_chat_bans    ON chat_bans;
DROP POLICY IF EXISTS anon_update_chat_bans ON chat_bans;
DROP POLICY IF EXISTS anon_delete_chat_bans ON chat_bans;
REVOKE ALL ON public.chat_bans FROM anon;

-- chat_members: anon SELECT stays (Realtime presence), writes go
DROP POLICY IF EXISTS anon_insert_chat_members ON chat_members;
DROP POLICY IF EXISTS anon_delete_chat_members ON chat_members;
REVOKE INSERT, DELETE, UPDATE ON public.chat_members FROM anon;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.chat_members FROM anon;

-- Verify
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public'
    AND ((tablename = 'chat_mutes'   AND roles::text ILIKE '%anon%')
      OR (tablename = 'chat_bans'    AND roles::text ILIKE '%anon%')
      OR (tablename = 'chat_members' AND cmd <> 'SELECT' AND roles::text ILIKE '%anon%'));
  IF n > 0 THEN RAISE EXCEPTION '037: % anon policies still present', n; END IF;
  RAISE NOTICE '037_chat_moderation_anon_lockdown completed: anon CRUD revoked on chat_mutes/chat_bans, chat_members anon writes revoked.';
END $$;
