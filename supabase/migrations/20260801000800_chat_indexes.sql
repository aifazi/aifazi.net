-- 011_chat_indexes.sql
-- Chat history performance.
--   1) Composite (room_id, created_at DESC) index — serves the hot "latest N
--      messages in a room" fetch used by the in-memory history cache.
--   2) created_at DESC index — serves cursor-based pagination (`before`).
-- Both are idempotent (CREATE INDEX IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON public.chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
  ON public.chat_messages (created_at DESC);

-- Keep Supabase Realtime publishing chat_messages (idempotent)
DO $$
BEGIN
  ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_messages REPLICA IDENTITY: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'chat_messages already in publication';
END;
$$;
