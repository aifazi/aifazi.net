-- 045_push_tokens.sql
-- Native push notification device tokens.
--
-- Each row maps one user to one Expo push token (one per installed device).
-- Tokens are registered by the mobile app through /api/push/register, and are
-- used by the backend to fan out Expo push notifications (chat messages, DMs,
-- forum replies) to the user's devices.
--
-- Only the owner may read/modify their own rows via RLS; the backend uses the
-- service role (bypasses RLS) for sending.

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT NOT NULL DEFAULT 'android',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select ON public.push_tokens;
CREATE POLICY push_tokens_select ON public.push_tokens
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_insert ON public.push_tokens;
CREATE POLICY push_tokens_insert ON public.push_tokens
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_update ON public.push_tokens;
CREATE POLICY push_tokens_update ON public.push_tokens
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_delete ON public.push_tokens;
CREATE POLICY push_tokens_delete ON public.push_tokens
    FOR DELETE USING (user_id = auth.uid());

GRANT ALL ON public.push_tokens TO service_role;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

-- Verify
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='push_tokens') THEN
        RAISE EXCEPTION '045: push_tokens table not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_tokens' AND policyname='push_tokens_select') THEN
        RAISE EXCEPTION '045: push_tokens RLS policy not created';
    END IF;
    RAISE NOTICE '045_push_tokens completed successfully';
END $$;