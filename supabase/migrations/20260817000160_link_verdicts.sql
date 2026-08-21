-- 043_link_verdicts.sql
-- Cloudflare Radar URL-scanner verdicts for user-submitted links.
--
-- link_verdicts caches the last known Radar verdict per hostname so
-- check_link_safety() can answer instantly (DB-first, plus an in-memory tier in
-- utils/cache.py) instead of submitting + polling the scanner on every request.
--
-- Consumers: utils/link_safety.py via the service_role key (bypasses RLS).
-- The public site never reads this table, so a fail-closed posture is correct:
-- RLS enabled, no anon/authenticated grants.

CREATE TABLE IF NOT EXISTS public.link_verdicts (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    hostname   TEXT        NOT NULL,
    verdict    TEXT        NOT NULL DEFAULT 'unknown',  -- safe | malicious | unknown | error
    malicious  BOOLEAN     NOT NULL DEFAULT FALSE,
    categories JSONB       NOT NULL DEFAULT '[]',
    scan_id    TEXT        NOT NULL DEFAULT '',
    scanned_at TIMESTAMPTZ DEFAULT now()
);

-- Upserts use hostname as the conflict target, so it must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS link_verdicts_hostname_uidx
    ON public.link_verdicts (hostname);

-- Fast lookup of flagged hosts for moderation sweeps.
CREATE INDEX IF NOT EXISTS link_verdicts_malicious_idx
    ON public.link_verdicts (malicious)
    WHERE malicious = TRUE;

ALTER TABLE public.link_verdicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.link_verdicts FROM anon, authenticated;

DO $$
DECLARE
  exists_ boolean;
BEGIN
  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'link_verdicts') INTO exists_;
  IF NOT exists_ THEN
    RAISE EXCEPTION '043: link_verdicts table was not created';
  END IF;
  RAISE NOTICE '043_link_verdicts completed: table + indexes + RLS in place.';
END $$;