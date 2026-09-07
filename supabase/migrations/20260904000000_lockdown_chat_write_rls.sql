-- Lock down chat write path to the backend (service_role) only.
--
-- 20260801000200 granted `authenticated` INSERT/UPDATE/DELETE on
-- chat_messages, chat_rooms, chat_mutes, chat_bans and chat_members with
-- USING/WITH CHECK (true). Any logged-in Supabase user could therefore
-- create/edit/delete rooms, messages, mutes and bans straight through
-- PostgREST/Realtime, bypassing all FastAPI moderation checks.
--
-- Verified safe: no first-party client writes to these tables via REST —
-- apps/mobile and the Next.js frontend send exclusively through the FastAPI
-- backend (service_role, bypasses RLS). Clients only SUBSCRIBE (realtime
-- postgres_changes), which needs SELECT policies, not write ones.
--
-- This migration drops every permissive authenticated WRITE policy and
-- keeps all read policies untouched (anon + authenticated SELECTs stay, so
-- live chat, badges and room metadata keep working). Explicit
-- service_role policies document the intended writer.
--
-- Apply in Supabase SQL editor (self-hosted, no CLI config in repo).

-- chat_messages: drop authenticated writes (keep SELECT policies as-is).
DROP POLICY IF EXISTS authenticated_insert_chat_messages ON chat_messages;
DROP POLICY IF EXISTS authenticated_update_chat_messages ON chat_messages;
DROP POLICY IF EXISTS authenticated_delete_chat_messages ON chat_messages;

-- chat_rooms: drop authenticated writes.
DROP POLICY IF EXISTS authenticated_insert_chat_rooms ON chat_rooms;
DROP POLICY IF EXISTS authenticated_update_chat_rooms ON chat_rooms;
DROP POLICY IF EXISTS authenticated_delete_chat_rooms ON chat_rooms;

-- chat_mutes: drop authenticated writes (keep authenticated_read_chat_mutes).
DROP POLICY IF EXISTS authenticated_insert_chat_mutes ON chat_mutes;
DROP POLICY IF EXISTS authenticated_update_chat_mutes ON chat_mutes;
DROP POLICY IF EXISTS authenticated_delete_chat_mutes ON chat_mutes;

-- chat_bans: drop authenticated writes (keep authenticated_read_chat_bans).
DROP POLICY IF EXISTS authenticated_insert_chat_bans ON chat_bans;
DROP POLICY IF EXISTS authenticated_update_chat_bans ON chat_bans;
DROP POLICY IF EXISTS authenticated_delete_chat_bans ON chat_bans;

-- chat_members: drop authenticated writes (keep authenticated_read_chat_members).
DROP POLICY IF EXISTS authenticated_insert_chat_members ON chat_members;
DROP POLICY IF EXISTS authenticated_delete_chat_members ON chat_members;

-- Explicit writer: backend service_role (bypasses RLS anyway; this documents
-- intent and keeps FORCE ROW LEVEL SECURITY safe if ever enabled).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'chat_rooms', 'chat_mutes', 'chat_bans', 'chat_members']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%s ON %I', t, t);
    EXECUTE format('CREATE POLICY service_role_all_%s ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END
$$;

-- Live-update reads the frontend Realtime subscriptions need (AdminChat
-- subscribes to chat_mutes/chat_bans INSERT/DELETE with the authenticated
-- client). Reads are low-risk (mute/ban/member lists render as UI badges);
-- writes above stay backend-only.
DROP POLICY IF EXISTS auth_read_chat_mutes ON chat_mutes;
CREATE POLICY auth_read_chat_mutes ON chat_mutes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_read_chat_bans ON chat_bans;
CREATE POLICY auth_read_chat_bans ON chat_bans
  FOR SELECT TO authenticated USING (true);
