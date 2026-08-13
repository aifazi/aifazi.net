-- 035_stock_reservations.sql
-- Atomic stock reservation for the product checkout flow.
-- Apply AFTER 021 (decrement_quant) + 018 (store_stock_quant) + 015 (store_orders).
--
-- Problem fixed: the checkout validated against store_products.stock_qty and only
-- decremented inventory at the Stripe webhook AFTER payment. Two concurrent
-- buyers could both pass the availability check, then the webhook's
-- decrement_quant() clamped the second one to NULL (insufficient stock) — so a
-- customer was charged for an item that was already sold. That is an oversell.
--
-- Fix: a reservation is taken atomically at checkout (decrementing the quant row
-- exactly like decrement_quant, but recording the hold in store_stock_reservations).
--   * payment succeeds   -> fulfill_stock_reservations() marks holds fulfilled
--                            (the quant was already decremented at reserve time)
--   * session expires /  -> release_stock_reservations() adds the held qty back
--     payment failed        and marks the holds released
--
-- All three functions are SECURITY DEFINER + service_role-only (same model as
-- decrement_quant in 021), so the anon/authenticated REST surface can never
-- call them. Rows in store_stock_reservations are service_role-only too.

-- ── 1. Reservation table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_stock_reservations (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id      UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
    product_id    UUID REFERENCES public.store_products(id) ON DELETE CASCADE,
    variant_id    UUID REFERENCES public.store_product_variants(id) ON DELETE CASCADE,
    location_id   UUID REFERENCES public.store_locations(id) ON DELETE CASCADE,
    quantity      INT  NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'reserved',  -- reserved | fulfilled | released
    created_at    TIMESTAMPTZ DEFAULT now(),
    fulfilled_at  TIMESTAMPTZ,
    released_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order
    ON public.store_stock_reservations (order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status
    ON public.store_stock_reservations (status);

ALTER TABLE public.store_stock_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_stock_reservations FROM PUBLIC;
REVOKE ALL ON public.store_stock_reservations FROM anon, authenticated;

-- ── 2. reserve_quant: atomically hold stock for an order ─────────────────────
-- Mirrors decrement_quant (021) but ALSO inserts the reservation row in the same
-- statement, so a successful return means the stock is both held and recorded.
-- Returns the NEW available quantity, or NULL when there is insufficient stock
-- (in which case nothing is written — no reservation row, no decrement).
CREATE OR REPLACE FUNCTION public.reserve_quant(
  p_order_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_qty int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new int;
BEGIN
  IF p_qty <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.store_stock_quant
     SET quantity = quantity - p_qty,
         updated_at = now()
   WHERE product_id = p_product_id
     AND variant_id IS NOT DISTINCT FROM p_variant_id
     AND location_id = p_location_id
     AND quantity - p_qty >= 0
  RETURNING quantity INTO v_new;

  IF v_new IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.store_stock_reservations
    (order_id, product_id, variant_id, location_id, quantity, status)
  VALUES
    (p_order_id, p_product_id, p_variant_id, p_location_id, p_qty, 'reserved');

  -- Keep the aggregate totals in sync (same as decrement_quant).
  IF p_variant_id IS NULL THEN
    UPDATE public.store_products
       SET stock_qty = COALESCE(
             (SELECT sum(quantity) FROM public.store_stock_quant
               WHERE product_id = p_product_id AND variant_id IS NULL), 0),
           updated_at = now()
     WHERE id = p_product_id;
  ELSE
    UPDATE public.store_product_variants
       SET stock_qty = COALESCE(
             (SELECT sum(quantity) FROM public.store_stock_quant
               WHERE variant_id = p_variant_id), 0),
           updated_at = now()
     WHERE id = p_variant_id;
  END IF;

  RETURN v_new;
END;
$$;

-- ── 3. release_stock_reservations: return held stock on expiry/cancel ────────
-- Adds the held quantity back for every 'reserved' row of the order and marks
-- the rows 'released'. Returns the number of rows released (0 = nothing held).
CREATE OR REPLACE FUNCTION public.release_stock_reservations(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.store_stock_reservations
    WHERE order_id = p_order_id AND status = 'reserved'
    FOR UPDATE
  LOOP
    UPDATE public.store_stock_quant
       SET quantity = quantity + r.quantity,
           updated_at = now()
     WHERE product_id = r.product_id
       AND variant_id IS NOT DISTINCT FROM r.variant_id
       AND location_id = r.location_id;

    IF r.variant_id IS NULL THEN
      UPDATE public.store_products
         SET stock_qty = COALESCE(
               (SELECT sum(quantity) FROM public.store_stock_quant
                 WHERE product_id = r.product_id AND variant_id IS NULL), 0),
             updated_at = now()
       WHERE id = r.product_id;
    ELSE
      UPDATE public.store_product_variants
         SET stock_qty = COALESCE(
               (SELECT sum(quantity) FROM public.store_stock_quant
                 WHERE variant_id = r.variant_id), 0),
             updated_at = now()
       WHERE id = r.variant_id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.store_stock_reservations
     SET status = 'released', released_at = now()
   WHERE order_id = p_order_id AND status = 'reserved';

  RETURN v_count;
END;
$$;

-- ── 4. fulfill_stock_reservations: mark holds fulfilled after payment ────────
-- Stock was already decremented at reserve time, so this only transitions the
-- hold to 'fulfilled' (idempotent — second call is a no-op).
CREATE OR REPLACE FUNCTION public.fulfill_stock_reservations(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.store_stock_reservations
     SET status = 'fulfilled', fulfilled_at = now()
   WHERE order_id = p_order_id AND status = 'reserved';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 5. Permissions ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.reserve_quant(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_quant(uuid, uuid, uuid, uuid, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_quant(uuid, uuid, uuid, uuid, int) TO service_role;

REVOKE ALL ON FUNCTION public.release_stock_reservations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stock_reservations(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stock_reservations(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fulfill_stock_reservations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_stock_reservations(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_stock_reservations(uuid) TO service_role;

-- ── 6. Verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('reserve_quant','release_stock_reservations','fulfill_stock_reservations')
    AND p.proacl::text ILIKE '%anon%';
  IF n > 0 THEN RAISE NOTICE '035: % reservation RPC(s) still executable by anon (expected 0)', n; END IF;
  RAISE NOTICE '035_stock_reservations completed: reserve/release/fulfill RPCs + reservation table installed, service_role-only.';
END $$;