-- 017_store_modules.sql
-- Odoo-style store modules: product variants, stock ledger, coupons,
-- flash deals, reviews, testimonials, customer notes + refund/payment support.
-- Idempotent + fail-closed like 013/015/016.

-- 1. store_product_variants (tiers/skins/options on one product) --------------
CREATE TABLE IF NOT EXISTS public.store_product_variants (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id   UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    sku          TEXT,
    price_cents  INT  NOT NULL DEFAULT 0,        -- 0 = inherits product price
    stock_qty    INT  NOT NULL DEFAULT 0,
    track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    attributes   JSONB DEFAULT '{}'::jsonb,      -- { color, size, tier, ... }
    image_url    TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INT  DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_variants_product ON public.store_product_variants (product_id);

-- 2. store_stock_ledger (every stock movement, audit trail) -------------------
CREATE TABLE IF NOT EXISTS public.store_stock_ledger (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id   UUID REFERENCES public.store_products(id) ON DELETE SET NULL,
    variant_id   UUID REFERENCES public.store_product_variants(id) ON DELETE SET NULL,
    change_qty   INT  NOT NULL DEFAULT 0,        -- +restock / -sale / -manual
    reason       TEXT NOT NULL DEFAULT 'adjustment', -- adjustment | sale | refund | restock | manual
    ref_type     TEXT,                           -- order | order_item | cart | manual
    ref_id       TEXT,
    actor        TEXT DEFAULT 'system',
    note         TEXT DEFAULT '',
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_ledger_product ON public.store_stock_ledger (product_id);
CREATE INDEX IF NOT EXISTS idx_store_ledger_created ON public.store_stock_ledger (created_at);

-- 3. store_coupons (discount codes) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_coupons (
    id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code               TEXT NOT NULL UNIQUE,
    description        TEXT DEFAULT '',
    type               TEXT NOT NULL DEFAULT 'fixed',  -- fixed | percent | free_shipping
    value_cents        INT  DEFAULT 0,                  -- for fixed
    value_percent      INT  DEFAULT 0,                  -- for percent (0-100)
    min_subtotal_cents INT  DEFAULT 0,
    max_uses           INT  DEFAULT 0,                  -- 0 = unlimited
    per_user_limit     INT  DEFAULT 0,                  -- 0 = unlimited
    used_count         INT  NOT NULL DEFAULT 0,
    product_ids        JSONB DEFAULT '[]'::jsonb,       -- restrict to products (empty = all)
    category_id        UUID REFERENCES public.store_categories(id) ON DELETE SET NULL,
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at          TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_coupons_active ON public.store_coupons (active);

-- 4. store_deals (flash sales / countdown offers) ------------------------------
CREATE TABLE IF NOT EXISTS public.store_deals (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id      UUID REFERENCES public.store_products(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    subtitle        TEXT DEFAULT '',
    discount_percent INT NOT NULL DEFAULT 0,           -- 0-100 off the current price
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_deals_product ON public.store_deals (product_id);

-- 5. store_reviews (product ratings + moderation) -----------------------------
CREATE TABLE IF NOT EXISTS public.store_reviews (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id    UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating        INT  NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    title         TEXT DEFAULT '',
    body          TEXT DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
    helpful_count INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_store_reviews_product ON public.store_reviews (product_id, status);

-- 6. store_testimonials (marketing quotes) ------------------------------------
CREATE TABLE IF NOT EXISTS public.store_testimonials (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
    author_name   TEXT,
    role          TEXT DEFAULT '',
    content       TEXT NOT NULL,
    rating        INT  DEFAULT 5,
    status        TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
    display_order INT  DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 7. store_customer_notes (CRM sticky notes on a customer) --------------------
CREATE TABLE IF NOT EXISTS public.store_customer_notes (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    staff_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    staff_name TEXT DEFAULT '',
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_customer_notes_user ON public.store_customer_notes (user_id);

-- 8. Column additions ---------------------------------------------------------
-- cart items support a variant choice
ALTER TABLE public.store_cart_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.store_product_variants(id) ON DELETE SET NULL;
-- order items snapshot the chosen variant
ALTER TABLE public.store_order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.store_product_variants(id) ON DELETE SET NULL;
ALTER TABLE public.store_order_items ADD COLUMN IF NOT EXISTS variant_name TEXT;
-- orders record which coupon was applied
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.store_coupons(id) ON DELETE SET NULL;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS coupon_discount_cents INT NOT NULL DEFAULT 0;

-- Cart may hold the same product under different variants -> relax old unique key
ALTER TABLE public.store_cart_items DROP CONSTRAINT IF EXISTS store_cart_items_user_id_product_id_key;
CREATE INDEX IF NOT EXISTS idx_store_cart_variant ON public.store_cart_items (variant_id);

-- 9. RLS (service-role backend bypasses; customers read through API) ----------
ALTER TABLE public.store_product_variants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_stock_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_testimonials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customer_notes     ENABLE ROW LEVEL SECURITY;
