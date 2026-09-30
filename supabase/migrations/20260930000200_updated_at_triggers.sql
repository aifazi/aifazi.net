-- DB-enforced updated_at (round-2 plan C1).
--
-- infra_diagrams + page_layouts routers set updated_at on their own update
-- paths today; the trigger makes the guarantee hold for every future writer
-- (scripts, SQL edits, new routers). moddatetime is stock postgres contrib
-- and ships with the self-hosted supabase postgres image.

CREATE EXTENSION IF NOT EXISTS moddatetime;

DROP TRIGGER IF EXISTS set_infra_diagrams_updated_at ON public.infra_diagrams;
CREATE TRIGGER set_infra_diagrams_updated_at
    BEFORE UPDATE ON public.infra_diagrams
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS set_page_layouts_updated_at ON public.page_layouts;
CREATE TRIGGER set_page_layouts_updated_at
    BEFORE UPDATE ON public.page_layouts
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
