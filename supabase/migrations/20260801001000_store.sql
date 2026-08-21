-- 013_store.sql
-- Stripe subscription store: categories, plans, user subscriptions + Lua sync.
-- Idempotent + fail-closed like 012.

-- ── 1. store_categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_categories (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    icon         TEXT DEFAULT '🛒',
    description  TEXT DEFAULT '',
    scope        TEXT NOT NULL DEFAULT 'all',   -- 'all' | 'main' | 'fivem'
    display_order INT DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 2. store_plans ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_plans (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id      UUID REFERENCES public.store_categories(id) ON DELETE SET NULL,
    slug             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    level            INT  NOT NULL DEFAULT 1,
    price_cents      INT  NOT NULL DEFAULT 0,
    interval         TEXT NOT NULL DEFAULT 'month',
    headline         TEXT DEFAULT '',
    description      TEXT DEFAULT '',
    perks            JSONB DEFAULT '{}'::jsonb,
    features         JSONB DEFAULT '[]'::jsonb,
    display_order    INT  DEFAULT 0,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    stripe_product_id TEXT,
    stripe_price_id  TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 3. user_subscriptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id               UUID REFERENCES public.store_plans(id) ON DELETE SET NULL,
    plan_slug             TEXT,
    plan_name             TEXT,
    plan_level            INT  DEFAULT 0,
    perks                 JSONB DEFAULT '{}'::jsonb,
    status                TEXT NOT NULL DEFAULT 'active',   -- active | trialing | past_due | canceled
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT UNIQUE,
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN DEFAULT FALSE,
    sync_status           TEXT NOT NULL DEFAULT 'pending',  -- pending | synced | failed
    sync_attempts         INT  DEFAULT 0,
    sync_error            TEXT,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_sync ON public.user_subscriptions (sync_status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe ON public.user_subscriptions (stripe_subscription_id);

-- ── 4. Seeded categories ──────────────────────────────────────────────────────
INSERT INTO public.store_categories (slug, name, icon, description, scope, display_order) VALUES
  ('subscriptions', 'Subscriptions', '👑', 'Recurring VIP tiers with in-game perks', 'all', 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.store_categories (slug, name, icon, description, scope, display_order) VALUES
  ('fivem-tools', 'FiveM Tools', '🛠️', 'One-time in-game tools and scripts', 'fivem', 2)
ON CONFLICT (slug) DO NOTHING;

-- ── 5. Seeded plans (YatraRP-style 6 tiers) ───────────────────────────────────
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM public.store_categories WHERE slug = 'subscriptions';

  INSERT INTO public.store_plans
    (category_id, slug, name, level, price_cents, interval, headline, description, perks, features, display_order)
  VALUES
    (cat_id, 'standard',  'Standard',  1, 499,  'month', 'Entry VIP with a head start',
     'Get your foot in the city with priority queue placement and a custom plate.',
     '{"vehicle_class":"B","custom_plate":true,"phone_min_digits":8,"slot_priority":1,"group_level":1}'::jsonb,
     '["Queue priority (level 1)","Custom vehicle plate","Unlock vehicle class B","8-digit phone number"]'::jsonb, 1),
    (cat_id, 'enhanced',  'Enhanced',  2, 999,  'month', 'More money, more lifestyle',
     'Extra character slot, better vehicles and deeper bank capacity.',
     '{"vehicle_class":"A","custom_plate":true,"phone_min_digits":9,"slot_priority":2,"group_level":2,"extra_characters":2}'::jsonb,
     '["Queue priority (level 2)","Custom vehicle plate","Unlock vehicle class A","9-digit phone number","Extra character slot"]'::jsonb, 2),
    (cat_id, 'advanced',  'Advanced',  3, 1499, 'month', 'The serious player pack',
     'Priority slot, bonus salary and access to advanced vehicle cosmetics.',
     '{"vehicle_class":"S","custom_plate":true,"phone_min_digits":10,"slot_priority":3,"group_level":3,"extra_characters":2,"vehicle_salon":true}'::jsonb,
     '["Queue priority (level 3)","Custom vehicle plate","Unlock vehicle class S","10-digit phone number","Vehicle salon access"]'::jsonb, 3),
    (cat_id, 'elite',     'Elite',     4, 2499, 'month', 'Roleplay with a golden touch',
     'Everything in Advanced plus weapon skins, bonus homes and an extra garage.',
     '{"vehicle_class":"S","custom_plate":true,"phone_min_digits":10,"slot_priority":4,"group_level":4,"extra_characters":3,"vehicle_salon":true,"weapon_skins":true,"garage_slots":2}'::jsonb,
     '["Queue priority (level 4)","Custom vehicle plate","Unlock vehicle class S","10-digit phone number","Weapon skins","Extra garage slot"]'::jsonb, 4),
    (cat_id, 'prime',     'Prime',     5, 3499, 'month', 'For the movers and shakers',
     'Auction house access, premium properties and priority support.',
     '{"vehicle_class":"S+","custom_plate":true,"phone_min_digits":11,"slot_priority":5,"group_level":5,"extra_characters":3,"vehicle_salon":true,"weapon_skins":true,"garage_slots":3,"auction_access":true,"home_slots":2}'::jsonb,
     '["Queue priority (level 5)","Custom vehicle plate","Unlock vehicle class S+","11-digit phone number","Weapon skins","Auction house access","Bonus home slot"]'::jsonb, 5),
    (cat_id, 'supreme',   'Supreme',   6, 4999, 'month', 'The absolute top tier',
     'Everything unlocked. The city is yours.',
     '{"vehicle_class":"S+","custom_plate":true,"phone_min_digits":11,"slot_priority":6,"group_level":6,"extra_characters":4,"vehicle_salon":true,"weapon_skins":true,"garage_slots":4,"auction_access":true,"home_slots":3,"discord_role":"Supreme"}'::jsonb,
     '["Queue priority (level 6)","Custom vehicle plate","Unlock vehicle class S+","11-digit phone number","Weapon skins","Auction house access","Bonus home slots","Exclusive Discord role"]'::jsonb, 6)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- ── 6. RLS — anon can read plans/categories, not subscriptions ────────────────
ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_categories' AND policyname='store_categories_read') THEN
    CREATE POLICY store_categories_read ON public.store_categories FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_plans' AND policyname='store_plans_read') THEN
    CREATE POLICY store_plans_read ON public.store_plans FOR SELECT USING (true);
  END IF;
END $$;

-- subscriptions stay service-role only (no policies created → fully locked).
