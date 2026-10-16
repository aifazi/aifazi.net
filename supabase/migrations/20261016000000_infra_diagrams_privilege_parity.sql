-- 20261016000000_infra_diagrams_privilege_parity.sql
--
-- R9 follow-up: re-assert least-privilege grants on public.infra_diagrams.
--
-- 20260929000000_infra_diagrams.sql enabled RLS and added the public SELECT
-- policy but omitted the REVOKE/GRANT lockdown that its sibling
-- 20260930000000_page_layouts.sql applies. On a table created by the
-- migration role, Supabase's default privileges leave whatever GRANTs
-- anon/authenticated inherited (historically ALL on new tables), so the two
-- sibling tables were not equally locked down.
--
-- Idempotent: safe to re-run. Keeps the same shape as page_layouts:
-- read-only public access, full access only to service_role.

REVOKE ALL ON public.infra_diagrams FROM anon, authenticated;
GRANT SELECT ON public.infra_diagrams TO anon, authenticated;
GRANT ALL ON public.infra_diagrams TO service_role;

DROP POLICY IF EXISTS infra_diagrams_public_read ON public.infra_diagrams;
CREATE POLICY infra_diagrams_public_read
  ON public.infra_diagrams FOR SELECT
  TO anon, authenticated
  USING (published = TRUE);

-- Make the refreshed grants/policy visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
