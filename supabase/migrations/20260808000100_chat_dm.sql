-- 030_chat_dm.sql
-- User-to-user 1:1 direct message threads (self-serve, participant-paired).
--
-- Model:
--   dm_threads   — a 1:1 conversation between two users (ordered pair party_a<b).
--                  Encryption: one 32-byte base64 room key per thread (server-
--                  held, same transport as chat_rooms.encryption_key) so the
--                  whole DM system uses the existing client-side AES-GCM.
--   dm_messages  — messages inside a thread. Same shapes as chat_messages
--                  (content, type, file_name, file_size, reply_to, reactions,
--                  edited, edited_at) so clients reuse one renderer.
--
-- Security stance: these tables are PRIVATE. Unlike chat_messages (which are
-- published to anon Realtime for public-room streaming), the DM tables get NO
-- anon/authenticated policies — all reads/writes flow through the backend's
-- service_role client, which bypasses RLS. Realtime is published so a future
-- web client can subscribe with a participant-only policy, but nothing is
-- readable by anon today.

CREATE TABLE IF NOT EXISTS public.dm_threads (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    party_a         TEXT NOT NULL,
    party_b         TEXT NOT NULL,
    encryption_key  TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(party_a, party_b)
);

CREATE INDEX IF NOT EXISTS dm_threads_party_b_idx ON public.dm_threads (party_b);
CREATE INDEX IF NOT EXISTS dm_threads_last_msg_idx ON public.dm_threads (last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.dm_messages (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id   TEXT NOT NULL,
    sender      TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL DEFAULT 'text',  -- text | image | file
    file_name   TEXT NOT NULL DEFAULT '',
    file_size   TEXT NOT NULL DEFAULT '',
    reply_to    JSONB,
    reactions   JSONB,
    edited      BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_messages_thread_created_idx
    ON public.dm_messages (thread_id, created_at DESC);

-- Fail-closed: RLS on, no anonymous/authenticated policies.
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_threads FROM anon, authenticated;
REVOKE ALL ON public.dm_messages FROM anon, authenticated;

-- Realtime publication (messages stream to a subscribed client via the backend;
-- no anon access is granted so anon keys still get nothing).
DO $$ BEGIN
  ALTER TABLE public.dm_threads REPLICA IDENTITY FULL;
  ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;