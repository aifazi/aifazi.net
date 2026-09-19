-- 20260919000001_fix_cron_schedule_guard.sql
-- P2: 20260819000100_stock_reservation_autoexpiry.sql schedules the pg_cron
-- sweep unconditionally, so replaying it duplicates (or errors on) the
-- 'release-expired-stock-reservations' job. Unschedule-then-schedule under
-- guards: idempotent on replay and harmless without pg_cron.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-expired-stock-reservations') THEN
      PERFORM cron.unschedule('release-expired-stock-reservations');
    END IF;
    PERFORM cron.schedule(
      'release-expired-stock-reservations',
      '*/5 * * * *',
      'SELECT public.release_expired_stock_reservations();'
    );
  ELSE
    RAISE NOTICE '20260919000001: pg_cron not installed — sweep not scheduled; the backend cleanup-pending-orders cron covers expiry.';
  END IF;
END $$;
