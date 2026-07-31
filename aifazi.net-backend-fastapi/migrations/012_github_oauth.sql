-- 012_github_oauth.sql
-- GitHub OAuth identity for forum users (mirrors discord_id / steam_id).
-- The backend reads/writes the `users` table; older schema docs reference
-- `forum_users`. Both may exist, so add columns to whichever is present
-- (idempotent, fail-closed).

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS github_id       text,
      ADD COLUMN IF NOT EXISTS github_username text,
      ADD COLUMN IF NOT EXISTS github_avatar   text;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'forum_users') THEN
    ALTER TABLE public.forum_users
      ADD COLUMN IF NOT EXISTS github_id       text,
      ADD COLUMN IF NOT EXISTS github_username text,
      ADD COLUMN IF NOT EXISTS github_avatar   text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_users_github_id_unique
  ON public.forum_users (github_id)
  WHERE github_id IS NOT NULL AND github_id <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'github_id'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id_unique
      ON public.users (github_id)
      WHERE github_id IS NOT NULL AND github_id <> '';
  END IF;
END $$;
