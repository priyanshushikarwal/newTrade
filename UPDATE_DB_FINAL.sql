-- 1. Add qr_code_url column to admin_settings table (Fixes Server Crash)
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

-- 2. Ensure unhold_requests table exists (Fixes 'Failed to load unhold requests' error)
-- Using gen_random_uuid() which is built-in for Postgres 13+ on Supabase
CREATE TABLE IF NOT EXISTS unhold_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    unhold_charge DECIMAL NOT NULL,
    utr_number TEXT,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Initialize admin settings row if missing
INSERT INTO admin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
