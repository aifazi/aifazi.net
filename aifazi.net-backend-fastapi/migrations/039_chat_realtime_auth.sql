-- 039_chat_realtime_auth.sql
-- RLS policies for chat_messages based on room membership
-- Ensures only room members can read/write messages via Realtime
--
-- SECURITY FIX (audit 2026-08-17): the original file had TWO problems:
--   * chat_messages_member_insert was syntactically broken (unbalanced paren in
--     the WITH CHECK expression) — the file could not be applied.
--   * All policies were role-less (-> TO PUBLIC), which would have re-opened
--     anon read/write on chat tables over the REST surface. They are now scoped
--     to the `authenticated` role.
--   * chat_mutes_member_select / chat_bans_member_select contradicted the 037
--     lockdown (mutes/bans are service_role-only) — removed.
-- NOTE: this app authenticates with PASETO, not Supabase JWT, so auth.jwt() and
-- auth.uid() are always NULL and these policies act as fail-closed deny-alls.
-- They are kept as documented dead deny-alls (matching 022's posture).

-- Add RLS to chat_messages (already enabled, add policies)
-- Allow members to SELECT messages in rooms they're members of
DROP POLICY IF EXISTS chat_messages_member_select ON chat_messages;
CREATE POLICY chat_messages_member_select ON chat_messages
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
        )
    );

-- Allow members to INSERT messages in rooms they're members of (with speak permission)
DROP POLICY IF EXISTS chat_messages_member_insert ON chat_messages;
CREATE POLICY chat_messages_member_insert ON chat_messages
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
            AND (
                chat_members.speak_roles IS NULL OR
                chat_members.speak_roles = '{}' OR
                chat_members.speak_roles @> (SELECT to_jsonb(ARRAY[role]) FROM users WHERE id = auth.uid())
            )
        )
    );

-- Allow members to UPDATE their own messages
DROP POLICY IF EXISTS chat_messages_member_update ON chat_messages;
CREATE POLICY chat_messages_member_update ON chat_messages
    FOR UPDATE TO authenticated USING (
        sender = auth.jwt()->>'username'
        AND EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
        )
    );

-- Allow moderators/admins to DELETE any message in rooms they moderate
DROP POLICY IF EXISTS chat_messages_moderator_delete ON chat_messages;
CREATE POLICY chat_messages_moderator_delete ON chat_messages
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
            AND (
                chat_members.role = 'moderator' OR
                chat_members.role = 'admin' OR
                'manage_messages' = ANY(chat_members.permissions)
            )
        )
    );

-- Verify
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='chat_messages_member_select') THEN
        RAISE EXCEPTION '039: chat_messages_member_select policy not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='chat_messages_member_insert') THEN
        RAISE EXCEPTION '039: chat_messages_member_insert policy not created';
    END IF;
    RAISE NOTICE '039_chat_realtime_auth completed successfully (policies scoped TO authenticated)';
END $$;