-- 023_monitor_uptime_checks.sql
-- Uptime / service-monitor check history (backend routers/monitor.py).
-- Records the result of every scheduled + manual health check so the public
-- /status page and the admin Monitoring panel can render uptime % + history.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.uptime_checks (
  id          uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  service     text NOT NULL,                 -- frontend | backend | database | email | fivem
  label       text,
  status      text NOT NULL,                 -- up | down | unknown
  latency_ms  integer,
  detail      text,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uptime_checks_service_time
  ON public.uptime_checks (service, checked_at DESC);

-- Backend (service_role) reads/writes; the public API reads via service_role too.
ALTER TABLE public.uptime_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uptime_checks_service_role ON public.uptime_checks;
CREATE POLICY uptime_checks_service_role ON public.uptime_checks
  FOR ALL USING (true) WITH CHECK (true);

-- anon / authenticated have no access — the public status endpoint is served by
-- the backend (service_role), never directly via PostgREST.
REVOKE ALL ON public.uptime_checks FROM anon, authenticated;
GRANT ALL ON public.uptime_checks TO service_role;
