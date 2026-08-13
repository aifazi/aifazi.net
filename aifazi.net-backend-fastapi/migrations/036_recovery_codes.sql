-- 036_recovery_codes.sql
-- 2FA recovery codes: bcrypt-hashed one-time backup codes stored per account.
--   * users.recovery_codes       -> jsonb array of bcrypt hashes (forum/staff users)
--   * admin_2fa.recovery_codes   -> jsonb array of bcrypt hashes (admin row)
--
-- Codes are hashed at rest so a DB leak can't be used to bypass 2FA. The
-- application only ever hands plaintext codes to the user once, at enable time
-- or when they deliberately regenerate them.
--
-- Apply in Supabase SQL Editor:
--   ALTER TABLE public.users      ADD COLUMN IF NOT EXISTS recovery_codes jsonb;
--   ALTER TABLE public.admin_2fa  ADD COLUMN IF NOT EXISTS recovery_codes jsonb;
--
-- (Stored as a standalone file for the repo history; the two ALTERs below are
--  idempotent and safe to re-run.)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS recovery_codes jsonb;

ALTER TABLE public.admin_2fa
  ADD COLUMN IF NOT EXISTS recovery_codes jsonb;
