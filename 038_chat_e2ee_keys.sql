-- 038_chat_e2ee_keys.sql
CREATE TABLE IF NOT EXISTS public.chat_room_user_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    encrypted_key   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (room_id, user_id)
);

ALTER TABLE public.chat_room_user_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_room_user_keys_select ON chat_room_user_keys;
CREATE POLICY chat_room_user_keys_select ON chat_room_user_keys
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_room_user_keys_insert ON chat_room_user_keys;
CREATE POLICY chat_room_user_keys_insert ON chat_room_user_keys
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_room_user_keys_update ON chat_room_user_keys;
CREATE POLICY chat_room_user_keys_update ON chat_room_user_keys
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_room_user_keys_delete ON chat_room_user_keys;
CREATE POLICY chat_room_user_keys_delete ON chat_room_user_keys
    FOR DELETE USING (user_id = auth.uid());

GRANT ALL ON chat_room_user_keys TO service_role;

CREATE INDEX IF NOT EXISTS idx_chat_room_user_keys_room ON chat_room_user_keys(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_user_keys_user ON chat_room_user_keys(user_id);

ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chat_rooms' AND column_name = 'e2ee_enabled'
    ) THEN
        RAISE EXCEPTION '038: e2ee_enabled column not created';
    END IF;
    RAISE NOTICE '038_chat_e2ee_keys completed successfully';
END $$;