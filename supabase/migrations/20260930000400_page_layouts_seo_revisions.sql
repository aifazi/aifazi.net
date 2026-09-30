-- PageBlocks SEO fields + revision snapshots (round-2 plan A2).

ALTER TABLE public.page_layouts
    ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';

-- One row per superseded state (snapshot taken BEFORE each update, so any
-- save is rollback-able). Staff-only: read/writes go through the backend's
-- service_role; anon/authenticated get nothing.
CREATE TABLE IF NOT EXISTS public.page_layout_revisions (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    layout_id       UUID        NOT NULL REFERENCES public.page_layouts(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL DEFAULT '',
    seo_title       TEXT        NOT NULL DEFAULT '',
    seo_description TEXT        NOT NULL DEFAULT '',
    published       BOOLEAN     NOT NULL DEFAULT FALSE,
    blocks          JSONB       NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_layout_revisions_layout_idx
    ON public.page_layout_revisions (layout_id, created_at DESC);

ALTER TABLE public.page_layout_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.page_layout_revisions FROM anon, authenticated;
GRANT ALL ON public.page_layout_revisions TO service_role;

NOTIFY pgrst, 'reload schema';
