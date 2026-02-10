require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing in .env. Using in-memory mode (data will not persist).');
    module.exports = null;
} else {
    console.log('✅ Supabase Client Initialized');
    const supabase = createClient(supabaseUrl, supabaseKey);
    module.exports = supabase;
}
