const express = require('express');
const jwt = require('jsonwebtoken');
const dbAdapter = require('../db-adapter');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const DEFAULT_BALANCE = 0;

// Signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Check if user exists
        const existingUser = await dbAdapter.users.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const newUser = {
            // id: `USR-${Date.now()}`, // Let DB or Adapter handle ID generation (UUID)
            name,
            email,
            password, // In production, hash this!
            phone,
            role: 'user',
            balance: DEFAULT_BALANCE,
            usedBalance: 0,
            kycStatus: 'not_started',
            isVerified: false,
            withdrawalBlocked: false,
            createdAt: new Date().toISOString()
        };

        const createdUser = await dbAdapter.users.create(newUser);

        const token = jwt.sign(
            { id: createdUser.id, email: createdUser.email, role: createdUser.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: createdUser.id,
                name: createdUser.name,
                email: createdUser.email,
                role: createdUser.role,
                balance: Number(createdUser.balance),
                kycStatus: createdUser.kycStatus,
                withdrawalBlocked: createdUser.withdrawalBlocked
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

        const user = await dbAdapter.users.findByEmail(email);

        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
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
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Check Auth
router.get('/check', authenticateToken, async (req, res) => {
    try {
        const user = await dbAdapter.users.findById(req.user.id);
        if (!user) {
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
