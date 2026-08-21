-- 032_chat_read_state.sql
-- Per-user, per-room read markers power the chat sidebar unread badges over the
-- authenticated API instead of the anon-keyed Supabase Realtime stream. Mirrors
-- dm_read_state (031): backend-only writes via service_role; anon/authenticated
-- never touch it directly.
CREATE TABLE IF NOT EXISTS public.chat_read_state (
    room_id      TEXT NOT NULL,
    username     TEXT NOT NULL,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (room_id, username)
);

ALTER TABLE public.chat_read_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_read_state FROM anon, authenticated;