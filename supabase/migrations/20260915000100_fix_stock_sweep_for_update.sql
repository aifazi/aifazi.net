-- Fix release_expired_stock_reservations: FOR UPDATE is illegal with GROUP BY
-- (Postgres 0A000, erroring every pg_cron run). Lock candidate rows in a
-- subquery, then aggregate distinct order_ids in the outer query.
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
    SELECT DISTINCT s.order_id
      FROM public.store_stock_reservations s
     WHERE s.status = 'reserved'
       AND s.expires_at IS NOT NULL
       AND s.expires_at <= now()
       AND s.ctid IN (
             SELECT locked.ctid
               FROM public.store_stock_reservations locked
              WHERE locked.status = 'reserved'
                AND locked.expires_at IS NOT NULL
                AND locked.expires_at <= now()
              FOR UPDATE SKIP LOCKED
           )
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
