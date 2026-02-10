const express = require('express');
const dbAdapter = require('../db-adapter');
const { authenticateToken } = require('../middleware/auth');
const { instruments } = require('../constants');

const router = express.Router();

// Get Instruments
router.get('/market/instruments', (req, res) => {
    res.json(instruments);
});

router.get('/market/instrument/:symbol', (req, res) => {
    const instrument = instruments.find(i => i.symbol === req.params.symbol);
    if (!instrument) {
        return res.status(404).json({ message: 'Instrument not found' });
    }
    res.json(instrument);
});

router.get('/market/orderbook/:symbol', (req, res) => {
    const instrument = instruments.find(i => i.symbol === req.params.symbol);
    if (!instrument) {
        return res.status(404).json({ message: 'Instrument not found' });
    }

    // Generate mock order book
    const bids = [];
    const asks = [];

    for (let i = 0; i < 10; i++) {
        bids.push({
            price: instrument.price - (i + 1) * 0.05,
            quantity: Math.floor(Math.random() * 1000) + 100
        });
        asks.push({
            price: instrument.price + (i + 1) * 0.05,
            quantity: Math.floor(Math.random() * 1000) + 100
        });
    }

    res.json({ bids, asks });
});

// Create Order
router.post('/orders', authenticateToken, async (req, res) => {
    try {
        const { symbol, type, side, quantity, price, stopLoss, takeProfit } = req.body;

        const user = await dbAdapter.users.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const instrument = instruments.find(i => i.symbol === symbol);
        if (!instrument) {
            return res.status(404).json({ message: 'Instrument not found' });
        }

        const orderPrice = type === 'market' ? instrument.price : price;
        const orderValue = orderPrice * quantity;

        // Check balance
        // Note: usedBalance logic in original code:
        // "availableBalance = user.balance - user.usedBalance"
        // "if buy && available < value -> error"
        // "if market buy -> balance -= value, usedBalance += value"
        // Wait, if balance is deducted, why add to usedBalance?
        // Original Code (Line 919): db.users[ix].balance -= orderValue; db.users[ix].usedBalance += orderValue;
        // This implies "Invested Amount" is tracked in `usedBalance`.
        // And `balance` is "Cash Balance"?? No, usually `balance` is total.
        // Line 329: available = balance - usedBalance.
        // So if I subtract from balance AND add to usedBalance, I double count the deduction from available?
        // Example: Balance 1000, Used 0. Available 1000.
        // Buy 100.
        // Balance becomes 900. Used becomes 100.
        // Available = 900 - 100 = 800? 
        // This means the user lost 100 cash AND has 100 blocked?
        // This seems weird logic in original code but I MUST FOLLOW IT.

        // Check available
        const availableBalance = user.balance - user.usedBalance;
        if (side === 'buy' && availableBalance < orderValue) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Create Order
        const order = await dbAdapter.orders.create({
            userId: req.user.id,
            symbol,
            type,
            side,
            quantity,
            price: orderPrice,
            stopLoss,
            takeProfit,
            status: type === 'market' ? 'executed' : 'pending',
            executedAt: type === 'market' ? new Date().toISOString() : null,
            createdAt: new Date().toISOString()
        });

        // Update User Balance logic (Market Orders)
        if (type === 'market') {
            if (side === 'buy') {
                // balance -= val, used += val
                // We need separate update calls or one call if adapter supports objects
                const newBalance = Number(user.balance) - orderValue;
                const newUsed = Number(user.usedBalance) + orderValue;
                await dbAdapter.users.update(user.id, { balance: newBalance, usedBalance: newUsed });

                await dbAdapter.transactions.create({
                    userId: user.id,
                    type: 'withdrawal',
                    amount: orderValue,
                    description: `BUY ${quantity} ${symbol} @ NPR ${orderPrice}`,
                    status: 'completed',
                    createdAt: new Date().toISOString()
                });
            } else {
                // Sell: balance += val, used -= val
                const newBalance = Number(user.balance) + orderValue;
                const newUsed = Number(user.usedBalance) - orderValue;
                // Note: Sell logic assumes you had the stock which contributed to usedBalance.
                // Original code blindly reduces usedBalance.
                await dbAdapter.users.update(user.id, { balance: newBalance, usedBalance: newUsed });

                await dbAdapter.transactions.create({
                    userId: user.id,
                    type: 'credit',
                    amount: orderValue,
                    description: `SELL ${quantity} ${symbol} @ NPR ${orderPrice}`,
                    status: 'completed',
                    createdAt: new Date().toISOString()
                });
            }
        }

        res.json({ message: 'Order placed successfully', order });
    } catch (error) {
        console.error(error); res.status(500).json({ message: 'Server error' });
    }
});

router.get('/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await dbAdapter.orders.findByUserId(req.user.id);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

router.delete('/orders/:orderId', authenticateToken, async (req, res) => {
    try {
        const order = await dbAdapter.orders.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.userId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
        if (order.status !== 'pending') return res.status(400).json({ message: 'Can only cancel pending' });

        await dbAdapter.orders.updateStatus(order.id, 'cancelled');
        res.json({ message: 'Order cancelled successfully' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// Portfolio Holdings
router.get('/portfolio/holdings', authenticateToken, async (req, res) => {
    try {
        const orders = await dbAdapter.orders.findByUserId(req.user.id);
        const executed = orders.filter(o => o.status === 'executed');

        const holdingsMap = {};
        executed.forEach(order => {
            if (!holdingsMap[order.symbol]) {
                holdingsMap[order.symbol] = { quantity: 0, totalCost: 0 };
            }
            const price = Number(order.price);
            const qty = Number(order.quantity);

            if (order.side === 'buy') {
                holdingsMap[order.symbol].totalCost += price * qty;
                holdingsMap[order.symbol].quantity += qty;
            } else {
                // Sell logic reduces quantity. Does it reduce totalCost?
                // Original logic: just quantity. Avg price calculation handles Cost/Qty.
                // Wait, original:
                // if buy: cost += p*q, qty += q
                // if sell: qty -= q. (Cost remains same???)
                // Line 977: quantity -= order.quantity.
                // Line 981: if qty > 0, avgPrice = totalCost / quantity.
                // This implies Selling DOES NOT reduce Total Cost invested? 
                // This means Avg Price SPIKES if you sell?
                // Example: Buy 10 @ 100. Cost 1000. Avg 100.
                // Sell 5 @ 120. Qty 5. Cost 1000. Avg 200 ???
                // YES. The original logic is flawed or simplified. 
                // "please koi dialog ... flow ko change mat krna".
                // I MUST PRESERVE ORIGINAL LOGIC even if flawed.
                holdingsMap[order.symbol].quantity -= qty;
            }
        });

        const holdings = Object.entries(holdingsMap)
            .filter(([, data]) => data.quantity > 0)
            .map(([symbol, data]) => {
                const instrument = instruments.find(i => i.symbol === symbol);
                // Recalculate avgPrice based on remaining quantity and accumulated cost
                const avgPrice = data.totalCost / data.quantity;
                const currentPrice = instrument ? instrument.price : avgPrice;
                const currentValue = currentPrice * data.quantity;
                const investedValue = avgPrice * data.quantity; // equivalent to totalCost
                const pnl = currentValue - investedValue;
                const pnlPercent = (pnl / investedValue) * 100;

                return {
                    symbol,
                    name: instrument?.name || symbol,
                    quantity: data.quantity,
                    avgPrice,
                    currentPrice,
                    investedValue,
                    currentValue,
                    pnl,
                    pnlPercent
                };
            });

        res.json(holdings);
    } catch (e) { console.error(e); res.status(500).json({ message: 'Error' }); }
});

router.get('/portfolio/summary', authenticateToken, async (req, res) => {
    try {
        const user = await dbAdapter.users.findById(req.user.id);
        const orders = await dbAdapter.orders.findByUserId(req.user.id);
        const executed = orders.filter(o => o.status === 'executed');

        const holdingsMap = {};
        executed.forEach(order => {
            if (!holdingsMap[order.symbol]) holdingsMap[order.symbol] = { quantity: 0, totalCost: 0 };
            const px = Number(order.price);
            const qt = Number(order.quantity);
            if (order.side === 'buy') {
                holdingsMap[order.symbol].totalCost += px * qt;
                holdingsMap[order.symbol].quantity += qt;
            } else {
                holdingsMap[order.symbol].quantity -= qt;
            }
        });

        let totalInvested = 0;
        let currentValue = 0;

        Object.entries(holdingsMap).forEach(([symbol, data]) => {
            if (data.quantity > 0) {
                totalInvested += data.totalCost;
                const instrument = instruments.find(i => i.symbol === symbol);
                currentValue += (instrument?.price || 0) * data.quantity;
            }
        });

        const totalPnl = currentValue - totalInvested;
        const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

        res.json({
            totalInvested,
            currentValue,
            totalPnl,
            totalPnlPercent,
            availableBalance: user.balance, // Note: response format matches original
            usedBalance: user.usedBalance
        });
    } catch (e) { console.error(e); res.status(500).json({ message: 'Error' }); }
});

module.exports = router;
