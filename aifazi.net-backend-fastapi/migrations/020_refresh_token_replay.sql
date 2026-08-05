-- 020_refresh_token_replay.sql
-- Fixes refresh-token replay: the /refresh endpoint previously accepted ANY
-- decodable, unexpired refresh token even after it was rotated out of the DB,
-- so a leaked/stale token stayed valid for its full 7-day window.
--
-- The fix keeps the single previous generation plus a rotation timestamp.
-- A refresh rotates current -> previous, and a presented token matching
-- "previous" is accepted ONLY within a short grace window (default 30s) after
-- the rotation, which keeps the two-tab refresh race working while bounding
-- replay of a stolen token to seconds instead of days.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS previous_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_rotated_at TIMESTAMPTZ;

-- No indexes needed — lookups are by user id, not token.
