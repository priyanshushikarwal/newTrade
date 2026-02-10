const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
} else {
    console.log('Using memory-db auth mode');
}

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Access token required' });
        }

        if (!supabase) {
            // Memory-db mode: simple JWT verification
            try {
                const decoded = jwt.verify(token, 'your-secret-key');
                req.user = {
                    id: decoded.id,
                    email: decoded.email,
                    role: decoded.role || 'user',
                    kyc_status: decoded.kyc_status || 'pending',
                    withdrawal_blocked: decoded.withdrawal_blocked || false
                };
                return next();
            } catch (error) {
                return res.status(403).json({ message: 'Invalid token' });
            }
        }

        // Supabase mode
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
