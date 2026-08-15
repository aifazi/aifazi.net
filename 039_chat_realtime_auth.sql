-- 039_chat_realtime_auth.sql
-- RLS policies for chat_messages based on room membership
-- FIXED: chat_members.username is TEXT, compare text to text (no cast needed)

-- Allow members to SELECT messages in rooms they're members of
DROP POLICY IF EXISTS chat_messages_member_select ON chat_messages;
CREATE POLICY chat_messages_member_select ON chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
        )
    );

-- Allow members to INSERT messages (any room member can send)
DROP POLICY IF EXISTS chat_messages_member_insert ON chat_messages;
CREATE POLICY chat_messages_member_insert ON chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
        )
    );

-- Allow members to UPDATE their own messages
DROP POLICY IF EXISTS chat_messages_member_update ON chat_messages;
CREATE POLICY chat_messages_member_update ON chat_messages
    FOR UPDATE USING (
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
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_messages.room_id
            AND chat_members.username = auth.jwt()->>'username'
            AND (
                chat_members.role = 'moderator' OR
                chat_members.role = 'admin'
            )
        )
    );

-- Allow members to read mutes/bans for their rooms
DROP POLICY IF EXISTS chat_mutes_member_select ON chat_mutes;
CREATE POLICY chat_mutes_member_select ON chat_mutes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_mutes.room_id
            AND chat_members.username = auth.jwt()->>'username'
        )
    );

DROP POLICY IF EXISTS chat_bans_member_select ON chat_bans;
CREATE POLICY chat_bans_member_select ON chat_bans
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_members
            WHERE chat_members.room_id = chat_bans.room_id
            AND chat_members.username = auth.jwt()->>'username'
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
    RAISE NOTICE '039_chat_realtime_auth completed successfully';
END $$;