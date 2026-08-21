-- 012_github_oauth.sql
-- GitHub OAuth identity for forum users (mirrors discord_id / steam_id).
-- The backend reads/writes the `users` table; older schema docs reference
-- `forum_users`. NOTE: in this project `forum_users` is a VIEW, so we only
-- touch it if it's a real BASE TABLE. Fully idempotent + fail-closed.

-- ── 1. Add columns to public.users ────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
      AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS github_id       text,
      ADD COLUMN IF NOT EXISTS github_username text,
      ADD COLUMN IF NOT EXISTS github_avatar   text;
  END IF;
END $$;

-- ── 2. Add columns to public.forum_users (only if it's a real table) ──────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forum_users'
      AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.forum_users
      ADD COLUMN IF NOT EXISTS github_id       text,
      ADD COLUMN IF NOT EXISTS github_username text,
      ADD COLUMN IF NOT EXISTS github_avatar   text;
  END IF;
END $$;

-- ── 3. Unique partial index on public.users.github_id ─────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
      AND table_type = 'BASE TABLE'
  ) AND EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'github_id'
  ) THEN
    EXECUTE $idx$CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id_unique
             ON public.users (github_id)
             WHERE github_id IS NOT NULL AND github_id <> ''$idx$;
  END IF;
END $$;

-- ── 4. Unique partial index on public.forum_users.github_id (if real table) ───
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forum_users'
      AND table_type = 'BASE TABLE'
  ) AND EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'forum_users' AND column_name = 'github_id'
  ) THEN
    EXECUTE $idx$CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_users_github_id_unique
             ON public.forum_users (github_id)
             WHERE github_id IS NOT NULL AND github_id <> ''$idx$;
  END IF;
END $$;
