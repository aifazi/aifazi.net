-- 023_monitor_checks.sql
-- Customizable uptime monitors (website / keyword / ping / port / cron / dns)
-- plus job heartbeats for "scheduled job went missing" detection.
-- Admin CRUD via /api/monitor/checks/config; results land in uptime_checks
-- with service = 'custom:<monitor_id>'.

CREATE TABLE IF NOT EXISTS public.monitor_checks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    type             TEXT NOT NULL CHECK (type IN ('website','keyword','ping','port','cron','dns')),
    target           TEXT NOT NULL,                 -- URL, host:port source, hostname, or job name
    port             INT,                           -- for 'port'
    expected         TEXT DEFAULT '',               -- keyword to look for, or expected DNS IP
    mode             TEXT NOT NULL DEFAULT 'contains' CHECK (mode IN ('contains','not_contains')),
    interval_seconds INT  NOT NULL DEFAULT 60,      -- cron: expected max gap; others: display cadence
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.monitor_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monitor_checks FROM anon, authenticated;
GRANT ALL ON public.monitor_checks TO service_role;

CREATE TABLE IF NOT EXISTS public.job_heartbeats (
    job          TEXT PRIMARY KEY,
    last_run_at  TIMESTAMPTZ,
    last_status  TEXT DEFAULT '',
    last_detail  TEXT DEFAULT '',
    updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.job_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_heartbeats FROM anon, authenticated;
GRANT ALL ON public.job_heartbeats TO service_role;
