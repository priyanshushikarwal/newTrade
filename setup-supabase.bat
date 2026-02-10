@echo off
echo ========================================
echo   Supabase Setup Helper
echo ========================================
echo.
echo This script will help you set up Supabase for your trading platform.
echo.
echo Prerequisites:
echo - Supabase account (https://supabase.com)
echo - Node.js installed
echo.
echo Steps:
echo 1. Create a new Supabase project
echo 2. Get your project URL and API keys
echo 3. Run this setup script
echo.
echo Press any key to continue...
pause >nul

echo.
echo Please enter your Supabase project URL:
echo (e.g., https://abcdefghijk.supabase.co)
set /p SUPABASE_URL=https://tjxvdnnhbobsgkxymnbl.supabase.co

echo.
echo Please enter your Supabase anon/public key:
set /p SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqeHZkbm5oYm9ic2dreHltbmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDExMTksImV4cCI6MjA4NjMxNzExOX0.OIlma13HE7AHJ9U0kFXBUvY5bN2Je-v4W0hS80fvdDM

echo.
echo Please enter your Supabase service role key:
echo (You can find this in Project Settings -^> API -^> service_role key)
set /p SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqeHZkbm5oYm9ic2dreHltbmJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc0MTExOSwiZXhwIjoyMDg2MzE3MTE5fQ.IX2DdPGDyaHCkbtrOSaQntrt7MYQDzEkyy2p9gqhl1c

echo.
echo Creating .env file...
(
echo VITE_SUPABASE_URL=%SUPABASE_URL%
echo VITE_SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%
echo SUPABASE_URL=%SUPABASE_URL%
echo SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_KEY%
) > .env

echo.
echo .env file created successfully!
echo.
echo Next steps:
echo 1. Go to your Supabase dashboard SQL Editor
echo 2. Copy and paste the contents of supabase_schema.sql
echo 3. Click Run to apply the schema
echo 4. Start your development server: npm run dev
echo.
echo Setup complete! Press any key to exit...
pause >nul