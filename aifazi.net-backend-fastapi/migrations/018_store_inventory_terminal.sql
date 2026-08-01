-- 018_store_inventory_terminal.sql
-- Odoo-style inventory (locations, per-location quants, barcodes, movements)
-- + Stripe Terminal / Radar support (in-person card_present payments).
-- Idempotent + fail-closed like 013/015/016/017.

-- 1. store_locations (warehouse / bin hierarchy) --------------------------------
CREATE TABLE IF NOT EXISTS public.store_locations (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_id   UUID REFERENCES public.store_locations(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    code        TEXT,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT  DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_locations_parent ON public.store_locations (parent_id);

-- 2. store_stock_quant (per-location on-hand) -----------------------------------
CREATE TABLE IF NOT EXISTS public.store_stock_quant (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id  UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
    variant_id  UUID REFERENCES public.store_product_variants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.store_locations(id) ON DELETE CASCADE,
    quantity    INT  NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (product_id, variant_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_store_quant_product   ON public.store_stock_quant (product_id);
CREATE INDEX IF NOT EXISTS idx_store_quant_location  ON public.store_stock_quant (location_id);

-- 3. Barcodes (EAN/UPC/QR — scannable from a phone camera) ----------------------
ALTER TABLE public.store_products        ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.store_product_variants ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_products_barcode  ON public.store_products  (barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_variants_barcode ON public.store_product_variants (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- 4. store_stock_ledger gains movement locations --------------------------------
ALTER TABLE public.store_stock_ledger ADD COLUMN IF NOT EXISTS from_location_id UUID REFERENCES public.store_locations(id) ON DELETE SET NULL;
ALTER TABLE public.store_stock_ledger ADD COLUMN IF NOT EXISTS to_location_id   UUID REFERENCES public.store_locations(id) ON DELETE SET NULL;

-- 5. Order/transaction columns for POS + Radar ----------------------------------
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'web'; -- web | pos
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS payment_method TEXT;      -- card_present | card | web
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS radar_risk_level TEXT;    -- normal | elevated | highest | unknown
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS radar_risk_score INT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.store_locations(id) ON DELETE SET NULL;
ALTER TABLE public.store_transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.store_transactions ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE public.store_transactions ADD COLUMN IF NOT EXISTS risk_score INT;

-- 6. Default location + backfill existing stock into it -------------------------
DO $$
DECLARE
  def_loc UUID;
  r RECORD;
  cnt INT;
BEGIN
  SELECT id INTO def_loc FROM public.store_locations WHERE is_default = TRUE LIMIT 1;
  IF def_loc IS NULL THEN
    INSERT INTO public.store_locations (name, code, is_default) VALUES ('Main Store', 'MAIN', TRUE) RETURNING id INTO def_loc;
  END IF;

  -- Backfill product stock (only if no quant rows exist yet for that product)
  FOR r IN SELECT id FROM public.store_products LOOP
    SELECT COUNT(*) INTO cnt FROM public.store_stock_quant WHERE product_id = r.id AND variant_id IS NULL;
    IF cnt = 0 THEN
      INSERT INTO public.store_stock_quant (product_id, variant_id, location_id, quantity)
      SELECT id, NULL, def_loc, stock_qty FROM public.store_products WHERE id = r.id;
    END IF;
  END LOOP;

  -- Backfill variant stock
  FOR r IN SELECT id FROM public.store_product_variants LOOP
    SELECT COUNT(*) INTO cnt FROM public.store_stock_quant WHERE variant_id = r.id;
    IF cnt = 0 THEN
      INSERT INTO public.store_stock_quant (product_id, variant_id, location_id, quantity)
      SELECT product_id, id, def_loc, stock_qty FROM public.store_product_variants WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 7. RLS ------------------------------------------------------------------------
ALTER TABLE public.store_locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_stock_quant    ENABLE ROW LEVEL SECURITY;
