-- CORRECTED SQL SCRIPT - RUN THIS AGAIN
-- The previous error likely caused a rollback, so we must re-run this.

-- 1. Add qr_code_url to admin_settings (Required for Upload)
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

-- 2. Create unhold_requests table (Required for Unhold feature)
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

-- 3. Verify success
DO $$ 
BEGIN 
    RAISE NOTICE 'Database updated successfully. Please restart server.';
END $$;
