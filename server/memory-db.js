// In-memory database fallback
const db = {
    users: [
        {
            id: 'USR-DEMO',
            name: 'Demo User',
            email: 'demo@tradex.com',
            password: 'demo123',
            phone: '9876543210',
            role: 'user',
            balance: 0,
            usedBalance: 0,
            kycStatus: 'verified',
            isVerified: true,
            withdrawalBlocked: false,
            createdAt: new Date().toISOString()
        },
        {
            id: 'USR-ADMIN',
            name: 'Admin',
            email: 'admin@tradepro.com',
            password: 'admin123',
            phone: '9876543211',
            role: 'admin',
            balance: 0,
            usedBalance: 0,
            kycStatus: 'verified',
            isVerified: true,
            withdrawalBlocked: false,
            createdAt: new Date().toISOString()
        }
    ],
    orders: [],
    transactions: [
        {
            id: 'TXN-SAMPLE-1',
            userId: 'USR-DEMO',
            type: 'withdrawal',
            amount: 5000,
            status: 'pending',
            description: 'Withdrawal of NPR 5000 - Waiting for admin approval',
            createdAt: new Date().toISOString()
        }
    ],
    kycRequests: [],
    depositRequests: [],
    withdrawalRequests: [
        {
            id: 'WD-SAMPLE-1',
            userId: 'USR-DEMO',
            amount: 5000,
            bankName: 'Nepal Bank',
            accountNumber: '1234567890',
            ifsc: 'NEPAL001',
            accountHolderName: 'Demo User',
            status: 'pending',
            attemptCount: 1,
            isBlocked: false,
            balanceDeducted: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: 'WD-SAMPLE-2',
            userId: 'USR-DEMO',
            amount: 10000,
            bankName: 'Himalayan Bank',
            accountNumber: '9876543210',
            ifsc: 'HIMA001',
            accountHolderName: 'Demo User',
            status: 'pending',
            attemptCount: 1,
            isBlocked: false,
            balanceDeducted: true,
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            updatedAt: new Date(Date.now() - 3600000).toISOString()
        }
    ],
    supportTickets: [],
    alerts: [],
    unholdRequests: [],
    settings: {
        withdrawalCharges: {
            serverCharge: { label: 'Server Charge', percentage: 9.0 },
            commission: { label: 'Commission', percentage: 1.5 },
            bankElectCharge: { label: 'Bank Elect Charge', percentage: 9.0 },
            serverCommissionHolding: { label: 'Server Commission Holding', percentage: 2.0 },
            accountClosure: { label: 'Account Closure', percentage: 18.0 }
        },
        whatsappNumber: '919876543210',
        qrCodeUrl: null
    }
};

module.exports = db;
