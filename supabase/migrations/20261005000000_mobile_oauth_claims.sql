-- Mobile OAuth one-time exchange codes (H2/C6 audit round 7).
--
-- Tracked migration for the mobile_oauth_claims table (previously created by
-- hand via the SQL editor). Service-role only: RLS enabled with no public
-- policies, plus indexes for consume + purge paths.
-- Apply: psql $PROD_DSN -f supabase/migrations/20261005000000_mobile_oauth_claims.sql

CREATE TABLE IF NOT EXISTS public.mobile_oauth_claims (
    code_hash   TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    provider    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
);

ALTER TABLE public.mobile_oauth_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mobile_oauth_claims FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS mobile_oauth_claims_created_idx
    ON public.mobile_oauth_claims (created_at DESC);

CREATE INDEX IF NOT EXISTS mobile_oauth_claims_unconsumed_idx
    ON public.mobile_oauth_claims (consumed_at) WHERE consumed_at IS NULL;

-- Make the new table visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
