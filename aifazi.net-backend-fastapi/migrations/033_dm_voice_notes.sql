-- 033_dm_voice_notes.sql — support voice-note DM messages.
-- Adds a duration column (seconds, text) alongside the existing file fields so
-- the same message row can carry an uploaded voice clip URL in `content`.

ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS duration text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.dm_messages.duration IS
  'Playback length of a voice-note message in seconds (string, e.g. "12.4").';

-- Voice notes are uploaded through the existing /upload/chat route which already
-- accepts thread_id and returns {url, filename, size, ...} — the client sends
-- type=voice with content=url, file_name=clip.m4a, file_size=bytes, duration=s.
