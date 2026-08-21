-- 040_download_token_expiry.sql
-- Add expires_at column to store_downloads for token expiration

ALTER TABLE public.store_downloads
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_store_downloads_expires ON public.store_downloads (expires_at);

-- Set default expiry for existing tokens (30 days from creation)
UPDATE public.store_downloads
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

-- Verify
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