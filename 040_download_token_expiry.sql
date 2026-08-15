-- 040_download_token_expiry.sql
ALTER TABLE public.store_downloads
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_store_downloads_expires ON public.store_downloads (expires_at);

UPDATE public.store_downloads
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'store_downloads' AND column_name = 'expires_at'
    ) THEN
        RAISE EXCEPTION '040: expires_at column not created';
    END IF;
    RAISE NOTICE '040_download_token_expiry completed successfully';
END $$;