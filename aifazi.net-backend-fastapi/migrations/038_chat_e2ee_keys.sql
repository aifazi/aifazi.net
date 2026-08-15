-- 038_chat_e2ee_keys.sql
-- End-to-end encryption: per-user encrypted room keys
-- Client generates room key, encrypts with server's public key, server stores per-user
-- Server cannot decrypt without the client's private key (stored client-side only)

-- Per-user encrypted room keys
CREATE TABLE IF NOT EXISTS public.chat_room_user_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    encrypted_key   TEXT NOT NULL,  -- Room key encrypted with user's public key (base64)
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (room_id, user_id)
);

-- Enable RLS
ALTER TABLE public.chat_room_user_keys ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own keys
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

-- Service role can manage all keys (for key rotation, admin access)
GRANT ALL ON chat_room_user_keys TO service_role;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_chat_room_user_keys_room ON chat_room_user_keys(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_user_keys_user ON chat_room_user_keys(user_id);

-- Add column to chat_rooms to track E2EE mode
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT FALSE;

-- Verify
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='chat_room_user_keys') THEN
        RAISE EXCEPTION '038: chat_room_user_keys table not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_room_user_keys' AND policyname='chat_room_user_keys_select') THEN
        RAISE EXCEPTION '038: RLS policy not created';
    END IF;
    RAISE NOTICE '038_chat_e2ee_keys completed successfully';
END $$;