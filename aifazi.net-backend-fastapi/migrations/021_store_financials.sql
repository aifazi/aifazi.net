-- 021_store_financials.sql
-- Atomic store financial + inventory operations.
-- Fixes non-atomic read-then-write that allowed:
--   * coupon used_count to overshoot max_uses under concurrency
--   * stock to oversell past 0 when two orders paid at the same time
-- Both functions are SECURITY DEFINER (the backend's service role calls them;
-- the backend is the only caller and every order/inventory mutation is gated
-- server-side). EXECUTE is revoked from PUBLIC/anon/authenticated.

-- 1. Atomic coupon usage increment ---------------------------------------------
-- Only increments when the coupon has headroom under max_uses (0 = unlimited).
-- Returns the NEW used_count, or NULL when max_uses would be exceeded.
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.store_coupons
     SET used_count = used_count + 1,
         updated_at = now()
   WHERE id = p_coupon_id
     AND (max_uses = 0 OR used_count < max_uses)
  RETURNING used_count;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;

-- 2. Atomic stock decrement ----------------------------------------------------
-- Decrements a quant row only if the result stays >= p_min, then resyncs the
-- aggregate store_products.stock_qty / store_product_variants.stock_qty columns
-- in the same transaction so the totals never drift. Returns the NEW quantity,
-- or NULL when there is insufficient stock.
CREATE OR REPLACE FUNCTION public.decrement_quant(
  p_product_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_qty int,
  p_min int DEFAULT 0
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
     AND quantity - p_qty >= p_min
  RETURNING quantity INTO v_new;

  IF v_new IS NULL THEN
    RETURN NULL;
  END IF;

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

REVOKE ALL ON FUNCTION public.decrement_quant(uuid, uuid, uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_quant(uuid, uuid, uuid, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_quant(uuid, uuid, uuid, int, int) TO service_role;
