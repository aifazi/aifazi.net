-- 027_email_config_rls.sql
-- Harden RLS on tables that hold live credentials or PII.
--
-- email_config.settings  → live SMTP/Brevo/Resend API keys (was fully open to
--                          anon/authenticated via Supabase default grants).
-- mail_queue             → recipient addresses + message bodies of every mail.
-- mail_templates         → email templates.
-- blog_comments          → public comments; keep read open, block anon writes.
--
-- Every statement is guarded by to_regclass() so this migration applies cleanly
-- even when a table hasn't been created in a given database yet (schema drift).

DO $do$
BEGIN
  IF to_regclass('public.email_config') IS NOT NULL THEN
    ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.email_config FROM anon, authenticated;
    GRANT ALL ON TABLE public.email_config TO service_role;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.mail_queue') IS NOT NULL THEN
    ALTER TABLE public.mail_queue ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.mail_queue FROM anon, authenticated;
    GRANT ALL ON TABLE public.mail_queue TO service_role;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.mail_templates') IS NOT NULL THEN
    ALTER TABLE public.mail_templates ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.mail_templates FROM anon, authenticated;
    GRANT ALL ON TABLE public.mail_templates TO service_role;
  END IF;
END
$do$;

DO $do$
BEGIN
  IF to_regclass('public.blog_comments') IS NOT NULL THEN
    ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.blog_comments FROM anon, authenticated;
    GRANT SELECT ON TABLE public.blog_comments TO anon, authenticated;
    DROP POLICY IF EXISTS blog_comments_select ON public.blog_comments;
    CREATE POLICY blog_comments_select ON public.blog_comments FOR SELECT TO anon, authenticated USING (true);
    GRANT ALL ON TABLE public.blog_comments TO service_role;
  END IF;
END
$do$;
