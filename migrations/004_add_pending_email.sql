-- Add pending_email column to users table for delayed email verification
-- When a user changes their email, it's stored here until they verify it

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_verified BOOLEAN DEFAULT FALSE;
