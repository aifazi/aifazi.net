-- 016_store_delivery.sql
-- Digital delivery, order tracking (timeline), and user documents.
-- Idempotent + fail-closed like 013/015. Run once in Supabase SQL Editor.

-- ── 1. store_products — digital fulfilment ─────────────────────────────────────
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS digital_file_url TEXT;      -- private storage path OR public URL
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS download_limit  INT NOT NULL DEFAULT 5;  -- downloads allowed per purchase

-- ── 2. store_orders — shipping / tracking ──────────────────────────────────────
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS carrier         TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS tracking_url    TEXT;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS shipped_at      TIMESTAMPTZ;
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ;

-- ── 3. store_order_events — status timeline (order tracker) ───────────────────
CREATE TABLE IF NOT EXISTS public.store_order_events (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id   UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,               -- pending | paid | processing | shipped | delivered | cancelled | refunded
    note       TEXT DEFAULT '',
    actor      TEXT DEFAULT 'system',       -- user id or 'system'/'webhook'
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_order_events_order ON public.store_order_events (order_id);

-- ── 4. store_downloads — digital item delivery records ────────────────────────
CREATE TABLE IF NOT EXISTS public.store_downloads (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id         UUID REFERENCES public.store_orders(id) ON DELETE CASCADE,
    order_item_id    UUID REFERENCES public.store_order_items(id) ON DELETE SET NULL,
    product_id       UUID REFERENCES public.store_products(id) ON DELETE SET NULL,
    product_name     TEXT NOT NULL,
    token            TEXT NOT NULL UNIQUE,  -- unguessable per-purchase token
    file_url         TEXT,                  -- storage path or URL snapshot
    filename         TEXT,
    downloads_allowed INT NOT NULL DEFAULT 5,
    downloads_used   INT  NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_downloads_order ON public.store_downloads (order_id);

-- ── 5. user_documents — user-uploaded documents (ID, license, etc.) ──────────
CREATE TABLE IF NOT EXISTS public.user_documents (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    category      TEXT DEFAULT 'other',
    file_url      TEXT,
    storage_path  TEXT,
    mime_type     TEXT,
    file_size     INT  DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_documents_user ON public.user_documents (user_id);

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.store_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_downloads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_documents    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_order_events' AND policyname='store_order_events_own') THEN
    CREATE POLICY store_order_events_own ON public.store_order_events
      FOR SELECT USING (order_id IN (SELECT id FROM public.store_orders WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='store_downloads' AND policyname='store_downloads_own') THEN
    CREATE POLICY store_downloads_own ON public.store_downloads
      FOR SELECT USING (order_id IN (SELECT id FROM public.store_orders WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='user_documents' AND policyname='user_documents_own') THEN
    CREATE POLICY user_documents_own ON public.user_documents
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
