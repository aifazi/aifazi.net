-- 007_email_templates_redesign.sql
-- Email template redesign: outgoing emails now render from built-in, theme-aware
-- defaults in utils/email.py (palette injected from site_config.globalTheme), so
-- the old hardcoded seed rows are removed. The Mail Templates admin page falls
-- back to theme-aware defaults until staff saves a custom version.
-- Run AFTER migration.sql, 005_security_hardening.sql and 006_email_config.sql.

-- Only clear templates if staff has never customized any of them.
-- If any template has a non-null updated_at, skip the deletion.
DELETE FROM mail_templates
WHERE NOT EXISTS (SELECT 1 FROM mail_templates WHERE updated_at IS NOT NULL);
