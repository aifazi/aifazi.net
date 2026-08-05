-- ============================================================
-- AIFAZI.net — Complete Database Schema Migration
-- Run once in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- Merged from: migration.sql, migration_chat_v2.sql, migration_db_console.sql,
--              migration_email.sql, migration_helpdesk.sql, migration_indexes.sql,
--              migration_realtime.sql, migration_visitor_sessions.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- 2. FIVEM — Core Tables
-- ─────────────────────────────────────────────────────────────

-- 2a. fivem_status — single-row server status (upserted by heartbeat)
CREATE TABLE IF NOT EXISTS fivem_status (
    id              TEXT PRIMARY KEY DEFAULT 'main',
    players_online  INTEGER   NOT NULL DEFAULT 0,
    max_players     INTEGER   NOT NULL DEFAULT 48,
    server_name     TEXT      DEFAULT 'AIFAZI RP | Neon Ops City',
    server_version  TEXT,
    uptime_seconds  INTEGER   NOT NULL DEFAULT 0,
    resource_count  INTEGER   NOT NULL DEFAULT 0,
    peak_players    INTEGER   NOT NULL DEFAULT 0,
    dev_override    TEXT      CHECK (dev_override IN ('force_online','maintenance') OR dev_override IS NULL),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO fivem_status (id, players_online, max_players, server_name)
VALUES ('main', 0, 48, 'AIFAZI RP | Neon Ops City')
ON CONFLICT (id) DO NOTHING;

-- 2b. server_status_history — heartbeat snapshots (~30 s intervals)
CREATE TABLE IF NOT EXISTS server_status_history (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    players_online  INTEGER NOT NULL DEFAULT 0,
    max_players     INTEGER NOT NULL DEFAULT 48,
    uptime_seconds  INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('online','degraded','offline'))
);

CREATE INDEX IF NOT EXISTS ssh_recorded_at_idx ON server_status_history (recorded_at DESC);

-- 2c. fivem_players — cached player list snapshot
CREATE TABLE IF NOT EXISTS fivem_players (
    id         TEXT PRIMARY KEY DEFAULT 'main',
    players    JSONB     DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2d. fivem_whitelist — whitelist applications and approved players
CREATE TABLE IF NOT EXISTS fivem_whitelist (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id        TEXT NOT NULL,
    discord_name      TEXT NOT NULL,
    email             TEXT,
    steam_hex         TEXT,
    fivem_id          TEXT,
    fivem_license     TEXT,
    license_hex       TEXT,
    license2_hex      TEXT,
    character_name    TEXT NOT NULL,
    character_backstory TEXT,
    age               INTEGER,
    rp_experience     TEXT,
    why_join          TEXT,
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','denied')),
    priority_tier     TEXT,
    priority_level    INTEGER NOT NULL DEFAULT 0,
    priority_expires_at TIMESTAMPTZ,
    reviewer_note     TEXT,
    reviewed_by       TEXT,
    reviewed_at       TIMESTAMPTZ,
    applied_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at       TIMESTAMPTZ,
    txadmin_synced    BOOLEAN NOT NULL DEFAULT FALSE,
    txadmin_synced_at TIMESTAMPTZ,
    sync_source       TEXT DEFAULT 'website',
    last_played_at    TIMESTAMPTZ,
    last_played_name  TEXT,
    extra_answers     JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE fivem_whitelist
  DROP CONSTRAINT IF EXISTS fivem_whitelist_sync_source_check;

ALTER TABLE fivem_whitelist
  ADD CONSTRAINT fivem_whitelist_sync_source_check
  CHECK (sync_source IN ('website', 'website_manual', 'txadmin') OR sync_source IS NULL);

ALTER TABLE fivem_whitelist
  DROP CONSTRAINT IF EXISTS fivem_whitelist_priority_level_check;

ALTER TABLE fivem_whitelist
  ADD CONSTRAINT fivem_whitelist_priority_level_check
  CHECK (priority_level >= 0 AND priority_level <= 1000);

CREATE INDEX IF NOT EXISTS fivem_whitelist_discord_idx ON fivem_whitelist(discord_id);
CREATE INDEX IF NOT EXISTS fivem_whitelist_status_idx  ON fivem_whitelist(status);
CREATE INDEX IF NOT EXISTS fivem_wl_license_idx        ON fivem_whitelist(fivem_license);
CREATE INDEX IF NOT EXISTS fivem_wl_steam_idx          ON fivem_whitelist(steam_hex);
CREATE INDEX IF NOT EXISTS fivem_wl_discord_idx        ON fivem_whitelist(discord_id);
CREATE INDEX IF NOT EXISTS fivem_wl_status_idx         ON fivem_whitelist(status);
CREATE INDEX IF NOT EXISTS idx_fivem_whitelist_last_played
  ON fivem_whitelist (last_played_at DESC)
  WHERE last_played_at IS NOT NULL;

DROP INDEX IF EXISTS idx_fivem_whitelist_pending_sync;
CREATE INDEX idx_fivem_whitelist_pending_sync
  ON fivem_whitelist (status, txadmin_synced)
  WHERE status = 'approved' AND txadmin_synced = FALSE;

CREATE INDEX IF NOT EXISTS idx_fivem_whitelist_priority_active
  ON fivem_whitelist (status, priority_level DESC, priority_expires_at)
  WHERE status = 'approved' AND priority_level > 0;

-- 2e. fivem_bans
CREATE TABLE IF NOT EXISTS fivem_bans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier        TEXT NOT NULL,
    player_name       TEXT NOT NULL,
    reason            TEXT NOT NULL,
    banned_by         TEXT,
    banned_at         TIMESTAMPTZ DEFAULT now(),
    expires_at        TIMESTAMPTZ,
    active            BOOLEAN DEFAULT TRUE,
    unbanned_by       TEXT,
    unbanned_at       TIMESTAMPTZ,
    txadmin_action_id TEXT,
    txadmin_synced    BOOLEAN DEFAULT FALSE,
    duration          TEXT DEFAULT 'permanent',
    all_ids           JSONB DEFAULT '[]',
    source            TEXT DEFAULT 'website'
);

CREATE INDEX IF NOT EXISTS fivem_bans_identifier_idx  ON fivem_bans(identifier);
CREATE INDEX IF NOT EXISTS fivem_bans_active_idx       ON fivem_bans(active);
CREATE INDEX IF NOT EXISTS idx_fivem_bans_identifier_active ON fivem_bans (identifier, active);

-- 2f. fivem_realtime_events — live admin panel updates (Supabase Realtime)
CREATE TABLE IF NOT EXISTS fivem_realtime_events (
    id         BIGSERIAL PRIMARY KEY,
    event      TEXT        NOT NULL,
    payload    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fivem_realtime_events_ts
  ON fivem_realtime_events (created_at DESC);

-- 2g. txadmin_webhook_log — webhook delivery debugging
CREATE TABLE IF NOT EXISTS txadmin_webhook_log (
    id           BIGSERIAL    PRIMARY KEY,
    direction    TEXT         NOT NULL CHECK (direction IN ('inbound','outbound')),
    event        TEXT         NOT NULL,
    payload      JSONB        NOT NULL DEFAULT '{}',
    status_code  INTEGER,
    success      BOOLEAN      NOT NULL DEFAULT false,
    error        TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS twl_created_idx ON txadmin_webhook_log (created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. PLAYER RECORDS & SESSIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_records (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key           text        NOT NULL UNIQUE,
    license_hex           text,
    license2_hex          text,
    discord_id            text,
    steam_hex             text,
    fivem_id              text,
    player_name           text        NOT NULL,
    forum_user_id         uuid        REFERENCES forum_users(id) ON DELETE SET NULL,
    forum_username        text,
    total_sessions        int         NOT NULL DEFAULT 0,
    total_playtime_seconds bigint     NOT NULL DEFAULT 0,
    first_seen_at         timestamptz NOT NULL DEFAULT now(),
    last_seen_at          timestamptz NOT NULL DEFAULT now(),
    last_server_id        int,
    whitelist_id          uuid        REFERENCES fivem_whitelist(id) ON DELETE SET NULL,
    is_whitelisted        boolean     NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_records_license_hex   ON player_records(license_hex)  WHERE license_hex  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_records_license2_hex  ON player_records(license2_hex) WHERE license2_hex IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_records_discord_id    ON player_records(discord_id)   WHERE discord_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_records_forum_user_id ON player_records(forum_user_id) WHERE forum_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_records_last_seen     ON player_records(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS player_sessions (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id         uuid        REFERENCES player_records(id) ON DELETE CASCADE,
    license_key       text        NOT NULL,
    player_name       text        NOT NULL,
    joined_at         timestamptz NOT NULL DEFAULT now(),
    left_at           timestamptz,
    duration_seconds  int,
    server_id         int,
    disconnect_reason text,
    identifiers       jsonb       NOT NULL DEFAULT '[]',
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_sessions_player_id   ON player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_license_key  ON player_sessions(license_key);
CREATE INDEX IF NOT EXISTS idx_player_sessions_joined_at   ON player_sessions(joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_sessions_active      ON player_sessions(player_id) WHERE left_at IS NULL;

-- Trigger: auto-update player_records.updated_at
CREATE OR REPLACE FUNCTION update_player_records_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_records_updated_at ON player_records;
CREATE TRIGGER trg_player_records_updated_at
    BEFORE UPDATE ON player_records
    FOR EACH ROW EXECUTE FUNCTION update_player_records_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. DISCORD USERS (public player accounts)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discord_users (
    id              BIGSERIAL PRIMARY KEY,
    discord_id      TEXT UNIQUE NOT NULL,
    username        TEXT NOT NULL,
    discriminator   TEXT DEFAULT '0',
    avatar          TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    fivem_id        TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_users_discord_id ON discord_users(discord_id);

ALTER TABLE discord_users DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 5. FORUM USERS & IDENTITY UNIQUENESS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.forum_users
  ADD COLUMN IF NOT EXISTS discord_id      text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS discord_avatar  text,
  ADD COLUMN IF NOT EXISTS steam_id        text,
  ADD COLUMN IF NOT EXISTS steam_username  text,
  ADD COLUMN IF NOT EXISTS steam_avatar    text,
  ADD COLUMN IF NOT EXISTS totp_secret     text,
  ADD COLUMN IF NOT EXISTS totp_enabled    boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_forum_users_discord_id ON public.forum_users(discord_id);
CREATE INDEX IF NOT EXISTS idx_forum_users_email      ON public.forum_users(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_users_email_unique_ci
  ON public.forum_users (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_users_username_unique_ci
  ON public.forum_users (lower(username))
  WHERE username IS NOT NULL AND username <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_users_discord_id_unique
  ON public.forum_users (discord_id)
  WHERE discord_id IS NOT NULL AND discord_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_users_steam_id_unique
  ON public.forum_users (steam_id)
  WHERE steam_id IS NOT NULL AND steam_id <> '';

-- ─────────────────────────────────────────────────────────────
-- 6. STAFF PERMISSIONS & ADMIN
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS forum_user_id      UUID,
  ADD COLUMN IF NOT EXISTS module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_bio        TEXT,
  ADD COLUMN IF NOT EXISTS profile_avatar     TEXT,
  ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_forum_user_id
  ON public.staff_users (forum_user_id)
  WHERE forum_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_username_ci
  ON public.staff_users (LOWER(username));

ALTER TABLE public.admin_2fa
  ADD COLUMN IF NOT EXISTS email             TEXT,
  ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS username_override TEXT,
  ADD COLUMN IF NOT EXISTS profile_bio       TEXT,
  ADD COLUMN IF NOT EXISTS profile_avatar    TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- 7. APPLICATION FORMS & SUBMISSIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS application_forms (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                  TEXT NOT NULL UNIQUE,
    title                 TEXT NOT NULL,
    category              TEXT NOT NULL DEFAULT 'General',
    description           TEXT NOT NULL DEFAULT '',
    intro                 TEXT NOT NULL DEFAULT '',
    success_message       TEXT NOT NULL DEFAULT 'Application submitted. Staff will review it soon.',
    status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'draft', 'archived')),
    require_login         BOOLEAN NOT NULL DEFAULT TRUE,
    require_whitelist     BOOLEAN NOT NULL DEFAULT TRUE,
    email_template_purpose TEXT NOT NULL DEFAULT 'application_submitted',
    fields                JSONB NOT NULL DEFAULT '[]',
    approval_action       JSONB NOT NULL DEFAULT '{}',
    form_kind             TEXT NOT NULL DEFAULT 'universal',
    system_locked         BOOLEAN NOT NULL DEFAULT false,
    public_path           TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_forms_status ON application_forms(status);

ALTER TABLE application_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_forms_public_active ON application_forms;
CREATE POLICY application_forms_public_active ON application_forms
  FOR SELECT USING (status = 'active');

CREATE TABLE IF NOT EXISTS application_form_submissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id           UUID REFERENCES application_forms(id) ON DELETE SET NULL,
    form_slug         TEXT NOT NULL,
    form_title        TEXT NOT NULL,
    user_id           TEXT,
    username          TEXT,
    email             TEXT,
    answers           JSONB NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'denied', 'archived')),
    reviewer_note     TEXT,
    reviewed_by       TEXT,
    reviewed_at       TIMESTAMPTZ,
    action_status     TEXT NOT NULL DEFAULT 'none'
                      CHECK (action_status IN ('none', 'pending', 'synced', 'failed', 'skipped')),
    action_synced_at  TIMESTAMPTZ,
    action_sync_error TEXT,
    approved_action   JSONB NOT NULL DEFAULT '{}',
    action_attempts   INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_form_submissions_form   ON application_form_submissions(form_slug, status);
CREATE INDEX IF NOT EXISTS idx_application_form_submissions_user   ON application_form_submissions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_application_form_submissions_actions ON application_form_submissions(status, action_status, updated_at);

ALTER TABLE application_form_submissions ENABLE ROW LEVEL SECURITY;

-- Seed default application forms
INSERT INTO application_forms (slug, title, category, description, intro, success_message, status,
                               require_login, require_whitelist, email_template_purpose, fields,
                               approval_action, form_kind, system_locked, public_path, created_at, updated_at)
VALUES (
  'whitelist', 'Whitelist Application', 'FiveM',
  'Apply for AIFAZI RP whitelist access.',
  'Tell us who you are, what story you want to create, and how you understand serious RP.',
  'Whitelist application submitted. Staff will review it soon.',
  'active', true, false, 'whitelist_submitted',
  '[{"id":"character_name","label":"Character Full Name","type":"text","required":true,"placeholder":"e.g. Marcus Reyes"},{"id":"character_backstory","label":"Character Backstory","type":"textarea","required":true,"placeholder":"Your character background story...","min_length":80},{"id":"why_join","label":"Why do you want to join AIFAZI RP?","type":"textarea","required":true,"placeholder":"What draws you to this server?","min_length":40},{"id":"age","label":"Age","type":"number","required":true,"placeholder":"18"},{"id":"rp_experience","label":"RP Experience","type":"text","required":true,"placeholder":"FiveM, GTA RP, text RP, etc."},{"id":"roleplay_style","label":"Preferred RP Style","type":"text","required":true,"placeholder":"Civilian business, police, EMS, crime, legal..."},{"id":"availability","label":"Availability / Timezone","type":"text","required":true,"placeholder":"Asia/Dubai evenings, weekends"},{"id":"rule_scenario","label":"Rules Scenario","type":"textarea","required":true,"placeholder":"What do you do if a scene goes wrong?","min_length":60},{"id":"extra_notes","label":"Anything staff should know?","type":"textarea","required":false,"placeholder":"Optional notes for staff..."}]'::jsonb,
  '{"type":"server_whitelist"}'::jsonb,
  'whitelist', true, '/whitelist', NOW(), NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  form_kind = 'whitelist',
  system_locked = true,
  public_path = '/whitelist',
  approval_action = '{"type":"server_whitelist"}'::jsonb,
  require_login = true,
  require_whitelist = false,
  updated_at = NOW();

INSERT INTO application_forms (slug, title, category, description, intro, success_message,
                               require_login, require_whitelist, fields, approval_action)
VALUES
('staff', 'Staff Application', 'Staff', 'Apply to help moderate the community.',
 'Tell us about your moderation experience, availability, and how you handle player conflict.',
 'Staff application submitted.', TRUE, TRUE,
 '[{"id":"name","label":"Name / Preferred name","type":"text","required":true},{"id":"discord_username","label":"Discord username","type":"text","required":true},{"id":"age","label":"Age","type":"number","required":true},{"id":"availability","label":"Timezone and availability","type":"text","required":true},{"id":"experience","label":"Staff or moderation experience","type":"textarea","required":true,"min_length":80},{"id":"conflict_response","label":"How would you handle a heated player report?","type":"textarea","required":true,"min_length":80}]'::jsonb,
 '{"website_role":"moderator","game":{"type":"group","group":"staff"}}'::jsonb),
('admin', 'Admin Application', 'Staff', 'Apply for admin responsibilities.',
 'For trusted staff ready to handle escalations, logs, and player safety.',
 'Admin application submitted.', TRUE, TRUE,
 '[{"id":"name","label":"Name / Preferred name","type":"text","required":true},{"id":"discord_username","label":"Discord username","type":"text","required":true},{"id":"current_role","label":"Current community role","type":"text","required":true},{"id":"admin_experience","label":"Admin experience","type":"textarea","required":true,"min_length":100},{"id":"tools_knowledge","label":"Moderation tools you know","type":"textarea","required":true,"min_length":60},{"id":"escalation_example","label":"Describe an escalation you handled well","type":"textarea","required":true,"min_length":100}]'::jsonb,
 '{"website_role":"admin","game":{"type":"group","group":"admin"}}'::jsonb),
('moderator', 'Moderator Application', 'Staff', 'Apply to become a community moderator.',
 'Help keep chat, tickets, and RP reports clean and fair.',
 'Moderator application submitted.', TRUE, TRUE,
 '[{"id":"name","label":"Name / Preferred name","type":"text","required":true},{"id":"discord_username","label":"Discord username","type":"text","required":true},{"id":"availability","label":"Availability","type":"text","required":true},{"id":"why_mod","label":"Why do you want moderator?","type":"textarea","required":true,"min_length":80},{"id":"rules_test","label":"How do you handle toxicity without escalating?","type":"textarea","required":true,"min_length":80}]'::jsonb,
 '{"website_role":"moderator","game":{"type":"group","group":"mod"}}'::jsonb),
('police', 'Police Department Application', 'Department', 'Apply for LSPD / law enforcement RP.',
 'Show that you can create fair, scene-first police roleplay.',
 'Police application submitted.', TRUE, TRUE,
 '[{"id":"character_name","label":"Character name","type":"text","required":true},{"id":"police_rp","label":"Police RP experience","type":"textarea","required":true,"min_length":80},{"id":"scenario","label":"Traffic stop escalates. What do you do?","type":"textarea","required":true,"min_length":80},{"id":"availability","label":"Availability","type":"text","required":true}]'::jsonb,
 '{"game":{"type":"job","job":"police","grade":0}}'::jsonb),
('ambulance', 'Ambulance / EMS Application', 'Department', 'Apply for EMS roleplay.',
 'Apply for medical roleplay and emergency response.',
 'EMS application submitted.', TRUE, TRUE,
 '[{"id":"character_name","label":"Character name","type":"text","required":true},{"id":"medical_rp","label":"Medical RP experience","type":"textarea","required":true,"min_length":80},{"id":"bedside","label":"How do you keep scenes immersive?","type":"textarea","required":true,"min_length":80},{"id":"availability","label":"Availability","type":"text","required":true}]'::jsonb,
 '{"game":{"type":"job","job":"ambulance","grade":0}}'::jsonb),
('doj', 'DOJ Application', 'Department', 'Apply for DOJ / legal RP.',
 'Apply for lawyer, judge, and legal-system roleplay.',
 'DOJ application submitted.', TRUE, TRUE,
 '[{"id":"character_name","label":"Character name","type":"text","required":true},{"id":"legal_rp","label":"Legal RP experience","type":"textarea","required":true,"min_length":80},{"id":"case_example","label":"How would you argue a messy RP case fairly?","type":"textarea","required":true,"min_length":100},{"id":"availability","label":"Availability","type":"text","required":true}]'::jsonb,
 '{"game":{"type":"job","job":"lawyer","grade":0}}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  intro = EXCLUDED.intro,
  success_message = EXCLUDED.success_message,
  require_login = EXCLUDED.require_login,
  require_whitelist = EXCLUDED.require_whitelist,
  fields = EXCLUDED.fields,
  approval_action = EXCLUDED.approval_action,
  updated_at = NOW();

-- Add post_roles to forum_categories (optional role-restricted posting)
ALTER TABLE public.forum_categories ADD COLUMN IF NOT EXISTS post_roles TEXT[] DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────
-- 8. CHAT SYSTEM v2 — voice/video + role-based access + E2EE
-- ─────────────────────────────────────────────────────────────

-- Add new columns to chat_rooms
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT '{}';
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS speak_roles TEXT[] DEFAULT '{}';
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS screen_share_roles TEXT[] DEFAULT '{}';
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS encryption_key TEXT DEFAULT NULL;

-- Mute table (per-room, per-user)
CREATE TABLE IF NOT EXISTS public.chat_mutes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    muted_by TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(room_id, username)
);
CREATE INDEX IF NOT EXISTS chat_mutes_room_idx ON public.chat_mutes (room_id);
CREATE INDEX IF NOT EXISTS chat_mutes_user_idx ON public.chat_mutes (username);

-- Ban table (per-room, per-user)
CREATE TABLE IF NOT EXISTS public.chat_bans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    banned_by TEXT NOT NULL DEFAULT '',
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(room_id, username)
);
CREATE INDEX IF NOT EXISTS chat_bans_room_idx ON public.chat_bans (room_id);
CREATE INDEX IF NOT EXISTS chat_bans_user_idx ON public.chat_bans (username);

-- ── Chat room roles (custom roles per channel) ────────────────────
CREATE TABLE IF NOT EXISTS public.chat_room_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#00ff88',
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(room_id, name)
);
CREATE INDEX IF NOT EXISTS chat_room_roles_room_idx ON public.chat_room_roles (room_id);

-- ── FiveM connect tokens (single-use, short-lived) ──────────────
CREATE TABLE IF NOT EXISTS public.fivem_connect_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS fivem_connect_tokens_token_idx ON public.fivem_connect_tokens (token_id);
CREATE INDEX IF NOT EXISTS fivem_connect_tokens_user_idx ON public.fivem_connect_tokens (user_id);

-- ─────────────────────────────────────────────────────────────
-- 9. DB CONSOLE — exec_sql function
-- ─────────────────────────────────────────────────────────────

-- exec_sql: executes a single SELECT query via DB Monitor SQL Console.
-- SECURITY DEFINER so staff can run SELECT against any table.
-- HARDENED: blocks every `;` and dangerous keyword at the DB level, only
-- accepts single SELECT/WITH (read-only) statements, and EXECUTE is revoked
-- from PUBLIC/anon/authenticated (service_role only) — see migrations
-- 005/008/022. The old base build executed arbitrary SQL with zero filtering
-- and no REVOKE, which let anyone with the anon key call
-- supabase.rpc('exec_sql', {sql_text:'DROP TABLE users'}) on a fresh DB.
CREATE OR REPLACE FUNCTION exec_sql(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _result jsonb;
BEGIN
  IF position(';' in sql_text) > 0 THEN
    RAISE EXCEPTION 'exec_sql: semicolons are not allowed (single-statement SELECT only)';
  END IF;

  _normalized := regexp_replace(lower(trim(sql_text)), '\s+', ' ', 'g');

  IF _normalized ~ ANY(ARRAY[
    '^\s*(drop|alter|create|truncate|insert|update|delete|grant|revoke|vacuum|reindex|cluster|copy|call|do)\b',
    'exec_sql\s*\(',
    'pg_execute', 'pg_read_file', 'pg_write_file',
    'lo_import', 'lo_export', 'dblink',
    'pg_read_binary_file', 'pg_write_binary_file',
    'copy\s+.*\s+from\s+', 'copy\s+.*\s+to\s+',
    'security\s+definer', 'set\s+role', 'reset\s+role',
    'set\s+session\s+authorization', 'create\s+or\s+replace\s+function'
  ]) THEN
    RAISE EXCEPTION 'exec_sql: blocked dangerous operation. Only single SELECT queries are allowed.';
  END IF;

  IF _normalized ~ '^\s*with\b' AND _normalized ~ '\b(delete|insert|update)\b' THEN
    RAISE EXCEPTION 'exec_sql: blocked CTE with write operation. Only SELECT queries are allowed.';
  END IF;

  IF NOT (_normalized ~ '^\s*select\b' OR _normalized ~ '^\s*with\b') THEN
    RAISE EXCEPTION 'exec_sql: only SELECT queries are allowed. Got: %', left(sql_text, 100);
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(__q)), ''[]''::jsonb) FROM (%s) __q', sql_text) INTO _result;
  RETURN _result;
END;
$$;

-- Only the backend's service_role may call exec_sql. The anon/authenticated
-- roles must NEVER reach it over the REST surface.
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 10. EMAIL SYSTEM — mail_queue, mail_templates, seeds
-- ─────────────────────────────────────────────────────────────

-- 10a. mail_queue — outgoing email tracking
CREATE TABLE IF NOT EXISTS mail_queue (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email         TEXT NOT NULL,
    recipient_name   TEXT NOT NULL DEFAULT '',
    subject          TEXT NOT NULL DEFAULT '',
    html             TEXT NOT NULL DEFAULT '',
    text             TEXT NOT NULL DEFAULT '',
    purpose          TEXT NOT NULL DEFAULT 'other',
    status           TEXT NOT NULL DEFAULT 'pending',
    provider         TEXT NOT NULL DEFAULT 'unknown',
    provider_msg_id  TEXT NOT NULL DEFAULT '',
    error_msg        TEXT NOT NULL DEFAULT '',
    retry_count      INTEGER NOT NULL DEFAULT 0,
    tracking_data    JSONB,
    sent_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add missing columns if table already existed
ALTER TABLE mail_queue ADD COLUMN IF NOT EXISTS text            TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_queue ADD COLUMN IF NOT EXISTS recipient_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_queue ADD COLUMN IF NOT EXISTS provider_msg_id TEXT NOT NULL DEFAULT '';
ALTER TABLE mail_queue ADD COLUMN IF NOT EXISTS tracking_data   JSONB;
ALTER TABLE mail_queue ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drop old check constraint and re-add with all statuses
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'mail_queue') THEN
        ALTER TABLE mail_queue DROP CONSTRAINT IF EXISTS mail_queue_status_check;
        ALTER TABLE mail_queue ADD CONSTRAINT mail_queue_status_check
            CHECK (status IN ('pending','sending','sent','delivered','failed','cancelled','resent','retrying'));
    END IF;
END $$;

-- Back-fill NULL columns for existing rows
UPDATE mail_queue SET created_at = now() WHERE created_at IS NULL;
UPDATE mail_queue SET text = '' WHERE text IS NULL;
UPDATE mail_queue SET provider_msg_id = '' WHERE provider_msg_id IS NULL;
UPDATE mail_queue SET recipient_name = '' WHERE recipient_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_mail_queue_purpose
    ON mail_queue (purpose)
    WHERE purpose <> '';

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'mail_queue'::regclass AND attname = 'provider_msg_id') THEN
        CREATE INDEX IF NOT EXISTS idx_mail_queue_provider_msg
            ON mail_queue (provider_msg_id)
            WHERE provider_msg_id <> '';
    END IF;
END $$;

-- 10b. mail_templates — email template library
CREATE TABLE IF NOT EXISTS mail_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL DEFAULT '',
    purpose     TEXT NOT NULL UNIQUE,
    subject     TEXT NOT NULL DEFAULT '',
    html        TEXT NOT NULL DEFAULT '',
    variables   JSONB NOT NULL DEFAULT '[]',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fix column type if table already existed with text[] instead of JSONB
ALTER TABLE mail_templates DROP COLUMN IF EXISTS variables;
ALTER TABLE mail_templates ADD COLUMN variables JSONB NOT NULL DEFAULT '[]';

-- 10c. Seed email templates
-- Uses INSERT ON CONFLICT so it's safe to re-run

-- FiveM whitelist email templates
INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Whitelist Approved', 'fivem_approved',
 '[{{site_name}}] Whitelist Approved — Welcome to {{server_name}}!',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#00ff88;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#00ff88;margin:0 0 8px">Whitelist Approved ✓</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your whitelist application has been <strong style="color:#00ff88">approved</strong>.</p>
     <p style="color:#e5e7eb;line-height:1.7">You can now join the server. We look forward to seeing you in the city!</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">SERVER</p>
       <p style="margin:0;font-family:monospace;color:#22d3ee">{{server_name}}</p>
     </div>
     <p style="color:#64748b;font-size:12px">If you have any questions, visit our Discord or website.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","server_name","username"]'::jsonb, TRUE),
('Whitelist Denied', 'fivem_denied',
 '[{{site_name}}] Whitelist Application Status',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#f87171;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#f87171;margin:0 0 8px">Application Update</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your whitelist application has been <strong style="color:#f87171">reviewed</strong>.</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">REVIEWER NOTE</p>
       <p style="margin:0;color:#e5e7eb;line-height:1.6">{{reviewer_note}}</p>
     </div>
     <p style="color:#94a3b8;line-height:1.7">You may re-apply after addressing the feedback above.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","reviewer_note"]'::jsonb, TRUE),
('Whitelist Pending', 'fivem_pending',
 '[{{site_name}}] Whitelist Application Received',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#fbbf24;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#fbbf24;margin:0 0 8px">Application Received</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your whitelist application for <strong>{{server_name}}</strong> has been received and is pending staff review.</p>
     <p style="color:#e5e7eb;line-height:1.7">We will notify you by email once a decision has been made. Please allow up to 48 hours for review.</p>
     <p style="color:#64748b;font-size:12px">Check your application status anytime at aifazi.net/whitelist</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","server_name","username"]'::jsonb, TRUE),
('Whitelist Rejected', 'fivem_rejected',
 '[{{site_name}}] Whitelist Application Not Accepted',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#f87171;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#f87171;margin:0 0 8px">Application Not Accepted</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, after careful review, your application was not accepted at this time.</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">FEEDBACK</p>
       <p style="margin:0;color:#e5e7eb;line-height:1.6">{{reviewer_note}}</p>
     </div>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","reviewer_note"]'::jsonb, TRUE),
('Player Banned', 'fivem_banned',
 '[{{site_name}}] Ban Notification',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#f87171;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#f87171;margin:0 0 8px">Ban Notification</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your account has been <strong style="color:#f87171">banned</strong> from {{server_name}}.</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">REASON</p>
       <p style="margin:0;color:#e5e7eb;line-height:1.6">{{reviewer_note}}</p>
     </div>
     <p style="color:#64748b;font-size:12px">If you believe this was a mistake, please appeal on our Discord.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","server_name","username","reviewer_note"]'::jsonb, TRUE),
('Player Unbanned', 'fivem_unbanned',
 '[{{site_name}}] Account Unbanned',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#00ff88;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#00ff88;margin:0 0 8px">Account Unbanned ✓</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your ban on <strong>{{server_name}}</strong> has been lifted.</p>
     <p style="color:#e5e7eb;line-height:1.7">You are welcome to rejoin the server. We hope to see you back in the city!</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","server_name","username"]'::jsonb, TRUE),
('Whitelist Reset', 'fivem_reset',
 '[{{site_name}}] Whitelist Reset',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#fbbf24;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#fbbf24;margin:0 0 8px">Whitelist Status Reset</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your whitelist status on {{server_name}} has been reset.</p>
     <p style="color:#e5e7eb;line-height:1.7">You may need to re-apply. Please check the website for details.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","server_name","username"]'::jsonb, TRUE)
ON CONFLICT (purpose) DO UPDATE SET
    name = EXCLUDED.name, subject = EXCLUDED.subject, html = EXCLUDED.html,
    variables = EXCLUDED.variables, active = EXCLUDED.active, updated_at = now();

-- Application form templates
INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Application Submitted', 'application_submitted',
 '[{{site_name}}] {{form_title}} Received',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#00ff88;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#00ff88;margin:0 0 8px">{{form_title}} Received</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your application has been submitted and is waiting for staff review.</p>
     {{answers_table}}
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","email","form_title","form_slug","submission_id","status","answers_table"]'::jsonb, TRUE),
('Application Approved', 'application_approved',
 '[{{site_name}}] {{form_title}} Approved',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#00d4ff;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#00d4ff;margin:0 0 8px">{{form_title}} Approved ✓</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your application has been <strong style="color:#00d4ff">approved</strong>.</p>
     {{reviewer_note_section}}
     {{answers_table}}
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","email","form_title","form_slug","submission_id","status","reviewer_note","answers_table"]'::jsonb, TRUE),
('Application Denied', 'application_denied',
 '[{{site_name}}] {{form_title}} Not Approved',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#f87171;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#f87171;margin:0 0 8px">{{form_title}} Not Approved</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, after careful review your application was <strong style="color:#f87171">not approved</strong>.</p>
     {{reviewer_note_section}}
     {{answers_table}}
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","email","form_title","form_slug","submission_id","status","reviewer_note","answers_table"]'::jsonb, TRUE),
('Application Reset', 'application_reset',
 '[{{site_name}}] {{form_title}} Reset',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#fbbf24;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#fbbf24;margin:0 0 8px">{{form_title}} Reset</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your application status has been reset to <strong style="color:#fbbf24">pending</strong>.</p>
     {{reviewer_note_section}}
     {{answers_table}}
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","email","form_title","form_slug","submission_id","status","reviewer_note","answers_table"]'::jsonb, TRUE),
('Application Archived', 'application_archived',
 '[{{site_name}}] {{form_title}} Archived',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#7070a0;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#7070a0;margin:0 0 8px">{{form_title}} Archived</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your application has been <strong style="color:#7070a0">archived</strong>.</p>
     {{reviewer_note_section}}
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","email","form_title","form_slug","submission_id","status","reviewer_note","answers_table"]'::jsonb, TRUE)
ON CONFLICT (purpose) DO UPDATE SET
    name = EXCLUDED.name, subject = EXCLUDED.subject, html = EXCLUDED.html,
    variables = EXCLUDED.variables, active = EXCLUDED.active, updated_at = now();

-- Discord auth
INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Discord Welcome', 'discord_welcome',
 'Welcome to {{site_name}}, {{username}}!',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#5865f2;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#5865f2;margin:0 0 8px">Welcome, {{username}}!</h2>
     <p style="color:#94a3b8;line-height:1.7">Your Discord account has been linked to <strong>{{site_name}}</strong>.</p>
     <p style="color:#e5e7eb;line-height:1.7">You can now <a href="{{frontend_url}}/whitelist" style="color:#22d3ee">apply for whitelist</a> and check your application status at any time.</p>
     <p style="color:#94a3b8;line-height:1.7">See you in the city!</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","frontend_url"]'::jsonb, TRUE)
ON CONFLICT (purpose) DO UPDATE SET
    name = EXCLUDED.name, subject = EXCLUDED.subject, html = EXCLUDED.html,
    variables = EXCLUDED.variables, active = EXCLUDED.active, updated_at = now();

-- Helpdesk templates
INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Ticket Confirmation', 'ticket_confirmation',
 '[{{site_name}}] Ticket #{{ticket_id}} — {{subject}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#22d3ee;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#22d3ee;margin:0 0 8px">Ticket Received</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}},</p>
     <p style="color:#e5e7eb;line-height:1.7">Your ticket has been created and staff will respond shortly.</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">TICKET #{{ticket_id}}</p>
       <p style="margin:0 0 6px;color:#22d3ee;font-weight:600">{{subject}}</p>
       <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6">{{message}}</p>
     </div>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","ticket_id","subject","message"]'::jsonb, TRUE),
('Ticket Reply', 'ticket_reply',
 '[{{site_name}}] New reply on ticket #{{ticket_id}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#22d3ee;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#22d3ee;margin:0 0 8px">New Reply on Your Ticket</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}},</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">FROM {{staff_name}} ON TICKET #{{ticket_id}}</p>
       <p style="margin:0;color:#e5e7eb;line-height:1.6">{{message}}</p>
     </div>
     <p style="color:#64748b;font-size:12px">View the full conversation: <a href="{{track_url}}" style="color:#22d3ee">{{track_url}}</a></p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","ticket_id","subject","message","staff_name","track_url"]'::jsonb, TRUE)
ON CONFLICT (purpose) DO UPDATE SET
    name = EXCLUDED.name, subject = EXCLUDED.subject, html = EXCLUDED.html,
    variables = EXCLUDED.variables, active = EXCLUDED.active, updated_at = now();

-- Contact form templates
INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Contact Confirmation', 'contact_confirm',
 'Re: {{subject}} — {{site_name}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#22d3ee;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#22d3ee;margin:0 0 8px">Thank You, {{name}}!</h2>
     <p style="color:#94a3b8;line-height:1.7">We received your message and will get back to you shortly.</p>
     <p style="color:#e5e7eb;line-height:1.7">Subject: <strong>{{subject}}</strong></p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","name","subject"]'::jsonb, TRUE),
('Contact Reply', 'contact_reply',
 'Re: {{subject}} — {{site_name}}',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#22d3ee;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#22d3ee;margin:0 0 8px">Staff Reply</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{name}},</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">REPLY TO: {{subject}}</p>
       <p style="margin:0;color:#e5e7eb;line-height:1.6">{{reply}}</p>
     </div>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","name","subject","reply"]'::jsonb, TRUE)
ON CONFLICT (purpose) DO UPDATE SET
    name = EXCLUDED.name, subject = EXCLUDED.subject, html = EXCLUDED.html,
    variables = EXCLUDED.variables, active = EXCLUDED.active, updated_at = now();

-- General purpose templates
INSERT INTO mail_templates (name, purpose, subject, html, variables, active) VALUES
('Email Verification', 'verification',
 '[{{site_name}}] Verify Your Email',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#22d3ee;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#22d3ee;margin:0 0 8px">Verify Your Email</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, please verify your email address for {{site_name}}.</p>
     <div style="text-align:center;margin:24px 0">
       <a href="{{verify_url}}" style="display:inline-block;padding:12px 32px;background:#22d3ee;color:#000;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Verify Email</a>
     </div>
     <p style="color:#64748b;font-size:12px">Or copy this link: <span style="color:#22d3ee">{{verify_url}}</span></p>
     <p style="color:#64748b;font-size:11px">This link expires in 24 hours. If you did not request this, ignore this email.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","verify_url"]'::jsonb, TRUE),
('Password Reset', 'password_reset',
 '[{{site_name}}] Reset Your Password',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#fbbf24;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#fbbf24;margin:0 0 8px">Reset Your Password</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, we received a request to reset your {{site_name}} password.</p>
     <div style="text-align:center;margin:24px 0">
       <a href="{{reset_url}}" style="display:inline-block;padding:12px 32px;background:#fbbf24;color:#000;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Reset Password</a>
     </div>
     <p style="color:#64748b;font-size:12px">Or copy this link: <span style="color:#fbbf24">{{reset_url}}</span></p>
     <p style="color:#64748b;font-size:11px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","reset_url"]'::jsonb, TRUE),
('Welcome Email', 'welcome',
 'Welcome to {{site_name}}!',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#00ff88;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#00ff88;margin:0 0 8px">Welcome to {{site_name}}!</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your account has been created successfully.</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">YOUR LOGIN DETAILS</p>
       <p style="margin:0 0 4px;color:#e5e7eb;font-family:monospace;font-size:12px">Username: <strong>{{username}}</strong></p>
       <p style="margin:0;color:#e5e7eb;font-family:monospace;font-size:12px">Login URL: <a href="{{login_url}}" style="color:#22d3ee">{{login_url}}</a></p>
     </div>
     <p style="color:#64748b;font-size:12px">Please change your password after first login.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","login_url"]'::jsonb, TRUE),
('Account Created', 'account_created',
 '[{{site_name}}] Your Account Has Been Created',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#00ff88;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#00ff88;margin:0 0 8px">Account Created</h2>
     <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your {{site_name}} account has been created.</p>
     <div style="margin:20px 0;padding:16px;background:#111827;border-radius:8px;border:1px solid #1f2937">
       <p style="margin:0 0 6px;font-size:12px;color:#64748b">LOGIN</p>
       <p style="margin:0 0 4px;color:#e5e7eb;font-family:monospace;font-size:12px">Username: <strong>{{username}}</strong></p>
       <p style="margin:0 0 4px;color:#e5e7eb;font-family:monospace;font-size:12px">Password: <strong>{{password}}</strong></p>
       <p style="margin:0;color:#e5e7eb;font-family:monospace;font-size:12px">URL: <a href="{{login_url}}" style="color:#22d3ee">{{login_url}}</a></p>
     </div>
     <p style="color:#64748b;font-size:12px">Please change your password after first login for security.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name","username","password","login_url"]'::jsonb, TRUE),
('Test Email', 'test_email',
 '[{{site_name}}] Test Email',
 '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
   <div style="background:#22d3ee;padding:3px"></div>
   <div style="padding:28px">
     <h2 style="color:#22d3ee;margin:0 0 8px">Test Email</h2>
     <p style="color:#94a3b8;line-height:1.7">Your email configuration is working correctly.</p>
   </div>
   <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">{{site_name}} · aifazi.net</div>
 </div>',
 '["site_name"]'::jsonb, TRUE)
ON CONFLICT (purpose) DO UPDATE SET
    name = EXCLUDED.name, subject = EXCLUDED.subject, html = EXCLUDED.html,
    variables = EXCLUDED.variables, active = EXCLUDED.active, updated_at = now();

-- ─────────────────────────────────────────────────────────────
-- 11. HELPDESK — threaded discussion, settings, RLS, realtime
-- ─────────────────────────────────────────────────────────────

-- 11a. helpdesk_messages — threaded discussion
CREATE TABLE IF NOT EXISTS helpdesk_messages (
    id          BIGSERIAL    PRIMARY KEY,
    ticket_id   TEXT         NOT NULL,
    author_type TEXT         NOT NULL CHECK (author_type IN ('user', 'staff', 'system')),
    author_name TEXT         NOT NULL,
    author_id   TEXT,
    message     TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_messages_ticket
    ON helpdesk_messages(ticket_id, created_at);

-- 11b. helpdesk_settings — admin-configurable settings
CREATE TABLE IF NOT EXISTS helpdesk_settings (
    id        TEXT PRIMARY KEY DEFAULT 'default',
    config    JSONB NOT NULL DEFAULT '{
        "categories": ["general", "account", "technical", "billing", "report", "suggestion", "other"],
        "default_category": "general",
        "priorities": [
            {"value": "low",      "label": "Low",      "color": "#4ade80", "eta": "within 3 business days"},
            {"value": "medium",   "label": "Medium",   "color": "#fbbf24", "eta": "within 1 business day"},
            {"value": "high",     "label": "High",     "color": "#fb923c", "eta": "within 4 hours"},
            {"value": "critical", "label": "Critical", "color": "#f87171", "eta": "within 2 hours"}
        ],
        "default_priority": "medium",
        "auto_close_days": 7,
        "auto_respond_enabled": true,
        "auto_respond_message": "Thank you for your ticket. Our team will review it shortly.",
        "statuses": ["open", "in-progress", "pending", "resolved", "closed"],
        "allow_attachments": false,
        "max_attachments": 5,
        "max_file_size_mb": 10
    }'::jsonb,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by  TEXT
);

-- Seed default settings
INSERT INTO helpdesk_settings (id, config)
VALUES ('default', '{
    "categories": ["general", "account", "technical", "billing", "report", "suggestion", "other"],
    "default_category": "general",
    "priorities": [
        {"value": "low",      "label": "Low",      "color": "#4ade80", "eta": "within 3 business days"},
        {"value": "medium",   "label": "Medium",   "color": "#fbbf24", "eta": "within 1 business day"},
        {"value": "high",     "label": "High",     "color": "#fb923c", "eta": "within 4 hours"},
        {"value": "critical", "label": "Critical", "color": "#f87171", "eta": "within 2 hours"}
    ],
    "default_priority": "medium",
    "auto_close_days": 7,
    "auto_respond_enabled": true,
    "auto_respond_message": "Thank you for your ticket. Our team will review it shortly.",
    "statuses": ["open", "in-progress", "pending", "resolved", "closed"],
    "allow_attachments": false,
    "max_attachments": 5,
    "max_file_size_mb": 10
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 11c. Add message_count column to helpdesk_tickets
ALTER TABLE helpdesk_tickets
    ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;

-- 11d. Enable RLS on new tables
ALTER TABLE helpdesk_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpdesk_settings  ENABLE ROW LEVEL SECURITY;

-- Allow public read for their own ticket messages
DROP POLICY IF EXISTS helpdesk_messages_public ON helpdesk_messages;
CREATE POLICY helpdesk_messages_public ON helpdesk_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM helpdesk_tickets t
            WHERE t.id::text = ticket_id AND t.email = current_setting('request.jwt.claims', true)::json->>'email'
        )
    );

-- Staff can read all messages
DROP POLICY IF EXISTS helpdesk_messages_staff ON helpdesk_messages;
CREATE POLICY helpdesk_messages_staff ON helpdesk_messages
    FOR ALL USING (
        EXISTS (SELECT 1 FROM staff_users WHERE username = current_setting('request.jwt.claims', true)::json->>'username')
    );

-- ─────────────────────────────────────────────────────────────
-- 12. VISITOR SESSIONS — LiveVisitorBadge realtime tracking
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  last_seen  TIMESTAMPTZ DEFAULT now(),
  page       TEXT
);

-- ─────────────────────────────────────────────────────────────
-- 13. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  -- Forum indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'forum_threads') THEN
    CREATE INDEX IF NOT EXISTS idx_forum_threads_category_id ON forum_threads(category_id);
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'forum_threads' AND column_name = 'author_id') THEN
      CREATE INDEX IF NOT EXISTS idx_forum_threads_author_id   ON forum_threads(author_id);
    END IF;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'forum_replies') THEN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'forum_replies' AND column_name = 'thread_id') THEN
      CREATE INDEX IF NOT EXISTS idx_forum_replies_thread_id   ON forum_replies(thread_id);
    END IF;
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'forum_replies' AND column_name = 'author_id') THEN
      CREATE INDEX IF NOT EXISTS idx_forum_replies_author_id   ON forum_replies(author_id);
    END IF;
    CREATE INDEX IF NOT EXISTS idx_forum_replies_created_at  ON forum_replies(created_at);
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'forum_sessions') THEN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'forum_sessions' AND column_name = 'last_active') THEN
      CREATE INDEX IF NOT EXISTS idx_forum_sessions_user_id    ON forum_sessions(user_id, last_active DESC);
    ELSE
      CREATE INDEX IF NOT EXISTS idx_forum_sessions_user_id    ON forum_sessions(user_id);
    END IF;
  END IF;

  -- Blog indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'posts') THEN
    CREATE INDEX IF NOT EXISTS idx_posts_slug                ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_category            ON posts(category);
    CREATE INDEX IF NOT EXISTS idx_posts_published_created   ON posts(published, created_at DESC);
  END IF;

  -- Newsletter indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'newsletter_subs') THEN
    CREATE INDEX IF NOT EXISTS idx_newsletter_subs_status    ON newsletter_subs(status);
  END IF;

  -- Contact indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'contacts') THEN
    CREATE INDEX IF NOT EXISTS idx_contacts_created_at       ON contacts(created_at DESC);
  END IF;

  -- Banner indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'banners') THEN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'banners' AND column_name = 'expires_at') THEN
      CREATE INDEX IF NOT EXISTS idx_banners_active_expires    ON banners(active, expires_at) WHERE active = TRUE;
    END IF;
  END IF;

  -- Helpdesk indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'helpdesk_tickets') THEN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'helpdesk_tickets' AND column_name = 'user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_user_id  ON helpdesk_tickets(user_id);
    END IF;
    CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_email    ON helpdesk_tickets(email);
  END IF;

  -- Chat indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'chat_messages') THEN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'room_id') THEN
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC);
    END IF;
  END IF;

  -- IP ban indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'ip_bans') THEN
    CREATE INDEX IF NOT EXISTS idx_ip_bans_created_at        ON ip_bans(created_at DESC);
  END IF;

  -- Whitelist indexes (in addition to existing)
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'fivem_whitelist') THEN
    CREATE INDEX IF NOT EXISTS idx_fivem_wl_fivem_id         ON fivem_whitelist(fivem_id)       WHERE fivem_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_fivem_wl_email            ON fivem_whitelist(email)          WHERE email IS NOT NULL;
  END IF;

  -- Application form submission indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'application_form_submissions') THEN
    CREATE INDEX IF NOT EXISTS idx_app_submissions_created   ON application_form_submissions(created_at DESC);
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'application_form_submissions' AND column_name = 'form_id') THEN
      CREATE INDEX IF NOT EXISTS idx_app_submissions_form_status ON application_form_submissions(form_id, status);
    END IF;
  END IF;

  -- Audit log indexes
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'audit_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at     ON audit_logs(created_at DESC);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 14. SUPABASE REALTIME — enable for live tables
-- ─────────────────────────────────────────────────────────────

-- chat_messages
DO $$
BEGIN
  ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_messages REPLICA IDENTITY: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'chat_messages already in publication';
END;
$$;

-- RLS policies for chat_messages — allow anon users to read (needed for Realtime)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages
    FOR SELECT USING (true);
DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages
    FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS chat_messages_update ON chat_messages;
CREATE POLICY chat_messages_update ON chat_messages
    FOR UPDATE USING (true);
DROP POLICY IF EXISTS chat_messages_delete ON chat_messages;
CREATE POLICY chat_messages_delete ON chat_messages
    FOR DELETE USING (true);
-- Also grant anon access so Supabase Realtime subscriptions work
DROP POLICY IF EXISTS anon_read_chat_messages ON chat_messages;
CREATE POLICY anon_read_chat_messages ON chat_messages FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_insert_chat_messages ON chat_messages;
CREATE POLICY anon_insert_chat_messages ON chat_messages FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_chat_messages ON chat_messages;
CREATE POLICY anon_update_chat_messages ON chat_messages FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_chat_messages ON chat_messages;
CREATE POLICY anon_delete_chat_messages ON chat_messages FOR DELETE TO anon USING (true);

-- chat_rooms
DO $$
BEGIN
  ALTER TABLE public.chat_rooms REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_rooms REPLICA IDENTITY: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'chat_rooms already in publication';
END;
$$;

-- RLS policies for chat_rooms — allow public read for room listing
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_rooms_select ON chat_rooms;
CREATE POLICY chat_rooms_select ON chat_rooms
    FOR SELECT USING (true);
DROP POLICY IF EXISTS chat_rooms_insert ON chat_rooms;
CREATE POLICY chat_rooms_insert ON chat_rooms
    FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS chat_rooms_update ON chat_rooms;
CREATE POLICY chat_rooms_update ON chat_rooms
    FOR UPDATE USING (true);

-- ── chat_mutes RLS + realtime ────────────────────────────────
ALTER TABLE chat_mutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_chat_mutes ON chat_mutes;
CREATE POLICY anon_read_chat_mutes ON chat_mutes FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_all_chat_mutes ON chat_mutes;
CREATE POLICY anon_all_chat_mutes ON chat_mutes FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_chat_mutes ON chat_mutes;
CREATE POLICY anon_update_chat_mutes ON chat_mutes FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_chat_mutes ON chat_mutes;
CREATE POLICY anon_delete_chat_mutes ON chat_mutes FOR DELETE TO anon USING (true);
DO $$ BEGIN ALTER TABLE public.chat_mutes REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_mutes REPLICA IDENTITY: %', SQLERRM; END $$;

-- ── chat_bans RLS + realtime ─────────────────────────────────
ALTER TABLE chat_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_chat_bans ON chat_bans;
CREATE POLICY anon_read_chat_bans ON chat_bans FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_all_chat_bans ON chat_bans;
CREATE POLICY anon_all_chat_bans ON chat_bans FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_chat_bans ON chat_bans;
CREATE POLICY anon_update_chat_bans ON chat_bans FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_chat_bans ON chat_bans;
CREATE POLICY anon_delete_chat_bans ON chat_bans FOR DELETE TO anon USING (true);
DO $$ BEGIN ALTER TABLE public.chat_bans REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_bans REPLICA IDENTITY: %', SQLERRM; END $$;

-- ── chat_members RLS + realtime ───────────────────────────────
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_chat_members ON chat_members;
CREATE POLICY anon_read_chat_members ON chat_members FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_insert_chat_members ON chat_members;
CREATE POLICY anon_insert_chat_members ON chat_members FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_chat_members ON chat_members;
CREATE POLICY anon_delete_chat_members ON chat_members FOR DELETE TO anon USING (true);
DO $$ BEGIN ALTER TABLE public.chat_members REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_members REPLICA IDENTITY: %', SQLERRM; END $$;

-- ── chat_room_roles RLS + realtime ────────────────────────────
ALTER TABLE chat_room_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_chat_room_roles ON chat_room_roles;
CREATE POLICY anon_read_chat_room_roles ON chat_room_roles FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_all_chat_room_roles ON chat_room_roles;
CREATE POLICY anon_all_chat_room_roles ON chat_room_roles FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_chat_room_roles ON chat_room_roles;
CREATE POLICY anon_update_chat_room_roles ON chat_room_roles FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_delete_chat_room_roles ON chat_room_roles;
CREATE POLICY anon_delete_chat_room_roles ON chat_room_roles FOR DELETE TO anon USING (true);
DO $$ BEGIN ALTER TABLE public.chat_room_roles REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_room_roles REPLICA IDENTITY: %', SQLERRM; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_room_roles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── fivem_connect_tokens RLS ────────────────────────────────────
ALTER TABLE fivem_connect_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_fivem_tokens ON fivem_connect_tokens;
CREATE POLICY anon_read_fivem_tokens ON fivem_connect_tokens FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_insert_fivem_tokens ON fivem_connect_tokens;
CREATE POLICY anon_insert_fivem_tokens ON fivem_connect_tokens FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS anon_update_fivem_tokens ON fivem_connect_tokens;
CREATE POLICY anon_update_fivem_tokens ON fivem_connect_tokens FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- posts
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.posts REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'posts REPLICA IDENTITY: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'posts already in publication';
  WHEN undefined_table THEN RAISE NOTICE 'posts table does not exist — skipping';
END;
$$;

-- site_config
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.site_config REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'site_config REPLICA IDENTITY: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.site_config;
EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'site_config already in publication';
  WHEN undefined_table THEN RAISE NOTICE 'site_config table does not exist — skipping';
END;
$$;

-- banners
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.banners REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'banners REPLICA IDENTITY: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.banners;
EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'banners already in publication';
  WHEN undefined_table THEN RAISE NOTICE 'banners table does not exist — skipping';
END;
$$;

-- helpdesk_tickets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'helpdesk_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE helpdesk_tickets;
  END IF;
END $$;
ALTER TABLE helpdesk_tickets REPLICA IDENTITY FULL;

-- helpdesk_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'helpdesk_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE helpdesk_messages;
  END IF;
END $$;
ALTER TABLE helpdesk_messages REPLICA IDENTITY FULL;

-- visitor_sessions
ALTER TABLE visitor_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE visitor_sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── Chat moderation realtime ────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mutes; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_bans; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 14b. BLOG COMMENTS + REACTION COLUMNS
-- ─────────────────────────────────────────────────────────────

-- Forum replies: emoji reactions map (mirrors forum_threads.reactions)
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.forum_replies
    ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
END $$;

-- Posts: emoji reactions map (server-persisted, per-user)
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.posts
    ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
END $$;

-- Blog comments table
CREATE TABLE IF NOT EXISTS public.blog_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL,
  author_id   UUID,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  edited      BOOLEAN DEFAULT FALSE,
  edited_at   TIMESTAMPTZ
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_comments' AND column_name = 'post_id') THEN
    CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON public.blog_comments(post_id, created_at);
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.blog_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 15. DATA MIGRATIONS (run once, safe to re-run)
-- ─────────────────────────────────────────────────────────────

-- Back-fill existing bans (pre-migration)
UPDATE fivem_bans SET txadmin_synced = TRUE, source = 'pre_migration' WHERE txadmin_synced IS NULL;

-- Back-fill approved whitelist entries
UPDATE fivem_whitelist
   SET txadmin_synced = TRUE,
       sync_source    = COALESCE(sync_source, 'website'),
       approved_at    = COALESCE(approved_at, reviewed_at, applied_at)
 WHERE status = 'approved'
   AND (txadmin_synced IS NULL OR txadmin_synced = FALSE);

-- Repair invalid sync_source values
UPDATE fivem_whitelist
   SET sync_source = 'website'
 WHERE sync_source IN ('website_approved', 'pre_v4_migration');

UPDATE fivem_whitelist
   SET sync_source = 'txadmin'
 WHERE sync_source IN ('txadmin_join', 'txadmin_auto');

-- Fix NULL priority values
UPDATE fivem_whitelist
   SET priority_tier = NULL,
       priority_level = 0,
       priority_expires_at = NULL
 WHERE priority_level IS NULL OR priority_level < 0;

-- Mark all existing approved entries as needing sync (wl sync)
UPDATE fivem_whitelist
SET txadmin_synced = FALSE
WHERE status = 'approved' AND txadmin_synced IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 16. VERIFICATION
-- ─────────────────────────────────────────────────────────────
SELECT COUNT(*) AS invalid_sync_source_rows
  FROM fivem_whitelist
 WHERE sync_source IS NOT NULL
   AND sync_source NOT IN ('website', 'website_manual', 'txadmin');

SELECT purpose, name FROM mail_templates WHERE active = TRUE ORDER BY purpose;

SELECT 'Migration complete' AS result;
