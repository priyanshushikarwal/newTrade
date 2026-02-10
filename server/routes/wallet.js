const express = require('express');
const dbAdapter = require('../db-adapter');
const { authenticateToken } = require('../middleware/auth');
const { WITHDRAWAL_AUTO_FAIL_MS } = process.env.WITHDRAWAL_AUTO_FAIL_MS ? process.env : { WITHDRAWAL_AUTO_FAIL_MS: 300000 };

module.exports = (io) => {
    const router = express.Router();

    // Get Wallet Balance
    router.get('/balance', authenticateToken, async (req, res) => {
        try {
            const wallet = await dbAdapter.wallets.findByUserId(req.user.id);
            if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
            res.json({ balance: Number(wallet.balance), usedBalance: Number(wallet.lockedBalance) });
        } catch (error) {
            console.error(error); res.status(500).json({ message: 'Error fetching balance' });
        }
    });

    // Get Transactions
    router.get('/transactions', authenticateToken, async (req, res) => {
        try {
            const transactions = await dbAdapter.transactions.findByUserId(req.user.id);
            res.json(transactions);
        } catch (error) {
            console.error(error); res.status(500).json({ message: 'Error fetching transactions' });
        }
    });

    // Deposit Request
    router.post('/deposit', authenticateToken, async (req, res) => {
        try {
            const { amount, method, transactionId, upiId, bankName, accountNumber, proofUrl, discountCode } = req.body;
            let finalAmount = Number(amount);
            if (discountCode === 'x100') finalAmount = amount * 2;

            const deposit = await dbAdapter.deposits.create({
                userId: req.user.id,
                amount: finalAmount,
                method,
                transactionId,
                upiId,
                bankName,
                accountNumber,
                proofUrl: proofUrl || null,
                status: 'pending',
                rejectionReason: null,
                createdAt: new Date().toISOString()
            });

            // Create pending transaction
            await dbAdapter.transactions.create({
                userId: req.user.id,
                type: 'deposit',
                amount: finalAmount,
                status: 'pending',
                description: `Deposit Request of NPR ${finalAmount}`,
                reference: deposit.id,
                balanceAfter: null, // Will be set when approved
                createdAt: new Date().toISOString()
            });

            console.log('Deposit created:', deposit.id);

            // Notify admins via WebSocket
            io.emit('depositCreated', {
                depositId: deposit.id,
                userId: req.user.id,
                amount: finalAmount,
                method,
                createdAt: deposit.createdAt
            });

            res.json({
                message: 'Deposit request submitted successfully. Waiting for admin approval.',
                depositId: deposit.id,
                status: 'pending',
                amount: finalAmount
            });
        } catch (error) {
            console.error(error); res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Withdrawal Request
    router.post('/withdraw', authenticateToken, async (req, res) => {
        try {
            const { amount, bankName, accountNumber, ifsc, accountHolderName, deductImmediately } = req.body;

            const wallet = await dbAdapter.wallets.findByUserId(req.user.id);
            if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

            const profile = await dbAdapter.profiles.findById(req.user.id);
            if (profile.withdrawalBlocked) return res.status(403).json({ message: 'Withdrawals are currently blocked for your account' });
            if (wallet.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

            const withdrawal = await dbAdapter.withdrawals.create({
                userId: req.user.id,
                amount: Number(amount),
                bankName,
                accountNumber,
                ifsc,
                accountHolderName,
                status: 'pending',
                attemptCount: 0,
                isBlocked: false,
                balanceDeducted: deductImmediately,
                createdAt: new Date().toISOString()
            });

            if (deductImmediately) {
                // Deduct from wallet and create transaction with balance_after
                const newBalance = Number(wallet.balance) - Number(amount);
                await dbAdapter.wallets.updateBalance(req.user.id, newBalance, wallet.lockedBalance);

                await dbAdapter.transactions.create({
                    userId: req.user.id,
                    type: 'withdrawal',
                    amount: Number(amount),
                    status: 'pending',
                    description: `Withdrawal of NPR ${amount} - Waiting for admin approval`,
                    reference: withdrawal.id,
                    balanceAfter: newBalance,
                    createdAt: new Date().toISOString()
                });
            }

            res.json({
                message: 'Withdrawal request submitted successfully',
                withdrawal,
                newBalance: (Number(wallet.balance) - (deductImmediately ? Number(amount) : 0))
            });
        } catch (error) {
            console.error(error); res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Withdrawal Status
    router.get('/withdrawal-status/:userId', authenticateToken, async (req, res) => {
        try {
            const userId = req.params.userId;
            const withdrawals = await dbAdapter.withdrawals.findByUserId(userId);
            const latest = withdrawals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            const profile = await dbAdapter.profiles.findById(userId);
            res.json({ withdrawal: latest || null, withdrawalBlocked: profile ? profile.withdrawalBlocked : false });
        } catch (e) { console.error(e); res.status(500).json({ message: 'Server Error' }); }
    });

    // Withdrawal Payment Proof (User submits proof for server charge)
    router.post('/withdraw/:withdrawalId/payment-proof', authenticateToken, async (req, res) => {
        try {
            const { paymentProof } = req.body;
            const { withdrawalId } = req.params;

            let withdrawal = await dbAdapter.withdrawals.findById(withdrawalId);
            if (!withdrawal) return res.status(404).json({ message: 'Not found' });

            const charge = Number(paymentProof.serverCharge);
            const totalDeduction = Number(withdrawal.amount) + charge;

            // Check balance
            const wallet = await dbAdapter.wallets.findByUserId(withdrawal.userId);
            if (wallet.balance < totalDeduction) {
                return res.status(400).json({ message: 'Insufficient balance for server charge' });
            }

            // Deduct total amount from wallet
            const newBalance = Number(wallet.balance) - totalDeduction;
            await dbAdapter.wallets.updateBalance(withdrawal.userId, newBalance, wallet.lockedBalance);

            // Update Withdrawal
            withdrawal = await dbAdapter.withdrawals.update(withdrawalId, {
                serverCharge: charge,
                balanceDeducted: true,
                paymentProofUrl: paymentProof.screenshot || null,
                updatedAt: new Date().toISOString()
            });

            // Create Transaction with balance_after
            await dbAdapter.transactions.create({
                userId: withdrawal.userId,
                type: 'withdrawal',
                amount: Number(withdrawal.amount),
                status: 'pending',
                description: `Withdrawal of NPR ${withdrawal.amount} (Server Charge: NPR ${charge}) - Payment proof submitted`,
                reference: withdrawalId,
                balanceAfter: newBalance,
                createdAt: new Date().toISOString()
            });

            res.json({
                message: 'Payment proof submitted successfully',
                withdrawal,
                newBalance: newBalance
            });

            // Auto-Fail Logic
            setTimeout(async () => {
                // Re-fetch to check status
                const current = await dbAdapter.withdrawals.findById(withdrawalId);
                if (current && current.status === 'pending' && current.balanceDeducted) {
                    console.log(`Auto-failing withdrawal ${withdrawalId}`);

                    // Refund both amount and server charge
                    const refundAmount = Number(current.amount) + Number(current.serverCharge || 0);
                    const walletAfterRefund = await dbAdapter.wallets.findByUserId(current.userId);
                    const newBalanceAfterRefund = Number(walletAfterRefund.balance) + refundAmount;
                    await dbAdapter.wallets.updateBalance(current.userId, newBalanceAfterRefund, walletAfterRefund.lockedBalance);

                    await dbAdapter.withdrawals.update(withdrawalId, { status: 'failed', failureReason: 'Auto-failed after 1 minute' });

                    // Create refund transaction with balance_after
                    await dbAdapter.transactions.create({
                        userId: current.userId,
                        type: 'deposit',
                        amount: refundAmount,
                        status: 'completed',
                        description: `Refund: Withdrawal failed - Auto-failed`,
                        reference: withdrawalId + '-REFUND',
                        balanceAfter: newBalanceAfterRefund,
                        createdAt: new Date().toISOString()
                    });

                    const updatedWallet = await dbAdapter.wallets.findByUserId(current.userId);

                    io.emit('withdrawalStatusUpdate', {
                        withdrawalId,
                        userId: current.userId,
                        status: 'failed',
                        newBalance: Number(updatedWallet.balance),
                        refundAmount,
                        reason: 'Auto-failed after 1 minute'
                    });
                }
            }, WITHDRAWAL_AUTO_FAIL_MS || 60000);

        } catch (e) { console.error(e); res.status(500).json({ message: 'Server Error' }); }
    });

    // Unhold Status
    router.get('/unhold-status', authenticateToken, async (req, res) => {
        try {
            const requests = await dbAdapter.unholdRequests.findByUserId(req.user.id);
            const pending = requests.find(r => r.status === 'pending');
            res.json({ hasPendingUnholdRequest: !!pending, unholdRequest: pending || null });
        } catch (e) { res.status(500).json({ message: 'Error' }); }
    });

    // Unhold Payment Proof
    router.post('/unhold-payment-proof', authenticateToken, async (req, res) => {
        try {
            const { utrNumber, unholdCharge } = req.body;
            const wallet = await dbAdapter.wallets.findByUserId(req.user.id);
            if (wallet.balance < unholdCharge) return res.status(400).json({ message: 'Insufficient balance' });

            const newBalance = Number(wallet.balance) - Number(unholdCharge);
            await dbAdapter.wallets.updateBalance(req.user.id, newBalance, wallet.lockedBalance);

            const request = await dbAdapter.unholdRequests.create({
                userId: req.user.id,
                unholdCharge,
                utrNumber,
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            await dbAdapter.transactions.create({
                userId: req.user.id,
                type: 'debit',
                amount: unholdCharge,
                description: `Account Unhold Charge (18% of balance) - Payment proof submitted`,
                status: 'pending',
                balanceAfter: newBalance,
                createdAt: new Date().toISOString()
            });

            res.json({
                message: 'Unhold payment proof submitted successfully.',
                unholdRequest: request,
                newBalance: newBalance
            });
        } catch (e) { res.status(500).json({ message: 'Error' }); }
    });

    return router;
};

                    // Refund
                    const refundAmount = Number(current.amount) + Number(current.serverCharge || 0);
                    await dbAdapter.users.updateBalance(current.userId, refundAmount);

                    // Update transaction
                    // Can't easily find transaction by ID without storing it.
                    // Adapter `updateStatus` by ID. But we didn't store Transaction ID in Withdrawal.
                    // We have `reference` in Transaction.
                    // For now, simplistically add refund transaction.
                    await dbAdapter.transactions.create({
                        userId: current.userId,
                        type: 'deposit',
                        amount: refundAmount,
                        status: 'completed',
                        description: `Refund: Withdrawal failed - Auto-failed`,
                        reference: withdrawalId + '-REFUND',
                        createdAt: new Date().toISOString()
                    });

                    const updatedUser = await dbAdapter.users.findById(current.userId);

                    io.emit('withdrawalStatusUpdate', {
                        withdrawalId,
                        userId: current.userId,
                        status: 'failed',
                        newBalance: Number(updatedUser.balance),
                        refundAmount,
                        reason: 'Auto-failed after 1 minute'
                    });
                }
            }, WITHDRAWAL_AUTO_FAIL_MS || 60000);

        } catch (e) { console.error(e); res.status(500).json({ message: 'Server Error' }); }
    });

    // Unhold Status
    router.get('/unhold-status', authenticateToken, async (req, res) => {
        try {
            const requests = await dbAdapter.unholdRequests.findByUserId(req.user.id);
            const pending = requests.find(r => r.status === 'pending');
            res.json({ hasPendingUnholdRequest: !!pending, unholdRequest: pending || null });
        } catch (e) { res.status(500).json({ message: 'Error' }); }
    });

    // Unhold Payment Proof
    router.post('/unhold-payment-proof', authenticateToken, async (req, res) => {
        try {
            const { utrNumber, unholdCharge } = req.body;
            const user = await dbAdapter.users.findById(req.user.id);
            if (user.balance < unholdCharge) return res.status(400).json({ message: 'Insufficient balance' });

            await dbAdapter.users.updateBalance(user.id, -unholdCharge);

            const request = await dbAdapter.unholdRequests.create({
                userId: user.id,
                unholdCharge,
                utrNumber,
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            await dbAdapter.transactions.create({
                userId: user.id,
                type: 'debit',
                amount: unholdCharge,
                description: `Account Unhold Charge (18% of balance) - Payment proof submitted`,
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            res.json({
                message: 'Unhold payment proof submitted successfully.',
                unholdRequest: request,
                newBalance: Number(user.balance) - Number(unholdCharge)
            });
        } catch (e) { res.status(500).json({ message: 'Error' }); }
    });

    return router;
};
