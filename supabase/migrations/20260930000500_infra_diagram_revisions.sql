-- Diagram revision snapshots (round-2 plan B4).

-- One row per superseded state (snapshot taken BEFORE each update, so any
-- save is rollback-able). Staff-only: read/writes go through the backend's
-- service_role; anon/authenticated get nothing.
CREATE TABLE IF NOT EXISTS public.infra_diagram_revisions (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    diagram_id  UUID        NOT NULL REFERENCES public.infra_diagrams(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL DEFAULT '',
    published   BOOLEAN     NOT NULL DEFAULT FALSE,
    doc         JSONB       NOT NULL DEFAULT '{"nodes":[],"flows":[]}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS infra_diagram_revisions_diagram_idx
    ON public.infra_diagram_revisions (diagram_id, created_at DESC);

ALTER TABLE public.infra_diagram_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.infra_diagram_revisions FROM anon, authenticated;
GRANT ALL ON public.infra_diagram_revisions TO service_role;

NOTIFY pgrst, 'reload schema';
