-- ═══════════════════════════════════════════════════════
-- Supabase Local — Bootstrap init script
-- Runs once when the DB container is first created.
-- Creates the roles and schemas needed by PostgREST.
-- ═══════════════════════════════════════════════════════

-- 1. Create auth roles
CREATE ROLE anon          WITH LOGIN PASSWORD 'anon';
CREATE ROLE authenticator WITH LOGIN PASSWORD 'authenticator' NOINHERIT;
CREATE ROLE authenticated;
CREATE ROLE service_role  WITH LOGIN PASSWORD 'service_role' BYPASSRLS;

GRANT anon, authenticated, service_role TO authenticator;

-- 2. Create auth schema (required by GoTrue)
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- 3. Main application users table (mirrors production)
CREATE SCHEMA IF NOT EXISTS public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE,
  email text,
  email_verified boolean DEFAULT false,
  role text DEFAULT 'member',
  password_hash text,
  avatar text,
  bio text,
  banned boolean DEFAULT false,
  ban_reason text,
  refresh_token text,
  staff_permissions jsonb,
  totp_enabled boolean DEFAULT false,
  totp_secret text,
  steam_id text,
  steam_username text,
  steam_avatar text,
  steam_hex text,
  discord_id text,
  discord_username text,
  discord_avatar text,
  active_identity_locked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 4. Site config table
CREATE TABLE IF NOT EXISTS public.site_config (
  id integer PRIMARY KEY DEFAULT 1,
  globalTheme text,
  lockTheme boolean DEFAULT false,
  followOsTheme boolean DEFAULT false,
  maintenanceMode boolean DEFAULT false,
  maintenanceStyle text,
  maintenanceMessage text,
  maintenanceStatus text,
  maintenanceIcon text,
  maintenanceReturnTime text,
  maintenanceShowProgress boolean DEFAULT false,
  maintenanceProgress integer DEFAULT 0,
  maintenanceShowSocial boolean DEFAULT true,
  maintenanceBgStyle text,
  subdomainMaintenance jsonb,
  inputStyle text,
  surfaceStyle text,
  bgAnimation text,
  gridPattern text,
  backgroundPattern text,
  animationPreset text DEFAULT 'smooth',
  loadingScreenStyle text DEFAULT 'terminal',
  menuStyle text,
  notifyStyle text,
  notifyPosition text,
  dialogStyle text,
  headerStyle text,
  footerStyle text,
  funDragEnabled boolean DEFAULT true,
  showRoamingRobot boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
INSERT INTO public.site_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 5. IP bans table
CREATE TABLE IF NOT EXISTS public.ip_bans (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- 6. User activity logs
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  username text,
  action text,
  detail text,
  ip text,
  created_at timestamptz DEFAULT now()
);

-- 7. Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Let anon/authenticated read necessary tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

NOTIFY pgrst, 'reload schema';
