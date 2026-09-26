-- 20260924000000_add_ip_bans_table.sql
--
-- The backend IP-ban enforcement (utils/rate_limit.py) reads this table on
-- every request and FAILS CLOSED when it is missing: without the table every
-- protected route 403s (and fresh deploys can never pass healthchecks if the
-- exemption ever regresses). This migration creates it.
--
-- Access: service_role only (the backend). RLS enabled with no public
-- policies, mirroring the lockdown style of earlier security migrations.

CREATE TABLE IF NOT EXISTS ip_bans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text NOT NULL UNIQUE,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE ip_bans ENABLE ROW LEVEL SECURITY;

-- Make the new table visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
