-- 20260818000100_fonts.sql
-- Supabase-folder mirror of backend migrations/046_fonts.sql.
--
-- Font library: user-uploaded font files (theme customization). The bytes live
-- in the active CDN provider (Cloudflare R2) under the `fonts/` folder; this
-- table is the authoritative registry for deletion (storage_path/provider) and
-- stores the CSS format + family metadata the renderer needs for @font-face.

CREATE TABLE IF NOT EXISTS public.fonts (
  id            uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  family        text NOT NULL,                 -- CSS font-family value (sanitized)
  weight        text NOT NULL DEFAULT '400',   -- e.g. 400 / 700
  style         text NOT NULL DEFAULT 'normal',-- normal | italic
  format        text NOT NULL,                 -- woff2 | woff | truetype | opentype
  file_url      text NOT NULL,
  storage_path  text NOT NULL,
  provider      text NOT NULL DEFAULT 'r2',
  original_name text,
  file_size     integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fonts_created_at
  ON public.fonts (created_at DESC);

ALTER TABLE public.fonts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fonts_service_role ON public.fonts;
CREATE POLICY fonts_service_role ON public.fonts
  FOR ALL USING (true) WITH CHECK (true);

REVOKE ALL ON public.fonts FROM anon, authenticated;
GRANT ALL ON public.fonts TO service_role;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='fonts') THEN
        RAISE EXCEPTION '20260818000100: fonts table not created';
    END IF;
    RAISE NOTICE '20260818000100_fonts completed successfully';
END $$;