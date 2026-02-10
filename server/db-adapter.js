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

    profiles: {
        create: async (userData) => {
            if (!isSupabaseEnabled) {
                memoryDb.users.push(userData);
                return userData;
            }
            const snakeData = toSnake(userData);
            const { data, error } = await supabase.from('profiles').insert(snakeData).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findByEmail: async (email) => {
            if (!isSupabaseEnabled) return memoryDb.users.find(u => u.email === email);
            const { data, error } = await supabase.from('profiles').select('*').eq('email', email).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding profile:', error);
            return toCamel(data);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.users.find(u => u.id === id);
            const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding profile by ID:', error);
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
            const { data, error } = await supabase.from('profiles').update(snakeUpdates).eq('id', id).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.users;
            const { data } = await supabase.from('profiles').select('*');
            return data.map(toCamel);
        }
    },

    wallets: {
        create: async (walletData) => {
            if (!isSupabaseEnabled) {
                // Wallet data is stored in user object in memory-db
                return walletData;
            }
            const snakeData = toSnake(walletData);
            const { data, error } = await supabase.from('wallets').insert(snakeData).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!userId) return null;
            if (!isSupabaseEnabled) {
                const user = memoryDb.users.find(u => u.id === userId);
                return user ? { balance: user.balance, lockedBalance: user.usedBalance } : null;
            }
            const { data, error } = await supabase.from('wallets').select('*').eq('user_id', userId).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding wallet:', error);
            return toCamel(data);
        },
        updateBalance: async (userId, newBalance, lockedBalance = 0) => {
            if (!isSupabaseEnabled) {
                const idx = memoryDb.users.findIndex(u => u.id === userId);
                if (idx !== -1) {
                    memoryDb.users[idx].balance = newBalance;
                    memoryDb.users[idx].usedBalance = lockedBalance;
                    return memoryDb.users[idx];
                }
                return null;
            }
            const { data, error } = await supabase.from('wallets')
                .update({ balance: newBalance, locked_balance: lockedBalance, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        addToBalance: async (userId, amountToAdd) => {
            if (!isSupabaseEnabled) {
                const idx = memoryDb.users.findIndex(u => u.id === userId);
                if (idx !== -1) {
                    memoryDb.users[idx].balance = Number(memoryDb.users[idx].balance) + Number(amountToAdd);
                    return memoryDb.users[idx];
                }
                return null;
            }
            // Use RPC for atomic update
            const { data, error } = await supabase.rpc('add_to_balance', {
                user_id: userId,
                amount: amountToAdd
            });
            if (error) throw new Error(error.message);
            return data;
        }
    },

    deposits: {
        create: async (deposit) => {
            if (!isSupabaseEnabled) {
                deposit.id = deposit.id || `DEP-${Date.now()}`;
                memoryDb.depositRequests.push(deposit);
                return deposit;
            }
            const { id, ...depData } = deposit;
            // Build snake_case object directly from camelCase input
            const dbData = {
                user_id: depData.userId,
                amount: depData.amount,
                proof_url: depData.proofUrl || null,
                status: depData.status || 'pending',
                admin_reason: depData.adminReason || null,
                created_at: depData.createdAt || new Date().toISOString()
            };
            const { data, error } = await supabase.from('deposits').insert(dbData).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.depositRequests.filter(d => d.userId === userId);
            const { data } = await supabase.from('deposits').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            return data.map(toCamel);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.depositRequests.find(d => d.id === id);
            const { data, error } = await supabase.from('deposits').select('*').eq('id', id).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding deposit:', error);
            return toCamel(data);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) {
                const idx = memoryDb.depositRequests.findIndex(d => d.id === id);
                if (idx !== -1) {
                    memoryDb.depositRequests[idx] = { ...memoryDb.depositRequests[idx], ...updates };
                    return memoryDb.depositRequests[idx];
                }
                return null;
            }
            const snakeUpdates = toSnake(updates);
            const { data, error } = await supabase.from('deposits').update(snakeUpdates).eq('id', id).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.depositRequests;
            const { data } = await supabase.from('deposits').select('*').order('created_at', { ascending: false });
            return data.map(toCamel);
        }
    },

    withdrawals: {
        create: async (withdrawal) => {
            if (!isSupabaseEnabled) {
                memoryDb.withdrawalRequests.push(withdrawal);
                return withdrawal;
            }
            const { id, ...wdData } = withdrawal;
            const snakeWd = toSnake(wdData);
            const { data, error } = await supabase.from('withdrawals').insert(snakeWd).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.withdrawalRequests.filter(w => w.userId === userId);
            const { data } = await supabase.from('withdrawals').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            return data.map(toCamel);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.withdrawalRequests.find(w => w.id === id);
            const { data, error } = await supabase.from('withdrawals').select('*').eq('id', id).single();
            if (error && error.code !== 'PGRST116') console.error('Error finding withdrawal:', error);
            return toCamel(data);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) {
                const idx = memoryDb.withdrawalRequests.findIndex(w => w.id === id);
                if (idx !== -1) {
                    memoryDb.withdrawalRequests[idx] = { ...memoryDb.withdrawalRequests[idx], ...updates };
                    return memoryDb.withdrawalRequests[idx];
                }
                return null;
            }
            const snakeUpdates = toSnake(updates);
            const { data, error } = await supabase.from('withdrawals').update(snakeUpdates).eq('id', id).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.withdrawalRequests;
            const { data } = await supabase.from('withdrawals').select('*').order('created_at', { ascending: false });
            return data.map(toCamel);
        }
    },

    unholdRequests: {
        create: async (request) => {
            if (!isSupabaseEnabled) {
                memoryDb.unholdRequests.push(request);
                return request;
            }
            const { id, ...reqData } = request;
            const snakeReq = toSnake(reqData);
            // created_at and status handled by defaults if missing, or passed in
            const dbData = {
                user_id: snakeReq.user_id,
                unhold_charge: snakeReq.unhold_charge,
                utr_number: snakeReq.utr_number,
                status: snakeReq.status || 'pending',
                created_at: snakeReq.created_at || new Date().toISOString()
            };
            const { data, error } = await supabase.from('unhold_requests').insert(dbData).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.unholdRequests.filter(r => r.userId === userId);
            const { data } = await supabase.from('unhold_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            return data.map(toCamel);
        }
    },

    adminSettings: {
        get: async () => {
            if (!isSupabaseEnabled) return memoryDb.settings;
            const { data, error } = await supabase.from('admin_settings').select('*').single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        update: async (updates) => {
            if (!isSupabaseEnabled) {
                memoryDb.settings = { ...memoryDb.settings, ...updates };
                return memoryDb.settings;
            }
            // Fetch the existing row ID first because it's a UUID, not an integer "1"
            const { data: current } = await supabase.from('admin_settings').select('id').single();

            const snakeUpdates = toSnake(updates);

            // If explicit ID is not known, use the fetched one
            const targetId = current ? current.id : updates.id;

            const { data, error } = await supabase.from('admin_settings')
                .update(snakeUpdates)
                .eq('id', targetId)
                .select().single();

            if (error) throw new Error(error.message);
            return toCamel(data);
        }
    },

    // Legacy compatibility - redirect to profiles
    users: {
        findByEmail: (email) => dbAdapter.profiles.findByEmail(email),
        findById: (id) => dbAdapter.profiles.findById(id),
        update: (id, updates) => dbAdapter.profiles.update(id, updates),
        updateBalance: async (id, amountToAdd) => {
            const wallet = await dbAdapter.wallets.findByUserId(id);
            if (!wallet) return null;
            const newBalance = Number(wallet.balance) + Number(amountToAdd);
            return await dbAdapter.wallets.updateBalance(id, newBalance, wallet.lockedBalance);
        },
        getAll: () => dbAdapter.profiles.getAll(),
        create: async (user) => {
            // This should not be used anymore - users are created via Supabase Auth
            throw new Error('Use Supabase Auth for user creation');
        }
    },

    transactions: {
        create: async (transaction) => {
            if (!isSupabaseEnabled) {
                transaction.id = transaction.id || `TXN-${Date.now()}`;
                memoryDb.transactions.push(transaction);
                return transaction;
            }
            // Only pick columns that exist in the Supabase 'transactions' table
            // Schema: id (auto), user_id, type, amount, balance_after, reference_id, created_at
            const dbData = {
                user_id: transaction.userId,
                type: transaction.type,
                amount: transaction.amount,
                balance_after: transaction.balanceAfter != null ? transaction.balanceAfter : 0,
                reference_id: transaction.referenceId || transaction.reference || null,
                // New columns support
                description: transaction.description || null,
                status: transaction.status || 'completed',
                created_at: transaction.createdAt || new Date().toISOString()
            };
            const { data, error } = await supabase.from('transactions').insert(dbData).select().single();
            if (error) throw new Error(error.message);
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.transactions.filter(t => t.userId === userId);
            const { data } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            return data.map(toCamel);
        },
        updateByReference: async (referenceId, updates) => {
            if (!isSupabaseEnabled) {
                const txs = memoryDb.transactions.filter(t => t.referenceId === referenceId || t.reference === referenceId);
                txs.forEach(t => Object.assign(t, updates));
                return txs;
            }
            const snakeUpdates = toSnake(updates);
            // Updating transactions where reference_id matches
            const { data, error } = await supabase.from('transactions')
                .update(snakeUpdates)
                .eq('reference_id', referenceId)
                .select();
            if (error) console.error('Error updating transaction by reference:', error);
            return data ? data.map(toCamel) : [];
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.transactions;
            const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
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
            const { data, error } = await supabase.from('kyc_documents').insert(snake).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findByUserId: async (userId) => {
            if (!isSupabaseEnabled) return memoryDb.kycRequests.find(k => k.userId === userId);
            const { data } = await supabase.from('kyc_documents').select('*').eq('user_id', userId).single();
            if (!data) return null;
            return toCamel(data);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.kycRequests;
            const { data } = await supabase.from('kyc_documents').select('*');
            return data.map(toCamel);
        },
        update: async (id, updates) => {
            if (!isSupabaseEnabled) return {};
            const snake = toSnake(updates);
            const { data, error } = await supabase.from('kyc_documents').update(snake).eq('id', id).select().single();
            if (error) throw error;
            return toCamel(data);
        },
        findById: async (id) => {
            if (!isSupabaseEnabled) return memoryDb.kycRequests.find(k => k.id === id);
            const { data } = await supabase.from('kyc_documents').select('*').eq('id', id).single();
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
            const { data, error } = await supabase.from('unhold_requests').select('*').eq('user_id', userId);
            if (error) {
                console.error('Error fetching unhold requests:', error);
                return [];
            }
            return (data || []).map(toCamel);
        },
        getAll: async () => {
            if (!isSupabaseEnabled) return memoryDb.unholdRequests || [];
            const { data, error } = await supabase.from('unhold_requests').select('*');
            if (error) {
                console.error('Error fetching all unhold requests:', error);
                return [];
            }
            return (data || []).map(toCamel);
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
