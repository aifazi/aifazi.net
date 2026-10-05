-- Users.authentik_id: Authentik user UUID (`sub`) linked at sign-in.
--
-- Tracked migration for the column the OIDC callback already writes
-- (routers/authentik_oidc.py) and the admin enable/disable flow reads
-- (routers/admin_actions.py `_identity_toggle`, best-effort Authentik sync).
-- Nullable TEXT: local-only accounts simply carry NULL (local-only mode).
-- No RLS/policy change: the column inherits the existing `users` policies and
-- is only ever read/written through the service-role backend.
-- Apply: psql $PROD_DSN -f supabase/migrations/20261005000001_users_authentik_id.sql

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS authentik_id TEXT;

CREATE INDEX IF NOT EXISTS users_authentik_id_idx
    ON public.users (authentik_id);

-- Make the new column visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
