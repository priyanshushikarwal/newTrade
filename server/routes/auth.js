const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dbAdapter = require('../db-adapter');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;
if (supabaseUrl && supabaseServiceKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
}

// Signup
router.post('/signup', async (req, res) => {
    try {
        console.log('Signup request received:', { email: req.body.email, hasPassword: !!req.body.password });
        const { email, password, phone } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        if (!supabaseAdmin) {
            // Memory-db mode
            const existingUser = await dbAdapter.profiles.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            const userId = Date.now().toString();
            const user = {
                id: userId,
                email,
                phone,
                role: 'user',
                kycStatus: 'pending',
                withdrawalBlocked: false,
                createdAt: new Date().toISOString()
            };

            // Create profile
            await dbAdapter.profiles.create(user);

            // Create wallet
            await dbAdapter.wallets.create({
                userId,
                balance: 0,
                lockedBalance: 0
            });

            // Generate JWT token
            const token = jwt.sign(
                {
                    id: userId,
                    email,
                    role: 'user',
                    kyc_status: 'pending',
                    withdrawal_blocked: false
                },
                'your-secret-key',
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: userId,
                    email,
                    role: 'user',
                    balance: 0,
                    kycStatus: 'pending',
                    withdrawalBlocked: false
                }
            });
            return;
        }

        // Supabase mode
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

        // Insert profile with additional info
        // Check if profile exists (handle Trigger creation)
        const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', authData.user.id)
            .single();

        let profileError;
        if (existingProfile) {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    email: authData.user.email,
                    phone,
                    role: 'user',
                    kyc_status: 'pending',
                    withdrawal_blocked: false
                })
                .eq('id', authData.user.id);
            profileError = error;
        } else {
            const { error } = await supabaseAdmin
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    email: authData.user.email,
                    phone,
                    role: 'user',
                    kyc_status: 'pending',
                    withdrawal_blocked: false
                });
            profileError = error;
        }

        if (profileError) {
            console.error('Profile insert/update error:', JSON.stringify(profileError, null, 2));
            // Clean up: delete the auth user if profile creation fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ message: 'Failed to create user profile', error: profileError.message });
        }

        // Insert wallet
        // Check if wallet exists
        const { data: existingWallet } = await supabaseAdmin
            .from('wallets')
            .select('id')
            .eq('user_id', authData.user.id)
            .single();

        let walletError;
        if (existingWallet) {
            const { error } = await supabaseAdmin
                .from('wallets')
                .update({
                    balance: 0,
                    locked_balance: 0
                })
                .eq('user_id', authData.user.id);
            walletError = error;
        } else {
            const { error } = await supabaseAdmin
                .from('wallets')
                .insert({
                    user_id: authData.user.id,
                    balance: 0,
                    locked_balance: 0
                });
            walletError = error;
        }

        if (walletError) {
            console.error('Wallet insert error:', walletError);
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

        if (!supabaseAdmin) {
            // Memory-db mode
            const user = await dbAdapter.profiles.findByEmail(email);
            if (!user) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            // Get wallet
            const wallet = await dbAdapter.wallets.findByUserId(user.id);

            // Generate JWT token
            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    kyc_status: user.kycStatus,
                    withdrawal_blocked: user.withdrawalBlocked
                },
                'your-secret-key',
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    balance: Number(wallet?.balance || 0),
                    kycStatus: user.kycStatus,
                    withdrawalBlocked: user.withdrawalBlocked
                }
            });
            return;
        }

        // Supabase mode
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
                kycStatus: profile.kyc_status,
                withdrawalBlocked: profile.withdrawal_blocked
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
        if (!supabaseAdmin) {
            // Memory-db mode
            const wallet = await dbAdapter.wallets.findByUserId(req.user.id);
            res.json({
                user: {
                    id: req.user.id,
                    email: req.user.email,
                    role: req.user.role,
                    balance: Number(wallet?.balance || 0),
                    kycStatus: req.user.kyc_status,
                    withdrawalBlocked: req.user.withdrawal_blocked
                }
            });
            return;
        }

        // Get wallet balance from Supabase
        const { data: wallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                balance: Number(wallet?.balance || 0),
                kycStatus: req.user.kyc_status,
                withdrawalBlocked: req.user.withdrawal_blocked
            }
        });
    } catch (error) {
        console.error('Check auth error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get Profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        // Get user profile from Supabase
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ message: 'User profile not found' });
        }

        // Get wallet balance
        const { data: wallet } = await supabaseAdmin
            .from('wallets')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                role: profile.role,
                balance: Number(wallet?.balance || 0),
                kycStatus: profile.kyc_status,
                withdrawalBlocked: profile.withdrawal_blocked
            }
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
