const supabase = require('./supabase');
const memoryDb = require('./memory-db');

// Helper to convert Snake Case (DB) to Camel Case (App)
const toCamel = (obj) => {
    if (!obj) return null;
    const newObj = {};
    for (const key in obj) {
        const newKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        newObj[newKey] = obj[key];
    }
    return newObj;
};

// Helper to convert Camel Case (App) to Snake Case (DB)
const toSnake = (obj) => {
    if (!obj) return null;
    const newObj = {};
    for (const key in obj) {
        const newKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        newObj[newKey] = obj[key];
    }
    return newObj;
};

const isSupabaseEnabled = !!supabase;

const dbAdapter = {
    get isSupabaseEnabled() { return isSupabaseEnabled; },

    users: {
        findByEmail: async (email) => {
            if (!isSupabaseEnabled) return memoryDb.users.find(u => u.email === email);
            const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding user:', error);
            return toCamel(data);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.users.find(u => u.id === id);
            const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding user by ID:', error);
            return toCamel(data);
        },
        create: async (user) => {
            if (!isSupabaseEnabled) {
                memoryDb.users.push(user);
                return user;
            }
            // Omit ID if usage implies DB generation, but current app generates ID.
            // Schema uses UUID. App generates string USR-.... 
            // We MUST use the App-generated ID if possible (UUID compatible) OR let DB generate.
            // Since schema is UUID, USR-... will fail.
            // Strategy: Omit ID and let DB generate UUID. Return the new UUID.
            const { id, ...userData } = user;
            const snakeUser = toSnake(userData);

            const { data, error } = await supabase.from('users').insert(snakeUser).select().single();
            if (error) { throw new Error(error.message); }
            return toCamel(data);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) {
                const idx = memoryDb.users.findIndex(u => u.id === id);
                if (idx !== -1) {
                    memoryDb.users[idx] = { ...memoryDb.users[idx], ...updates };
                    return memoryDb.users[idx];
                }
                return null;
            }
            const snakeUpdates = toSnake(updates);
            const { data, error } = await supabase.from('users').update(snakeUpdates).eq('id', id).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        updateBalance: async (id, amountToAdd) => {
            // Atomic increment isn't direct in generic update, need RPC or fetch-update.
            // For simplicity: fetch, calc, update.
            const user = await dbAdapter.users.findById(id);
            if (!user) return null;
            const newBalance = Number(user.balance) + Number(amountToAdd);
            return await dbAdapter.users.update(id, { balance: newBalance });
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.users;
            const { data } = await supabase.from('users').select('*');
            return data.map(toCamel);
        }
    },

    transactions: {
        create: async (transaction) => {
            if (!isSupabaseEnabled) {
                memoryDb.transactions.push(transaction);
                return transaction;
            }
            const { id, userId, ...txData } = transaction;
            // Map fields explicitly if needed
            const snakeTx = toSnake(txData);
            snakeTx.user_id = userId;

            const { data, error } = await supabase.from('transactions').insert(snakeTx).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findAllByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.transactions.filter(t => t.userId === userId);
            const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            return data.map(toCamel);
        },
        updateStatus: async (id, status, description, failureReason) => {
            if (!isSupabaseEnabled) {
                const t = memoryDb.transactions.find(tx => tx.id === id);
                if (t) { t.status = status; if (description) t.description = description; if (failureReason) t.failureReason = failureReason; }
                return t;
            }
            const updates = { status };
            if (description) updates.description = description;
            if (failureReason) updates.failure_reason = failureReason;

            const { data, error } = await supabase.from('transactions').update(updates).eq('id', id).select().single();
            return toCamel(data);
        },
        findRefundCandidates: async (userId, amount) => {
            // logic for matching refund transaction
            if (!isSupabaseEnabled) return []; // Simplification
            // Complex query, skipping for brevity in adapter, logic handled in caller usually
            return [];
        }
    },

    depositRequests: {
        create: async (request) => {
            if (!isSupabaseEnabled) { memoryDb.depositRequests.push(request); return request; }
            const { id, userId, ...rest } = request;
            const snake = toSnake(rest);
            snake.user_id = userId;
            const { data, error } = await supabase.from('deposit_requests').insert(snake).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.depositRequests;
            const { data } = await supabase.from('deposit_requests').select('*').order('created_at', { ascending: false });
            return data.map(toCamel);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) { /* memory update */ return {}; }
            const snake = toSnake(updates);
            const { data, error } = await supabase.from('deposit_requests').update(snake).eq('id', id).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.depositRequests.find(d => d.id === id);
            const { data } = await supabase.from('deposit_requests').select('*').eq('id', id).single();
            return toCamel(data);
        }
    },

    withdrawalRequests: {
        create: async (request) => {
            if (!isSupabaseEnabled) { memoryDb.withdrawalRequests.push(request); return request; }
            const { id, userId, paymentProof, ...rest } = request;
            const snake = toSnake(rest);
            snake.user_id = userId;
            // Handle paymentProof object -> flat columns or json? Schema has payment_proof_url.
            // Logic handled in caller? 
            // Actually, create usually happens before proof.
            const { data, error } = await supabase.from('withdrawal_requests').insert(snake).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.withdrawalRequests;
            const { data } = await supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false });
            // We might need to join users to get names? Or caller does it?
            // Caller (Admin route) did manual join. We can do it here or let caller fetch users.
            return data.map(toCamel);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.withdrawalRequests.filter(w => w.userId === userId);
            const { data } = await supabase.from('withdrawal_requests').select('*').eq('user_id', userId);
            return data.map(toCamel);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.withdrawalRequests.find(w => w.id === id);
            const { data } = await supabase.from('withdrawal_requests').select('*').eq('id', id).single();
            return toCamel(data);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) return {};
            const snake = toSnake(updates);
            const { data, error } = await supabase.from('withdrawal_requests').update(snake).eq('id', id).select().single();
            if (error) throw error;
            return toCamel(data);
        }
    },

    kycRequests: {
        create: async (reqData) => {
            if (!isSupabaseEnabled) { memoryDb.kycRequests.push(reqData); return reqData; }
            const { id, userId, ...rest } = reqData;
            const snake = toSnake(rest);
            snake.user_id = userId;
            const { data, error } = await supabase.from('kyc_requests').insert(snake).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.kycRequests.find(k => k.userId === userId);
            const { data } = await supabase.from('kyc_requests').select('*').eq('user_id', userId).single();
            if (!data) return null;
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.kycRequests;
            const { data } = await supabase.from('kyc_requests').select('*');
            return data.map(toCamel);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) return {};
            const snake = toSnake(updates);
            const { data, error } = await supabase.from('kyc_requests').update(snake).eq('id', id).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.kycRequests.find(k => k.id === id);
            const { data } = await supabase.from('kyc_requests').select('*').eq('id', id).single();
            return toCamel(data);
        }
    },

    orders: {
        create: async (order) => {
            if (!isSupabaseEnabled) { memoryDb.orders.push(order); return order; }
            const { id, userId, ...rest } = order;
            const snake = toSnake(rest);
            snake.user_id = userId;
            const { data, error } = await supabase.from('orders').insert(snake).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.orders.filter(o => o.userId === userId);
            const { data } = await supabase.from('orders').select('*').eq('user_id', userId);
            return data.map(toCamel);
        },
        updateStatus: async (id, status) => {
            if (!isSupabaseEnabled) return {};
            const { data } = await supabase.from('orders').update({ status }).eq('id', id).select().single();
            return toCamel(data);
        },
        delete: async (id) => {
            if (!isSupabaseEnabled) return {}; // mock
            await supabase.from('orders').delete().eq('id', id);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.orders.find(o => o.id === id);
            const { data } = await supabase.from('orders').select('*').eq('id', id).single();
            return toCamel(data);
        }
    },

    settings: {
        get: async () => {
            if (!isSupabaseEnabled) return memoryDb.settings;
            const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
            if (!data) return memoryDb.settings; // fallback or default
            // Reconstruct nested object
            return {
                withdrawalCharges: {
                    serverCharge: { label: 'Server Charge', percentage: Number(data.withdrawal_charges_server_charge) },
                    commission: { label: 'Commission', percentage: Number(data.withdrawal_charges_commission) },
                    bankElectCharge: { label: 'Bank Elect Charge', percentage: Number(data.withdrawal_charges_bank_elect_charge) },
                    serverCommissionHolding: { label: 'Server Commission Holding', percentage: Number(data.withdrawal_charges_server_commission_holding) },
                    accountClosure: { label: 'Account Closure', percentage: Number(data.withdrawal_charges_account_closure) }
                },
                whatsappNumber: data.whatsapp_number,
                qrCodeUrl: data.qr_code_url
            };
        },
        update: async (updates) => {
            // Maps nested updates to flat columns
            const flatUpdates = {};
            if (updates.withdrawalCharges) {
                if (updates.withdrawalCharges.serverCharge) flatUpdates.withdrawal_charges_server_charge = updates.withdrawalCharges.serverCharge.percentage;
                if (updates.withdrawalCharges.commission) flatUpdates.withdrawal_charges_commission = updates.withdrawalCharges.commission.percentage;
                if (updates.withdrawalCharges.bankElectCharge) flatUpdates.withdrawal_charges_bank_elect_charge = updates.withdrawalCharges.bankElectCharge.percentage;
                if (updates.withdrawalCharges.serverCommissionHolding) flatUpdates.withdrawal_charges_server_commission_holding = updates.withdrawalCharges.serverCommissionHolding.percentage;
                if (updates.withdrawalCharges.accountClosure) flatUpdates.withdrawal_charges_account_closure = updates.withdrawalCharges.accountClosure.percentage;
            }
            if (updates.whatsappNumber) flatUpdates.whatsapp_number = updates.whatsappNumber;
            if (updates.qrCodeUrl) flatUpdates.qr_code_url = updates.qrCodeUrl;

            if (!isSupabaseEnabled) return {};
            const { data } = await supabase.from('settings').update(flatUpdates).eq('id', 1).select().single();
            return data; // Caller might re-fetch clean obj
        }
    },

    supportTickets: {
        create: async (ticket) => {
            if (!isSupabaseEnabled) { memoryDb.supportTickets.push(ticket); return ticket; }
            const { id, userId, messages, ...rest } = ticket;
            const snake = toSnake(rest);
            snake.user_id = userId;
            const { data, error } = await supabase.from('support_tickets').insert(snake).select().single();
            if (error) throw error;
            // Insert messages
            if (messages && messages.length > 0) {
                const msgs = messages.map(m => ({ ticket_id: data.id, sender_role: m.sender, message: m.text }));
                await supabase.from('ticket_messages').insert(msgs);
            }
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.supportTickets.filter(t => t.userId === userId);
            const { data } = await supabase.from('support_tickets').select('*, ticket_messages(*)').eq('user_id', userId);
            // Transform data to match App structure
            return data.map(t => {
                const camel = toCamel(t);
                camel.messages = t.ticket_messages.map(m => ({
                    id: m.id,
                    sender: m.sender_role,
                    text: m.message,
                    createdAt: m.created_at
                }));
                return camel;
            });
        }
    },

    unholdRequests: {
        create: async (req) => {
            if (!isSupabaseEnabled) { if (!memoryDb.unholdRequests) memoryDb.unholdRequests = []; memoryDb.unholdRequests.push(req); return req; }
            const { id, userId, ...rest } = req;
            const snake = toSnake(rest);
            snake.user_id = userId;
            const { data, error } = await supabase.from('unhold_requests').insert(snake).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return (memoryDb.unholdRequests || []).filter(r => r.userId === userId);
            const { data } = await supabase.from('unhold_requests').select('*').eq('user_id', userId);
            return data.map(toCamel);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.unholdRequests || [];
            const { data } = await supabase.from('unhold_requests').select('*');
            return data.map(toCamel);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) return {};
            const snake = toSnake(updates);
            const { data, error } = await supabase.from('unhold_requests').update(snake).eq('id', id).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return (memoryDb.unholdRequests || []).find(r => r.id === id);
            const { data } = await supabase.from('unhold_requests').select('*').eq('id', id).single();
            return toCamel(data);
        }
    }
};

module.exports = dbAdapter;
