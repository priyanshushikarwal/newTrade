const express = require('express');
const dbAdapter = require('../db-adapter');

const router = express.Router();

// Get Withdrawal Charges (Public)
router.get('/withdrawal-charges', async (req, res) => {
    try {
        const settings = await dbAdapter.settings.get();
        res.json(settings.withdrawalCharges);
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

// Get WhatsApp Number (Public)
router.get('/whatsapp', async (req, res) => {
    try {
        const settings = await dbAdapter.settings.get();
        res.json({ whatsappNumber: settings.whatsappNumber });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

// Get QR Code (Public)
router.get('/qr-code', async (req, res) => {
    try {
        const settings = await dbAdapter.settings.get();
        if (!settings.qrCodeUrl) {
            return res.status(404).json({ message: 'No QR code available' });
        }
        res.json({ qrCodeUrl: settings.qrCodeUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
});

module.exports = router;
