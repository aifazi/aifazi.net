-- PageBlocks layouts: Odoo-style page builder documents.
--
-- One row per page/slug. `blocks` is the ordered block tree:
--   [{id, type, props, children?[]}]  (children = column slots, max depth 2)
-- Reads of published layouts are public; all writes + draft reads go through
-- the service-role backend (require_admin). Lockdown follows the repo
-- convention (REVOKE + least-privilege read policy, no SECURITY DEFINER).
CREATE TABLE IF NOT EXISTS public.page_layouts (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    slug       TEXT        NOT NULL UNIQUE,
    title      TEXT        NOT NULL DEFAULT '',
    blocks     JSONB       NOT NULL DEFAULT '[]',
    published  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.page_layouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.page_layouts FROM anon, authenticated;
GRANT SELECT ON public.page_layouts TO anon, authenticated;
GRANT ALL ON public.page_layouts TO service_role;

DROP POLICY IF EXISTS page_layouts_public_read ON public.page_layouts;
CREATE POLICY page_layouts_public_read
    ON public.page_layouts FOR SELECT
    TO anon, authenticated
    USING (published = TRUE);

NOTIFY pgrst, 'reload schema';
