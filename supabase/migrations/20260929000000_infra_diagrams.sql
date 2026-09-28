-- 20260929000000_infra_diagrams.sql
--
-- Diagram documents for the /hybrid-infra builder (Odoo-style IT editor).
-- Writes go through the backend service role (require_admin); reads of
-- published docs are public.
--
-- Access: RLS enabled. One public SELECT policy for published rows;
-- no public write policies (backend service role bypasses RLS).

CREATE TABLE IF NOT EXISTS infra_diagrams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  title      text NOT NULL DEFAULT 'Untitled diagram',
  doc        jsonb NOT NULL DEFAULT '{"nodes":[],"flows":[]}'::jsonb,
  published  boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE infra_diagrams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS infra_diagrams_public_read ON infra_diagrams;
CREATE POLICY infra_diagrams_public_read
  ON infra_diagrams FOR SELECT
  USING (published = TRUE);

-- Make the new table visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
