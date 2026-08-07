-- 027_email_config_rls.sql
-- Harden RLS on tables that hold live credentials or PII.
--
-- email_config.settings  → live SMTP/Brevo/Resend API keys (was fully open to
--                          anon/authenticated via Supabase default grants).
-- mail_queue             → recipient addresses + message bodies of every mail.
-- mail_templates         → email templates (may embed provider credentials).
-- blog_comments          → public comments; keep read open, block anon writes.

ALTER TABLE public.email_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_comments  ENABLE ROW LEVEL SECURITY;

-- Credentials / mail queue / templates: backend-only (service_role).
REVOKE ALL ON TABLE public.email_config   FROM anon, authenticated;
REVOKE ALL ON TABLE public.mail_queue     FROM anon, authenticated;
REVOKE ALL ON TABLE public.mail_templates FROM anon, authenticated;

-- blog_comments: anonymous reads stay open; INSERT/UPDATE/DELETE are revoked
-- so unauthenticated REST calls can no longer spam the table.
REVOKE ALL ON TABLE public.blog_comments FROM anon, authenticated;
GRANT SELECT ON TABLE public.blog_comments TO anon, authenticated;
CREATE POLICY blog_comments_select ON public.blog_comments FOR SELECT TO anon, authenticated USING (true);

-- service_role keeps full access (the backend reads/writes via the service key).
GRANT ALL ON TABLE public.email_config   TO service_role;
GRANT ALL ON TABLE public.mail_queue     TO service_role;
GRANT ALL ON TABLE public.mail_templates TO service_role;
GRANT ALL ON TABLE public.blog_comments  TO service_role;
