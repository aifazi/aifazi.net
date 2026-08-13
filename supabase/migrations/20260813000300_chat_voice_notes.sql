-- 036_chat_voice_notes.sql
-- Add voice-note duration to room chat messages.
--
-- Background: DM voice notes already store `duration` on dm_messages (the DM
-- router persists it). Room chat messages are sent by BOTH the mobile app and
-- the web chat over /chat/rooms/{room}/messages with type='voice' + duration.
-- This migration guarantees the column exists on chat_messages so the shared
-- backend insert succeeds regardless of when/how the base schema was created.
--
-- The column is created IF NOT EXISTS so this migration is idempotent and safe
-- to apply against both fresh and long-lived databases.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS duration text DEFAULT '' NOT NULL;

-- Index isn't needed (we never query by duration); only ever read alongside a
-- message row. Nothing to REVOKE here — chat_messages access is already gated
-- by the RLS hardening migrations (the backend writes via service role).
