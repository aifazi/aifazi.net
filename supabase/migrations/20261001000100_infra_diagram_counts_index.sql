-- Hybrid-infra audit batch 3 (B1 + B12).
--
-- B1: list endpoints were SELECTing the full `doc` jsonb (up to 500 KB per
--     row) just to count nodes/flows. Store the counts as columns, backfill
--     existing rows, and the routers select metas only.
-- B12: the hot list query filters `published` and orders by `updated_at DESC`
--     with no index — seq scan + sort on every /hybrid-infra library load.

ALTER TABLE public.infra_diagrams
    ADD COLUMN IF NOT EXISTS node_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.infra_diagrams
    ADD COLUMN IF NOT EXISTS flow_count integer NOT NULL DEFAULT 0;

UPDATE public.infra_diagrams
SET node_count = COALESCE(jsonb_array_length(doc -> 'nodes'), 0),
    flow_count = COALESCE(jsonb_array_length(doc -> 'flows'), 0)
WHERE node_count <> COALESCE(jsonb_array_length(doc -> 'nodes'), 0)
   OR flow_count <> COALESCE(jsonb_array_length(doc -> 'flows'), 0);

CREATE INDEX IF NOT EXISTS infra_diagrams_published_updated_idx
    ON public.infra_diagrams (published, updated_at DESC);

-- Make the new columns visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
