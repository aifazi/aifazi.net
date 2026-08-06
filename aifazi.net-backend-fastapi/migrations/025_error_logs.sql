-- 025_error_logs.sql
-- Error capture store (Sentry-like, in-project). Backend exception handler +
-- frontend error boundary POST here; the monitor cron sends deduped alerts +
-- a daily digest via the mail queue.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id           uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL DEFAULT 'backend',      -- backend | frontend | cron
  error_type   text,                                  -- exception class / error.name
  message      text NOT NULL,
  stack        text,
  endpoint     text,                                  -- request path / component
  ip           text,
  user_agent   text,
  url          text,
  signature    text NOT NULL,                         -- dedup key (type+message+endpoint)
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  count        integer NOT NULL DEFAULT 1,
  notified     boolean NOT NULL DEFAULT false,        -- immediate alert sent
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_signature
  ON public.error_logs (signature);
CREATE INDEX IF NOT EXISTS idx_error_logs_last_seen
  ON public.error_logs (last_seen DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_service_role ON public.error_logs;
CREATE POLICY error_logs_service_role ON public.error_logs
  FOR ALL USING (true) WITH CHECK (true);

REVOKE ALL ON public.error_logs FROM anon, authenticated;
GRANT ALL ON public.error_logs TO service_role;
