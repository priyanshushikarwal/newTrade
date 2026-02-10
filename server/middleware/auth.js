const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Access token required' });
        }

        // Verify Supabase JWT
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }

        // Get user profile with role
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(403).json({ message: 'User profile not found' });
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: profile.role,
            kyc_status: profile.kyc_status,
            withdrawal_blocked: profile.withdrawal_blocked
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ message: 'Authentication error' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
};

module.exports = { authenticateToken, requireRole };
