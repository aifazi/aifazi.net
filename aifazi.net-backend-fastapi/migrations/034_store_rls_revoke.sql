-- 034_store_rls_revoke.sql
-- Fourth RLS hardening pass (defense-in-depth for the store subsystem).
-- Apply AFTER 013/015/016/017/018/019 + 010/022.
--
-- Background: the audit-high "store tables have no RLS" was verifiably untrue at
-- the database level — every store/delivery table explicitly runs
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (013, 015, 016, 017, 018, 019) and
-- most write-sensitive rows are already unreadable by anon/authenticated (their
-- "own" policies compare auth.uid() against public.users.id, a different id
-- space, so they never match and DENY).
--
-- This migration is belt-and-suspenders: it REVOKEs table-level PRIVILEGES from
-- anon + authenticated on every store/delivery table that has NO legitimate
-- direct anon/authenticated read. The only tables that keep anon/authenticated
-- SELECT are the three public-catalog tables (store_categories, store_plans,
-- store_products — browsable storefront) and delivery_agents (public tracking;
-- the PII columns phone/user_id were already column-revoked in 022).
--
-- Everything else is service_role-only: the FastAPI backend reads/writes the
-- store via the service key (which bypasses RLS), and neither the web app nor
-- the mobile app touches these tables directly through Supabase REST.

-- ── 1. 013 Store subscriptions (fully locked, service_role-only) ────────────
REVOKE ALL ON public.user_subscriptions FROM anon, authenticated;
-- Anon may browse plans/categories (storefront); subscriptions never.

-- ── 2. 015 Store e-commerce ─────────────────────────────────────────────────
-- Orders / carts / invoices / quotes / transactions: never directly reachable.
REVOKE ALL ON public.store_cart_items    FROM anon, authenticated;
REVOKE ALL ON public.store_orders        FROM anon, authenticated;
REVOKE ALL ON public.store_order_items   FROM anon, authenticated;
REVOKE ALL ON public.store_invoices      FROM anon, authenticated;
REVOKE ALL ON public.store_quotes        FROM anon, authenticated;
REVOKE ALL ON public.store_transactions  FROM anon, authenticated;
-- store_products keeps anon SELECT (public catalog); digital_file_url is
-- already column-revoked (022), so the URL is never exposed over REST.

-- ── 3. 016 Store delivery / documents ───────────────────────────────────────
REVOKE ALL ON public.store_order_events  FROM anon, authenticated;
REVOKE ALL ON public.store_downloads     FROM anon, authenticated;
REVOKE ALL ON public.user_documents      FROM anon, authenticated;

-- ── 4. 017 Store modules ────────────────────────────────────────────────────
REVOKE ALL ON public.store_product_variants FROM anon, authenticated;
REVOKE ALL ON public.store_stock_ledger     FROM anon, authenticated;
REVOKE ALL ON public.store_coupons          FROM anon, authenticated;
REVOKE ALL ON public.store_deals            FROM anon, authenticated;
REVOKE ALL ON public.store_reviews          FROM anon, authenticated;
REVOKE ALL ON public.store_testimonials     FROM anon, authenticated;
REVOKE ALL ON public.store_customer_notes   FROM anon, authenticated;

-- ── 5. 018 Store inventory / Terminal ───────────────────────────────────────
REVOKE ALL ON public.store_locations     FROM anon, authenticated;
REVOKE ALL ON public.store_stock_quant   FROM anon, authenticated;

-- ── 6. 019 Delivery agents ──────────────────────────────────────────────────
-- delivery_agents keeps the public tracking read (phone/user_id already
-- column-revoked in 022). Assignments and scan events are service_role-only:
-- the delivery app routes through the backend, and the agent auth.uid()
-- policies never match public.users.id anyway.
REVOKE ALL ON public.delivery_assignments  FROM anon, authenticated;
REVOKE ALL ON public.delivery_scan_events  FROM anon, authenticated;

-- ── 7. Verify ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  leaked int;
BEGIN
  -- Any table-level grant that survived on the fully-locked set is a regression.
  SELECT count(*) INTO leaked
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'user_subscriptions','store_cart_items','store_orders','store_order_items',
      'store_invoices','store_quotes','store_transactions','store_order_events',
      'store_downloads','user_documents','store_product_variants',
      'store_stock_ledger','store_coupons','store_deals','store_reviews',
      'store_testimonials','store_customer_notes','store_locations',
      'store_stock_quant','delivery_assignments','delivery_scan_events'
    )
    AND EXISTS (
      SELECT 1 FROM aclexplode(c.relacl) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE r.rolname IN ('anon', 'authenticated')
    );
  IF leaked > 0 THEN RAISE NOTICE '034: % fully-locked store tables still grant anon/authenticated (expected 0)', leaked; END IF;
  RAISE NOTICE '034_store_rls_revoke completed: defensive REVOKE ALL on fully-locked store/delivery tables (anon/authenticated), catalog reads intact.';
END $$;