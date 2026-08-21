-- 006_email_config.sql
-- Email provider config store. Previously created manually in the Supabase
-- SQL editor; this migration makes it reproducible. Safe to re-run.
-- Run this AFTER migration.sql (and after 005_security_hardening.sql).

CREATE TABLE IF NOT EXISTS email_config (
    key         TEXT PRIMARY KEY,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO email_config (key, settings)
    VALUES ('global', '{}')
    ON CONFLICT (key) DO NOTHING;

-- Grant access to the service role (backend reads/writes via service key).
GRANT ALL ON TABLE email_config TO service_role;
