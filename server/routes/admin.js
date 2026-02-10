const express = require('express');
const dbAdapter = require('../db-adapter');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

module.exports = (io) => {
    const router = express.Router();

    // Middleware to ensure Admin
    const ensureAdmin = async (req, res, next) => {
        const profile = await dbAdapter.profiles.findById(req.user.id);
        if (profile?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
        next();
    };

    router.use(ensureAdmin);

    // Users List
    router.get('/users', async (req, res) => {
        const profiles = await dbAdapter.profiles.getAll();
        // Enrich with wallet balances
        const enriched = await Promise.all(profiles.map(async (profile) => {
            const wallet = await dbAdapter.wallets.findByUserId(profile.id);
            return {
                ...profile,
                balance: wallet ? Number(wallet.balance) : 0,
                lockedBalance: wallet ? Number(wallet.lockedBalance) : 0
            };
        }));
        res.json(enriched);
    });

    // Deposits
    router.get('/deposits', async (req, res) => {
        const deposits = await dbAdapter.deposits.getAll();
        // Enrich with user info
        const profiles = await dbAdapter.profiles.getAll();
        const profileMap = {};
        profiles.forEach(p => profileMap[p.id] = p);

        const enriched = deposits.map(d => ({
            ...d,
            userName: profileMap[d.userId]?.name || 'Unknown',
            userEmail: profileMap[d.userId]?.email || 'Unknown'
        }));
        res.json(enriched);
    });

    router.post('/deposits/:id/approve', async (req, res) => {
        try {
            const { id } = req.params;
            const deposit = await dbAdapter.deposits.findById(id);
            if (!deposit) return res.status(404).json({ message: 'Not found' });

            await dbAdapter.deposits.update(id, { status: 'approved' });

            // Add to wallet balance
            const wallet = await dbAdapter.wallets.findByUserId(deposit.userId);
            const newBalance = Number(wallet.balance) + Number(deposit.amount);
            await dbAdapter.wallets.updateBalance(deposit.userId, newBalance, wallet.lockedBalance);

            // Create transaction with balance_after
            await dbAdapter.transactions.create({
                userId: deposit.userId,
                type: 'deposit',
                amount: Number(deposit.amount),
                description: 'Deposit approved',
                status: 'completed',
                reference: id,
                balanceAfter: newBalance,
                createdAt: new Date().toISOString()
            });

            res.json({ message: 'Deposit approved successfully' });
        } catch (e) { res.status(500).json({ message: 'Error' }); }
    });

    router.post('/deposits/:id/reject', async (req, res) => {
        const { reason } = req.body;
        const { id } = req.params;
        const deposit = await dbAdapter.deposits.findById(id);
        if (!deposit) return res.status(404).json({ message: 'Not found' });
        await dbAdapter.deposits.update(id, {
            status: 'rejected',
            rejectionReason: reason,
            rejectedAt: new Date().toISOString()
        });
        res.json({ message: 'Deposit rejected' });
    });

    // Withdrawals
    router.get('/withdrawals', async (req, res) => {
        const withdrawals = await dbAdapter.withdrawals.getAll();
        // Enrich with user info
        const profiles = await dbAdapter.profiles.getAll();
        const profileMap = {};
        profiles.forEach(p => profileMap[p.id] = p);

        const enriched = withdrawals.map(w => ({
            ...w,
            userName: profileMap[w.userId]?.name || 'Unknown',
            userEmail: profileMap[w.userId]?.email || 'Unknown'
        }));
        res.json(enriched);
    });

    // Start Processing (Complex Logic)
    router.post('/withdrawals/:id/start-processing', async (req, res) => {
        const { duration } = req.body;
        const { id } = req.params;

        const withdrawal = await dbAdapter.withdrawals.findById(id);
        if (!withdrawal) return res.status(404).json({ message: 'Not found' });

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + duration * 60000);

        await dbAdapter.withdrawals.update(id, {
            status: 'processing',
            processingStartTime: startTime.toISOString(),
            processingEndTime: endTime.toISOString(),
            processingDuration: duration,
            updatedAt: new Date().toISOString()
        });

        io.emit('withdrawalStatusUpdate', {
            withdrawalId: id,
            userId: withdrawal.userId,
            status: 'processing',
            processingEndTime: endTime.toISOString()
        });

        // Auto-logic State Machine
        setTimeout(async () => {
            const current = await dbAdapter.withdrawals.findById(id);
            if (!current || current.status !== 'processing') return;

            // Count failures
            const userWithdrawals = await dbAdapter.withdrawals.findByUserId(current.userId);
            const failures = userWithdrawals.filter(w => w.status === 'failed' && w.id !== id).length;

            if (failures >= 2) {
                // 3rd attempt -> Hold
                await dbAdapter.withdrawals.update(id, { status: 'on_hold', failureReason: 'Account on hold due to technical server errors' });
                io.emit('withdrawalStatusUpdate', {
                    withdrawalId: id,
                    userId: current.userId,
                    status: 'on_hold',
                    reason: 'Account on hold due to technical server errors'
                });
            } else if (failures >= 1) {
                // 2nd attempt -> Success temporarily
                await dbAdapter.withdrawals.update(id, { status: 'completed', completedAt: new Date().toISOString() });
                io.emit('withdrawalStatusUpdate', { withdrawalId: id, userId: current.userId, status: 'completed' });

                // Fail after 1 min
                setTimeout(async () => {
                    const completed = await dbAdapter.withdrawals.findById(id);
                    if (completed && completed.status === 'completed') {
                        const reason = 'Due Bank Electronic Charge';
                        await dbAdapter.withdrawals.update(id, { status: 'failed', failureReason: reason });

                        // Refund logic
                        if (completed.balanceDeducted) {
                            const refund = Number(completed.amount) + Number(completed.serverCharge || 0);
                            const wallet = await dbAdapter.wallets.findByUserId(completed.userId);
                            const newBalance = Number(wallet.balance) + refund;
                            await dbAdapter.wallets.updateBalance(completed.userId, newBalance, wallet.lockedBalance);

                            // Create refund transaction
                            await dbAdapter.transactions.create({
                                userId: completed.userId,
                                type: 'deposit',
                                amount: refund,
                                status: 'completed',
                                description: `Refund: Withdrawal failed - ${reason}`,
                                reference: id + '-REFUND',
                                balanceAfter: newBalance,
                                createdAt: new Date().toISOString()
                            });

                            io.emit('withdrawalStatusUpdate', { withdrawalId: id, userId: completed.userId, status: 'failed', refundAmount: refund, reason });
                        }
                    }
                }, 60000);
            } else {
                // 1st attempt -> Fail
                await dbAdapter.withdrawals.update(id, { status: 'failed', failureReason: 'Auto-failed after 1 minute' });
                if (current.balanceDeducted) {
                    const refund = Number(current.amount) + Number(current.serverCharge || 0);
                    const wallet = await dbAdapter.wallets.findByUserId(current.userId);
                    const newBalance = Number(wallet.balance) + refund;
                    await dbAdapter.wallets.updateBalance(current.userId, newBalance, wallet.lockedBalance);

                    // Create refund transaction
                    await dbAdapter.transactions.create({
                        userId: current.userId,
                        type: 'deposit',
                        amount: refund,
                        status: 'completed',
                        description: `Refund: Withdrawal failed - Auto-failed after 1 minute`,
                        reference: id + '-REFUND',
                        balanceAfter: newBalance,
                        createdAt: new Date().toISOString()
                    });

                    io.emit('withdrawalStatusUpdate', { withdrawalId: id, userId: current.userId, status: 'failed', refundAmount: refund, reason: 'Auto-failed after 1 minute' });
                }
            }
        }, 60000);

        res.json({ message: 'Processing started', processingEndTime: endTime, duration });
    });

    router.post('/withdrawals/:id/approve', async (req, res) => {
        const { transactionRef } = req.body;
        const { id } = req.params;
        const withdrawal = await dbAdapter.withdrawals.findById(id);

        // Deduct balance only if not already deducted
        if (!withdrawal.balanceDeducted) {
            const wallet = await dbAdapter.wallets.findByUserId(withdrawal.userId);
            if (Number(wallet.balance) < Number(withdrawal.amount)) return res.status(400).json({ message: 'Insufficient balance' });

            const newBalance = Number(wallet.balance) - Number(withdrawal.amount);
            await dbAdapter.wallets.updateBalance(withdrawal.userId, newBalance, wallet.lockedBalance);

            // Create transaction
            await dbAdapter.transactions.create({
                userId: withdrawal.userId,
                type: 'withdrawal',
                amount: Number(withdrawal.amount),
                status: 'completed',
                description: `Withdrawal completed - ${transactionRef}`,
                reference: id,
                balanceAfter: newBalance,
                createdAt: new Date().toISOString()
            });
        }

        await dbAdapter.profiles.update(withdrawal.userId, { withdrawalBlocked: false }); // Unblock
        await dbAdapter.withdrawals.update(id, {
            status: 'completed',
            transactionRef,
            balanceDeducted: true,
            completedAt: new Date().toISOString()
        });

        res.json({ message: 'Withdrawal processed' });
    });

    // Settings
    router.get('/settings', async (req, res) => {
        const settings = await dbAdapter.adminSettings.get();
        res.json(settings);
    });

    router.put('/settings/withdrawal-charges', async (req, res) => {
        const { charges } = req.body;
        await dbAdapter.adminSettings.update({ withdrawalCharges: charges });
        res.json({ message: 'Updated', charges });
    });

    // QR Upload
    router.post('/settings/qr-code', upload.single('qrCode'), async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'No file' });
        const url = `${req.protocol}://${req.get('host')}/uploads/qr-codes/${req.file.filename}`;
        await dbAdapter.adminSettings.update({ qrCodeUrl: url });
        res.json({ message: 'QR Uploaded', qrCodeUrl: url });
    });

    // Delete QR Code
    router.delete('/settings/qr-code', async (req, res) => {
        const settings = await dbAdapter.adminSettings.get();
        if (settings.qrCodeUrl) {
            try {
                const urlParts = settings.qrCodeUrl.split('/');
                const filename = urlParts[urlParts.length - 1];
                const filePath = path.join(__dirname, '../uploads', 'qr-codes', filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                await dbAdapter.adminSettings.update({ qrCodeUrl: null });
            } catch (e) { console.error(e); }
        }
        res.json({ message: 'QR code deleted successfully' });
    });

    return router;
};

