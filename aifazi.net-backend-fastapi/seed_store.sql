-- =============================================================================
-- Store Seed Data: Run this in Supabase SQL Editor to populate the store
-- Make sure migrations 013-018 have been applied first
-- =============================================================================

-- ── Clear existing demo data (optional — remove if you want to keep existing) ──
-- DELETE FROM public.store_products WHERE slug LIKE 'demo-%';

-- ── Create categories (if not exist) ──────────────────────────────────────────
INSERT INTO public.store_categories (name, slug, icon, description, display_order, active)
VALUES
  ('Digital Goods', 'digital', '💻', 'Software, game keys, digital downloads, and licenses.', 1, TRUE),
  ('Merchandise', 'merch', '👕', 'AIFAZI branded apparel, stickers, and physical goods.', 2, TRUE),
  ('Services', 'service', '🔧', 'Priority support, configuration services, and consulting.', 3, TRUE),
  ('VIP Perks', 'vip', '👑', 'In-game perks and benefits for AIFAZI RP.', 4, TRUE)
ON CONFLICT (slug) DO UPDATE SET icon = EXCLUDED.icon, active = TRUE;

-- ── Seed products ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  digital_id UUID;
  merch_id UUID;
  service_id UUID;
  vip_id UUID;
BEGIN
  SELECT id INTO digital_id FROM public.store_categories WHERE slug = 'digital';
  SELECT id INTO merch_id FROM public.store_categories WHERE slug = 'merch';
  SELECT id INTO service_id FROM public.store_categories WHERE slug = 'service';
  SELECT id INTO vip_id FROM public.store_categories WHERE slug = 'vip';

  INSERT INTO public.store_products
    (category_id, slug, name, sku, description, price_cents, type, stock_qty, track_inventory, active, featured, sort_order, on_sale, compare_at_cents)
  VALUES
    -- Digital Goods
    (digital_id, 'demo-discord-nitro-1mo', 'Discord Nitro (1 Month)', 'DN-1M',
     'One-month Discord Nitro gift. Delivered to your linked Discord account within 24 hours. Enjoy enhanced chat, larger uploads, and HD streaming.',
     999, 'digital', 50, TRUE, TRUE, TRUE, 1, TRUE, 1299),
    (digital_id, 'demo-steam-wallet-10', 'Steam Wallet $10', 'SW-10',
     '$10 Steam Wallet top-up code delivered instantly by email.',
     1050, 'digital', 100, TRUE, TRUE, TRUE, 2, FALSE, NULL),
    (digital_id, 'demo-premium-config-pack', 'Premium Server Config Pack', 'CFG-PRO',
     'Pre-configured server configs for FiveM: optimized server.cfg, resource lists, and performance tuning guide.',
     3500, 'digital', 999, FALSE, TRUE, TRUE, 3, FALSE, NULL),

    -- Merchandise
    (merch_id, 'demo-aifazi-hoodie', 'AIFAZI RP Limited Hoodie', 'AF-HOOD',
     'Limited-edition AIFAZI RP hoodie with neon city design. Premium cotton blend, available in black.',
     4999, 'physical', 100, TRUE, TRUE, TRUE, 1, TRUE, 5999),
    (merch_id, 'demo-aifazi-sticker-pack', 'AIFAZI Sticker Pack (5-pack)', 'AF-STK',
     'Set of 5 premium vinyl stickers: logo, city skyline, and cyberpunk designs.',
     999, 'physical', 500, TRUE, TRUE, FALSE, 2, FALSE, NULL),

    -- Services
    (service_id, 'demo-whitelist-review', 'Priority Whitelist Review', 'WL-PRIO',
     'Skip the queue — your application is reviewed within 24 hours instead of the standard 72-hour window.',
     500, 'service', 9999, TRUE, TRUE, TRUE, 1, FALSE, NULL),
    (service_id, 'demo-staff-consult', '1-Hour Staff Consult', 'CONS-1H',
     'Personal 1-on-1 consultation with AIFAZI staff. Server setup, RP guidance, or tech support.',
     2500, 'service', 50, TRUE, TRUE, FALSE, 2, FALSE, NULL),

    -- VIP Perks (one-time purchases, not subscriptions)
    (vip_id, 'demo-donator-role', 'Donator Role (Lifetime)', 'DON-LIFE',
     'Lifetime Donator role on Discord and recognition in the server. Does not include recurring VIP perks.',
     1500, 'digital', 500, TRUE, TRUE, TRUE, 1, FALSE, NULL)
  ON CONFLICT (slug) DO UPDATE SET active = TRUE, featured = EXCLUDED.featured;
END $$;
