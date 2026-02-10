const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dbAdapter = require('../db-adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Signup
router.post('/signup', async (req, res) => {
    try {
        console.log('Signup request received:', { email: req.body.email, hasPassword: !!req.body.password });
        const { email, password, phone } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Create user in Supabase Auth
        console.log('Creating user in Supabase...');
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Auto-confirm email for demo
        });

        if (authError) {
            console.log('Supabase auth error:', authError);
            return res.status(400).json({ message: authError.message });
        }

        console.log('User created successfully:', authData.user.id, authData.user.email);

        // Update profile with additional info
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
                phone,
                kyc_status: 'pending',
                withdrawal_blocked: false
            })
            .eq('id', authData.user.id);

        if (profileError) {
            console.error('Profile update error:', profileError);
        }

        // Get wallet info
        const { data: wallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();

        res.json({
            token: authData.session?.access_token,
            user: {
                id: authData.user.id,
                email: authData.user.email,
                role: 'user',
                balance: Number(wallet?.balance || 0),
                kyc_status: 'pending',
                withdrawal_blocked: false
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Sign in with Supabase
        const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Get user profile
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ message: 'User profile not found' });
        }

        // Get wallet
        const { data: wallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();

        res.json({
            token: authData.session?.access_token,
            user: {
                id: authData.user.id,
                email: authData.user.email,
                role: profile.role,
                balance: Number(wallet?.balance || 0),
                kyc_status: profile.kyc_status,
                withdrawal_blocked: profile.withdrawal_blocked
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Check Auth
router.get('/check', authenticateToken, async (req, res) => {
    try {
        // Get wallet balance
        const { data: wallet } = await dbAdapter.wallets.findByUserId(req.user.id);

        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                balance: Number(wallet?.balance || 0),
                kyc_status: req.user.kyc_status,
                withdrawal_blocked: req.user.withdrawal_blocked
            }
        });
    } catch (error) {
        console.error('Check auth error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                balance: Number(user.balance),
                kycStatus: user.kycStatus,
                withdrawalBlocked: user.withdrawalBlocked
            }
        });
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Profile Full
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await dbAdapter.users.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            balance: Number(user.balance),
            usedBalance: Number(user.usedBalance),
            kycStatus: user.kycStatus,
            role: user.role,
            withdrawalBlocked: user.withdrawalBlocked,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
