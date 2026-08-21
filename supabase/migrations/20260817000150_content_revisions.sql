-- 042_content_revisions.sql
-- Version history for the global inline-edit / content_blocks system.
--
-- Every PUT /content/:key snapshots the PREVIOUS value into content_revisions
-- (max 50 per key), so admins can audit and restore past versions from the
-- Content Manager / Page Builder without a git deploy.
--
-- Consumers: routers/content.py via service_role (bypasses RLS). The public
-- site never touches this table directly, so a fail-closed posture is correct:
-- RLS enabled, no anon/authenticated grants.

CREATE TABLE IF NOT EXISTS public.content_revisions (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    key        TEXT        NOT NULL,
    value      JSONB,
    editor     TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_revisions_key_idx
    ON public.content_revisions (key, created_at DESC);

ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_revisions FROM anon, authenticated;

DO $$
DECLARE
  exists_ boolean;
BEGIN
  SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'content_revisions') INTO exists_;
  IF NOT exists_ THEN
    RAISE EXCEPTION '042: content_revisions table was not created';
  END IF;
  RAISE NOTICE '042_content_revisions completed: table + index + RLS in place.';
END $$;