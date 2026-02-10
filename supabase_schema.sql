-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, 
  name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user', 
  balance NUMERIC DEFAULT 0,
  used_balance NUMERIC DEFAULT 0,
  kyc_status TEXT DEFAULT 'pending', 
  is_verified BOOLEAN DEFAULT false,
  withdrawal_blocked BOOLEAN DEFAULT false,
  suspended_for_suspicious_activity BOOLEAN DEFAULT false,
  account_status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Default Admin User (Password: admin123)
INSERT INTO public.users (id, email, password, name, role, is_verified)
VALUES (uuid_generate_v4(), 'admin@tradepro.com', 'admin123', 'Admin', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Default Demo User (Password: demo123)
INSERT INTO public.users (id, email, password, name, role, is_verified, balance)
VALUES (uuid_generate_v4(), 'demo@tradex.com', 'demo123', 'Demo User', 'user', true, 0)
ON CONFLICT (email) DO NOTHING;

-- Transactions Table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  type TEXT NOT NULL, 
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending', 
  description TEXT,
  failure_reason TEXT,
  reference TEXT,
  payment_proof_pdf TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deposit Requests Table
CREATE TABLE public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  amount NUMERIC NOT NULL,
  method TEXT,
  transaction_id TEXT,
  upi_id TEXT,
  bank_name TEXT,
  account_number TEXT,
  proof_url TEXT, 
  status TEXT DEFAULT 'pending', 
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Withdrawal Requests Table
CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  amount NUMERIC NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  ifsc TEXT,
  account_holder_name TEXT,
  status TEXT DEFAULT 'pending', 
  attempt_count INTEGER DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  balance_deducted BOOLEAN DEFAULT false,
  failure_reason TEXT,
  admin_processed BOOLEAN DEFAULT false,
  server_charge NUMERIC DEFAULT 0,
  payment_proof_url TEXT,
  payment_proof_pdf TEXT,
  transaction_ref TEXT,
  payment_proof_submitted_at TIMESTAMP WITH TIME ZONE,
  processing_start_time TIMESTAMP WITH TIME ZONE,
  processing_end_time TIMESTAMP WITH TIME ZONE,
  processing_duration INTEGER,
  support_ticket_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KYC Requests Table
CREATE TABLE public.kyc_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  full_name TEXT,
  document_type TEXT,
  document_number TEXT,
  front_image_url TEXT,
  back_image_url TEXT,
  status TEXT DEFAULT 'pending', 
  rejection_reason TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Support Tickets Table
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  subject TEXT,
  category TEXT,
  priority TEXT,
  message TEXT,
  status TEXT DEFAULT 'open', 
  withdrawal_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ticket Messages Table
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES public.support_tickets(id),
  sender_role TEXT, 
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders Table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  symbol TEXT,
  type TEXT, 
  side TEXT, 
  quantity NUMERIC,
  price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  status TEXT, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE
);

-- Unhold Requests Table
CREATE TABLE public.unhold_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  unhold_charge NUMERIC,
  utr_number TEXT,
  status TEXT DEFAULT 'pending',
  rejection_reason TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts Table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  type TEXT,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings Table (Single row)
CREATE TABLE public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  withdrawal_charges_server_charge NUMERIC DEFAULT 10.0,
  withdrawal_charges_commission NUMERIC DEFAULT 2.0,
  withdrawal_charges_bank_elect_charge NUMERIC DEFAULT 15.0,
  withdrawal_charges_server_commission_holding NUMERIC DEFAULT 5.0,
  withdrawal_charges_account_closure NUMERIC DEFAULT 20.0,
  whatsapp_number TEXT DEFAULT '919876543210',
  qr_code_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
