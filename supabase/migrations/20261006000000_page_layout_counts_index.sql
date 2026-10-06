-- PageBlocks list queries: stored block counts + hot-list index.
--
-- Mirrors the infra_diagrams B1 pattern: list endpoints must not SELECT the
-- full `blocks` jsonb (up to 500 KB per row) just to show a count. Stores the
-- count at write time (create/update/restore all set block_count) and adds
-- the (published, updated_at) index the list queries order by.
-- Apply: psql $PROD_DSN -f supabase/migrations/20261006000000_page_layout_counts_index.sql

ALTER TABLE public.page_layouts
    ADD COLUMN IF NOT EXISTS block_count integer NOT NULL DEFAULT 0;

UPDATE public.page_layouts
SET block_count = CASE
    WHEN jsonb_typeof(blocks) = 'array' THEN jsonb_array_length(blocks)
    ELSE 0
END
WHERE block_count <> CASE
    WHEN jsonb_typeof(blocks) = 'array' THEN jsonb_array_length(blocks)
    ELSE 0
END;

CREATE INDEX IF NOT EXISTS page_layouts_published_updated_idx
    ON public.page_layouts (published, updated_at DESC);

-- Make the new column visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
