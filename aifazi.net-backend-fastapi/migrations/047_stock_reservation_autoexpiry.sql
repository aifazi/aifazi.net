-- 047_stock_reservation_autoexpiry.sql
-- DB-level failsafe so reserved stock can never be held forever.
-- Apply AFTER 035 (stock_reservations) + 015 (store_orders).
--
-- Gap closed: reservations are released by the Stripe webhook
-- (checkout.session.expired / payment_intent.payment_failed) and by the
-- /api/cron/cleanup-pending-orders endpoint, but that cron was never scheduled,
-- and a missed webhook (delivery outage, never-entered checkout) leaves rows in
-- 'reserved' indefinitely — permanently shrinking sellable inventory.
--
-- Fix: every reservation now carries an expires_at (defaults to 30 minutes,
-- matching the backend PENDING_ORDER_TTL_MINUTES). A SECURITY DEFINER sweep
-- releases any 'reserved' row past its expiry and cancels the owning order, so
-- stock is always returned even if no webhook/cron ever fires. The sweep is
-- registered in pg_cron every 5 minutes (guarded so the migration stays
-- idempotent and harmless on projects without the extension).

-- ── 1. expires_at column ──────────────────────────────────────────────────────
ALTER TABLE public.store_stock_reservations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes');

CREATE INDEX IF NOT EXISTS idx_stock_reservations_expiry
  ON public.store_stock_reservations (status, expires_at);

-- ── 2. release_expired_stock_reservations: sweep stale holds ─────────────────
-- Finds 'reserved' rows past their expiry, releases the held quantity back to
-- the quant rows (same math as release_stock_reservations), and cancels the
-- order. Idempotent: a reservation already released/fulfilled is skipped.
CREATE OR REPLACE FUNCTION public.release_expired_stock_reservations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_released int := 0;
BEGIN
  FOR r IN
    SELECT order_id
      FROM public.store_stock_reservations
     WHERE status = 'reserved'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
     GROUP BY order_id
    FOR UPDATE
  LOOP
    -- Reuse the existing per-order release (returns qty to stock + marks rows
    -- released). If every row was already released/fulfilled by a concurrent
    -- webhook, the second call is a no-op (0 rows) — safe to repeat.
    v_released := v_released + public.release_stock_reservations(r.order_id);

    UPDATE public.store_orders
       SET status = 'cancelled', updated_at = now()
     WHERE id = r.order_id AND status = 'pending';
  END LOOP;

  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_stock_reservations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_expired_stock_reservations() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_stock_reservations() TO service_role;

-- ── 3. Schedule the sweep (pg_cron, every 5 minutes) ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'release-expired-stock-reservations',
      '*/5 * * * *',
      'SELECT public.release_expired_stock_reservations();'
    );
  ELSE
    RAISE NOTICE '047: pg_cron not installed — sweep not scheduled; the backend cleanup-pending-orders cron covers expiry.';
  END IF;
END $$;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname = 'release_expired_stock_reservations'
    AND p.proacl::text ILIKE '%anon%';
  IF n > 0 THEN RAISE NOTICE '047: release_expired_stock_reservations still executable by anon (expected 0)'; END IF;
  RAISE NOTICE '047_stock_reservation_autoexpiry completed: expires_at + pg_cron sweep installed, service_role-only.';
END $$;