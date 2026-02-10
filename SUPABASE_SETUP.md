# Supabase Setup Guide

## Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Sign up/Login to your account
3. Click "New Project"
4. Fill in project details:
   - Name: `trading-platform`
   - Database Password: Choose a strong password
   - Region: Select closest to your location

## Step 2: Get Project Credentials
After project creation (takes ~2 minutes):
1. Go to Settings → API
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Step 3: Apply Database Schema
1. Go to SQL Editor in your Supabase dashboard
2. Copy and paste the entire `supabase_schema.sql` content
3. Click "Run" to execute the schema

## Step 4: Configure Environment Variables
Create/update your `.env` file with:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## Step 5: Update Server Configuration
Update `server/supabase.js` with your credentials:

```javascript
const supabaseUrl = process.env.SUPABASE_URL || 'https://xxxxx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
```

## Step 6: Test the Setup
1. Start your server: `npm run dev` (frontend) and `npm start` (backend)
2. Try registering a new user
3. Check if data persists in Supabase dashboard → Table Editor

## Features Implemented
- ✅ User authentication with Supabase Auth
- ✅ Persistent PostgreSQL database
- ✅ Row Level Security (RLS) policies
- ✅ Automatic profile/wallet creation on signup
- ✅ Transaction ledger with balance tracking
- ✅ Admin approval system for deposits
- ✅ Withdrawal auto-fail with proper refunds

## Security Notes
- RLS policies ensure users can only access their own data
- Admin role required for sensitive operations
- All financial operations are logged in transaction ledger
- JWT tokens are validated on each request