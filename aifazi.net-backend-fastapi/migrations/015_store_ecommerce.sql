-- 015_store_ecommerce.sql
-- Full online-business store: products + inventory, cart, orders, invoices,
-- quotes, sales ledger. Idempotent + fail-closed like 013/014.
-- Complements the Stripe subscription store (013): store_plans are recurring
-- VIP tiers; store_products are one-time physical/digital items.

-- ── 1. store_products ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_products (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id       UUID REFERENCES public.store_categories(id) ON DELETE SET NULL,
    slug              TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    sku               TEXT,
    description       TEXT DEFAULT '',
    price_cents       INT  NOT NULL DEFAULT 0,
    compare_at_cents  INT,                 -- optional "was" price for sales
    image_url         TEXT,
    type              TEXT NOT NULL DEFAULT 'physical',  -- physical | digital | service
    stock_qty         INT  NOT NULL DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    track_inventory   BOOLEAN NOT NULL DEFAULT TRUE,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    featured          BOOLEAN DEFAULT FALSE,
    sort_order        INT  DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_products_category ON public.store_products (category_id);
CREATE INDEX IF NOT EXISTS idx_store_products_active   ON public.store_products (active);

-- ── 2. store_cart_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_cart_items (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
    quantity   INT  NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_store_cart_user ON public.store_cart_items (user_id);

-- ── 3. store_orders ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_orders (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number         TEXT NOT NULL UNIQUE,          -- human-friendly e.g. AFA-100123
    user_id              UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status               TEXT NOT NULL DEFAULT 'pending', -- pending | paid | processing | shipped | delivered | cancelled | refunded
    subtotal_cents       INT  NOT NULL DEFAULT 0,
    discount_cents       INT  NOT NULL DEFAULT 0,
    tax_cents            INT  NOT NULL DEFAULT 0,
    shipping_cents       INT  NOT NULL DEFAULT 0,
    total_cents          INT  NOT NULL DEFAULT 0,
    currency             TEXT NOT NULL DEFAULT 'usd',
    customer_name        TEXT,
    customer_email       TEXT,
    shipping_address     JSONB DEFAULT '{}'::jsonb,
    billing_address      JSONB DEFAULT '{}'::jsonb,
    notes                TEXT,
    payment_intent_id    TEXT,
    paid_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_orders_user   ON public.store_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON public.store_orders (status);

-- ── 4. store_order_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_order_items (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id      UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
    product_id    UUID REFERENCES public.store_products(id) ON DELETE SET NULL,
    product_name  TEXT NOT NULL,
    product_sku   TEXT,
    unit_price_cents INT NOT NULL DEFAULT 0,
    quantity      INT  NOT NULL DEFAULT 1,
    line_total_cents INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order ON public.store_order_items (order_id);

-- ── 5. store_invoices ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_invoices (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,        -- e.g. INV-100123
    order_id       UUID REFERENCES public.store_orders(id) ON DELETE SET NULL,
    user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'draft', -- draft | issued | paid | void
    subtotal_cents INT  NOT NULL DEFAULT 0,
    discount_cents INT  NOT NULL DEFAULT 0,
    tax_cents      INT  NOT NULL DEFAULT 0,
    total_cents    INT  NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'usd',
    customer_name  TEXT,
    customer_email TEXT,
    billing_address JSONB DEFAULT '{}'::jsonb,
    due_at         TIMESTAMPTZ,
    paid_at        TIMESTAMPTZ,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_invoices_user ON public.store_invoices (user_id);

-- ── 6. store_quotes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_quotes (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_number   TEXT NOT NULL UNIQUE,        -- e.g. QT-100123
    user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined | converted | expired
    items          JSONB DEFAULT '[]'::jsonb,   -- snapshot [{name, qty, price_cents}]
    subtotal_cents INT  NOT NULL DEFAULT 0,
    tax_cents      INT  NOT NULL DEFAULT 0,
    total_cents    INT  NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'usd',
    customer_name  TEXT,
    customer_email TEXT,
    notes          TEXT,
    valid_until    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_quotes_user ON public.store_quotes (user_id);

-- ── 7. store_transactions (sales ledger) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_transactions (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id         UUID REFERENCES public.store_orders(id) ON DELETE SET NULL,
    user_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    kind             TEXT NOT NULL DEFAULT 'sale',   -- sale | refund | credit
    amount_cents     INT NOT NULL DEFAULT 0,
    currency         TEXT NOT NULL DEFAULT 'usd',
    stripe_payment_intent_id TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_transactions_order ON public.store_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_store_transactions_user  ON public.store_transactions (user_id);

-- ── 8. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.store_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cart_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_quotes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_transactions  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_products' AND policyname='store_products_read') THEN
    CREATE POLICY store_products_read ON public.store_products FOR SELECT USING (true);  -- anon can browse catalog
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_cart_items' AND policyname='store_cart_own') THEN
    -- Users manage their own cart via the backend (service-role) — belt & braces
    CREATE POLICY store_cart_own ON public.store_cart_items
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_orders' AND policyname='store_orders_own') THEN
    CREATE POLICY store_orders_own ON public.store_orders
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_order_items' AND policyname='store_order_items_own') THEN
    CREATE POLICY store_order_items_own ON public.store_order_items
      FOR SELECT USING (order_id IN (SELECT id FROM public.store_orders WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_invoices' AND policyname='store_invoices_own') THEN
    CREATE POLICY store_invoices_own ON public.store_invoices
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_quotes' AND policyname='store_quotes_own') THEN
    CREATE POLICY store_quotes_own ON public.store_quotes
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  -- store_transactions: service-role only (no policies) → fully locked.
END $$;

-- ── 9. Seed a few demo products so the storefront has content ────────────────
DO $$
DECLARE
  tools_id UUID;
BEGIN
  SELECT id INTO tools_id FROM public.store_categories WHERE slug = 'fivem-tools';

  INSERT INTO public.store_products
    (category_id, slug, name, sku, description, price_cents, type, stock_qty, track_inventory, active, featured, sort_order)
  VALUES
    (tools_id, 'discord-nitro-1mo', 'Discord Nitro (1 Month)', 'DN-1M',
     'One-month Discord Nitro gift, delivered to your linked Discord account within 24 hours.',
     999, 'digital', 50, TRUE, TRUE, TRUE, 1),
    (tools_id, 'steam-wallet-10', 'Steam Wallet $10', 'SW-10',
     '$10 Steam Wallet top-up code delivered by email within 24 hours.',
     1050, 'digital', 100, TRUE, TRUE, FALSE, 2),
    (tools_id, 'cfx-whitelist-review', 'Priority Whitelist Review', 'WL-PRIO',
     'Skip the queue — get your whitelist application reviewed within 24 hours instead of 72.',
     500, 'service', 9999, TRUE, TRUE, TRUE, 3),
    (tools_id, 'discord-nitro-3mo', 'Discord Nitro (3 Months)', 'DN-3M',
     'Three-month Discord Nitro gift, delivered to your linked Discord account within 24 hours.',
     2799, 'digital', 30, TRUE, TRUE, FALSE, 4)
  ON CONFLICT (slug) DO NOTHING;
END $$;
