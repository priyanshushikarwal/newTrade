-- FIXED: Run this to fix SIGNUP errors (Missing columns in profiles/wallets) + Withdrawal errors

-- 0. Enable UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. FIX SIGNUP ISSUES (New)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS withdrawal_blocked BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS locked_balance NUMERIC DEFAULT 0;

-- 2. FIX WITHDRAWAL ISSUES (Previous fixes retained)
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS server_charge NUMERIC DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS ifsc TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS account_holder_name TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS balance_deducted BOOLEAN DEFAULT false;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fail_reason TEXT;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processing_start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processing_end_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processing_duration INTEGER;

ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check 
CHECK (status IN ('pending', 'hold', 'processing', 'failed', 'success', 'on_hold', 'completed'));

-- 3. Ensure unhold_requests table exists
CREATE TABLE IF NOT EXISTS public.unhold_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  unhold_charge NUMERIC NOT NULL,
  utr_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Ensure transactions columns
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference TEXT;

-- 5. Ensure additional columns
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS withdrawal_charges JSONB;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
