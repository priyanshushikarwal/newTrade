import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Info,
  X,
  Loader2,
  MessageCircle,
  Download,
  Upload,
  QrCode
} from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { settingsService, walletService } from '@/services/api'
import wsService from '@/services/websocket'
import { Transaction, WalletBalance } from '@/types'
import { setBalance } from '@/store/slices/walletSlice'
import toast from 'react-hot-toast'
import { WithdrawalModal, UnholdAccountModal } from '@/components/withdrawal'

type TransactionType = 'all' | 'deposit' | 'withdrawal' | 'trade'

const WalletPage = () => {
  const dispatch = useAppDispatch()
  const { balance } = useAppSelector((state) => state.wallet)
  const { user } = useAppSelector((state) => state.auth)
  const [activeModal, setActiveModal] = useState<'deposit' | 'withdraw' | null>(null)
  const [filterType, setFilterType] = useState<TransactionType>('all')
  const [depositAmount, setDepositAmount] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(true)
  
  // Debug: Log balance changes
  useEffect(() => {
    console.log('💰 Redux balance state changed:', balance)
  }, [balance])

  // Debug function to manually test balance update
  const testBalanceUpdate = async () => {
    console.log('🧪 Testing manual balance update...')
    try {
      const serverBalance = await walletService.getBalance() as WalletBalance
      console.log('🧪 Server balance fetched:', serverBalance)
      dispatch(setBalance(serverBalance))
      console.log('🧪 Balance manually updated')
    } catch (error) {
      console.error('🧪 Failed to test balance update:', error)
    }
  }
  
  // Deposit states
  const [depositStatus, setDepositStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [depositStep, setDepositStep] = useState<'form' | 'qr' | 'upload'>('form')
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  
  // QR Code state
  const [paymentQrCode, setPaymentQrCode] = useState<string | null>(null)
  
  // WhatsApp number from server
  const [whatsappNumber, setWhatsappNumber] = useState('919876543210')
  
  // Selected transaction for viewing failure reason
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  
  // Failed transaction being retried
  const [retryTransaction, setRetryTransaction] = useState<Transaction | null>(null)
  
  // Unhold account modal
  const [showUnholdModal, setShowUnholdModal] = useState(false)
  const [hasPendingUnholdRequest, setHasPendingUnholdRequest] = useState(false)
  const [showBlockedActionModal, setShowBlockedActionModal] = useState(false)
  
  // Check if user has unpaid bank electronic charge
  const hasUnpaidBankCharge = (() => {
    const withdrawalTransactions = transactions.filter(t => t.type === 'withdrawal')
    if (withdrawalTransactions.length === 0) return false
    
    // Sort by creation date (newest first)
    const sortedWithdrawals = withdrawalTransactions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    
    // Check if the most recent withdrawal is failed due to bank charge
    const latestWithdrawal = sortedWithdrawals[0]
    return latestWithdrawal.status === 'failed' && 
           latestWithdrawal.description?.includes('Due Bank Electronic Charge')
  })()

  // Check if account is on hold and needs unhold payment
  const hasUnholdChargesPending = transactions.some(t => 
    t.type === 'withdrawal' && t.status === 'on_hold'
  )

  // Fetch WhatsApp number and QR code from server
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const whatsappData = await settingsService.getWhatsappNumber()
        if (whatsappData?.whatsappNumber) {
          setWhatsappNumber(whatsappData.whatsappNumber)
        }

        // Fetch payment QR code
        try {
          const qrData = await settingsService.getPaymentQrCode()
          setPaymentQrCode(qrData.qrCodeUrl)
        } catch (error) {
          console.error('Failed to fetch QR code:', error)
          setPaymentQrCode(null)
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error)
      }
    }

    fetchSettings()
  }, [])

  const checkUnholdStatus = async () => {
    try {
      const status = await walletService.getUnholdStatus()
      setHasPendingUnholdRequest(status.hasPendingUnholdRequest)
    } catch (error) {
      console.error('Failed to check unhold status:', error)
    }
  }

  const refreshWalletData = async () => {
    try {
      setLoadingTransactions(true)
      const [balanceData, transactionData] = await Promise.all([
        walletService.getBalance(),
        walletService.getTransactions()
      ])
      dispatch(setBalance(balanceData as { available: number; blocked: number; invested: number; total: number }))
      setTransactions(transactionData || [])
      
      // Check unhold status
      await checkUnholdStatus()
    } catch (error) {
      console.error('Failed to refresh wallet data:', error)
      setTransactions([])
    } finally {
      setLoadingTransactions(false)
    }
  }

  // Fetch balance + transactions from server
  useEffect(() => {
    refreshWalletData()
    checkUnholdStatus()
  }, [])

  // Refresh data when page becomes visible (user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('🔄 Page became visible, refreshing wallet data...')
        refreshWalletData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Periodic refresh for pending withdrawals
  useEffect(() => {
    const hasPendingWithdrawals = transactions.some(t => 
      t.type === 'withdrawal' && (t.status === 'pending' || t.status === 'processing')
    )
    
    if (hasPendingWithdrawals) {
      console.log('⏰ Starting periodic refresh for pending withdrawals...')
      const interval = setInterval(() => {
        console.log('🔄 Periodic refresh for pending withdrawals...')
        refreshWalletData()
      }, 30000) // Refresh every 30 seconds

      return () => {
        console.log('⏹️ Stopping periodic refresh')
        clearInterval(interval)
      }
    }
  }, [transactions])

  // Listen for withdrawal status updates via WebSocket
  useEffect(() => {
    const socket = (wsService as any).socket
    if (socket && user?.id) {
      console.log('🔌 Checking WebSocket connection...')
      console.log('🔌 Socket connected:', socket.connected)
      console.log('🔌 Socket ID:', socket.id)
      
      const handleStatusUpdate = (data: { userId: string; status: string; refundAmount?: number; withdrawalId?: string; newBalance?: number }) => {
        console.log('💰 Wallet page received WebSocket update:', data)
        console.log('Current user ID:', user.id)
        console.log('Data details:', JSON.stringify(data, null, 2))
        
        if (data.userId === user.id) {
          console.log('✅ User ID matches, updating wallet...')
          
          // Update balance immediately if newBalance is provided
          if (data.newBalance !== undefined) {
            console.log(`💵 Immediately updating balance to: ${data.newBalance}`)
            console.log(`💵 Current balance before update:`, balance)
            
            // Fetch the correct balance breakdown from server
            walletService.getBalance().then((serverBalance) => {
              const balance = serverBalance as WalletBalance
              console.log(`💵 Server balance received:`, balance)
              console.log(`💵 Balance breakdown - Available: ${balance.available}, Total: ${balance.total}`)
              dispatch(setBalance(balance))
              console.log(`💵 Redux balance updated with server data`)
              console.log(`💵 New Redux state should be:`, balance)
            }).catch((error) => {
              console.error('Failed to get updated balance:', error)
              // Fallback: assume newBalance is total and calculate available
              if (data.newBalance !== undefined) {
                const fallbackBalance: WalletBalance = {
                  available: data.newBalance,
                  blocked: 0,
                  invested: 0,
                  total: data.newBalance
                }
                console.log(`💵 Using fallback balance:`, fallbackBalance)
                dispatch(setBalance(fallbackBalance))
              }
            })
            
            // For balance updates, also refresh transactions
            if (data.status === 'failed') {
              console.log('🔄 Refreshing transactions after failed withdrawal...')
              walletService.getTransactions().then((transactionData) => {
                setTransactions(transactionData || [])
                console.log(`📊 Transactions refreshed after balance update, count: ${transactionData?.length || 0}`)
              }).catch((error) => {
                console.error('Failed to refresh transactions:', error)
              })
            }
          } else {
            // For other updates without balance change, refresh all data
            console.log('🔄 Refreshing wallet data from server...')
            refreshWalletData()
          }
          
          // Show toast notification
          if (data.status === 'failed' && data.refundAmount) {
            toast.error(`Withdrawal failed! NPR ${data.refundAmount.toLocaleString()} refunded to your wallet`, {
              duration: 5000,
              icon: '🔄',
              style: {
                background: '#1a1b23',
                color: '#fff',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }
            })
          } else if (data.status === 'completed') {
            toast.success('Withdrawal completed successfully!', {
              duration: 3000,
              icon: '✅'
            })
          } else if (data.status === 'on_hold') {
            toast.error('Your account has been put on hold due to multiple failed withdrawals. Please pay the unhold charges to restore access.', {
              duration: 8000,
              icon: '⏸️',
              style: {
                background: '#1a1b23',
                color: '#fff',
                border: '1px solid rgba(249, 115, 22, 0.3)'
              }
            })
            // Force refresh transactions to show unhold button
            setTimeout(() => {
              walletService.getTransactions().then((transactionData) => {
                setTransactions(transactionData || [])
                console.log(`📊 Transactions refreshed for on_hold status, count: ${transactionData?.length || 0}`)
                console.log('🔍 Checking for on_hold transactions:', transactionData?.filter(t => t.status === 'on_hold'))
              }).catch((error) => {
                console.error('Failed to refresh transactions for on_hold:', error)
              })
            }, 1000) // Small delay to ensure server has updated
          }
        } else {
          console.log('❌ User ID does not match')
        }
      }
      
      socket.on('withdrawalStatusUpdate', handleStatusUpdate)
      console.log('🎧 WebSocket listener registered for user:', user.id)
      
      // Listen for account status updates (unhold approval)
      const handleAccountStatusUpdate = (data: { userId: string; status: string }) => {
        console.log('🔓 Account status update received:', data)
        if (data.userId === user.id && data.status === 'active') {
          toast.success('Your account has been reactivated! You can now make deposits and withdrawals.', {
            duration: 6000,
            icon: '✅',
            style: {
              background: '#1a1b23',
              color: '#fff',
              border: '1px solid rgba(34, 197, 94, 0.3)'
            }
          })
          // Refresh wallet data and unhold status
          refreshWalletData()
          checkUnholdStatus()
        }
      }
      
      socket.on('accountStatusUpdate', handleAccountStatusUpdate)
      
      return () => {
        console.log('🔇 Removing WebSocket listener')
        socket.off('withdrawalStatusUpdate', handleStatusUpdate)
        socket.off('accountStatusUpdate', handleAccountStatusUpdate)
      }
    } else {
      console.log('🔌 WebSocket not available or user not logged in')
    }
  }, [user?.id])

  const handleDepositRequest = async () => {
    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (amount < 100) {
      toast.error('Minimum deposit amount is NPR 100')
      return
    }

    // Show QR code step
    setDepositStep('qr')
  }

  const handleQrContinue = () => {
    // After viewing QR, show upload proof step
    setDepositStep('upload')
  }

  const handleUploadProof = async () => {
    if (!paymentProof) {
      toast.error('Please upload payment proof')
      return
    }

    const amount = parseFloat(depositAmount)
    setDepositStatus('loading')
    
    try {
      const depositResult = await walletService.deposit(amount, 'bank', '')
      toast.success(`Deposited NPR ${amount} successfully!`)
      setDepositStatus('idle')
      resetDepositModal()

      if (depositResult?.balance !== undefined) {
        dispatch(setBalance({
          total: depositResult.balance,
          available: depositResult.balance,
          blocked: 0,
          invested: 0,
        }))
      }

      await refreshWalletData()
    } catch (error) {
      setDepositStatus('failed')
      toast.error('Failed to process deposit')
    }
  }

  const handleDepositContactSupport = () => {
    const message = encodeURIComponent(`Hi, I'm facing server issues while trying to deposit NPR ${depositAmount}. Please help me complete my deposit.`)
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
  }

  const resetDepositModal = () => {
    setActiveModal(null)
    setDepositAmount('')
    setDepositStatus('idle')
    setDepositStep('form')
    setPaymentProof(null)
  }

  const filteredTransactions = transactions.filter(t => {
    if (filterType === 'all') return true
    if (filterType === 'deposit') return t.type === 'deposit' || t.type === 'bonus'
    if (filterType === 'withdrawal') return t.type === 'withdrawal'
    if (filterType === 'trade') return t.type === 'trade'
    return true
  })

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'completed': return 'text-emerald-400 bg-emerald-500/20'
      case 'pending': return 'text-warning bg-warning/20'
      case 'processing': return 'text-blue-400 bg-blue-500/20'
      case 'held': return 'text-purple-400 bg-purple-500/20'
      case 'on_hold': return 'text-orange-400 bg-orange-500/20'
      case 'failed': return 'text-danger bg-danger/20'
      case 'cancelled': return 'text-gray-400 bg-white/5'
    }
  }

  const getStatusIcon = (status: Transaction['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />
      case 'pending':
      case 'processing':
      case 'held': return <Clock className="w-4 h-4" />
      case 'failed': return <XCircle className="w-4 h-4" />
      case 'cancelled': return <AlertCircle className="w-4 h-4" />
    }
  }

  const getTypeIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'deposit':
      case 'bonus':
        return <ArrowDownRight className="w-5 h-5 text-emerald-400" />
      case 'withdrawal':
      case 'fee':
      case 'commission':
        return <ArrowUpRight className="w-5 h-5 text-danger" />
      case 'trade': 
        return <ArrowDownRight className="w-5 h-5 text-blue-400" />
      default: return <AlertCircle className="w-5 h-5 text-gray-400" />
    }
  }

  const quickAmounts = [500, 1000, 2500, 5000, 10000, 25000,50000]


  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Wallet</h1>
        <p className="text-gray-400">Manage your funds and view transaction history</p>
      </motion.div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Available Balance</p>
              <p className="text-3xl font-bold text-white">NPR {balance.available.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex gap-3 flex-col">
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (hasPendingUnholdRequest) {
                    setShowBlockedActionModal(true)
                  } else if (hasUnholdChargesPending) {
                    toast.error('Your account is on hold. Please pay the unhold charges to enable deposits.', {
                      duration: 4000,
                      icon: '⚠️',
                      style: {
                        background: '#1a1b23',
                        color: '#fff',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }
                    })
                  } else {
                    setActiveModal('deposit')
                  }
                }}
                className={`flex-1 btn-primary flex items-center justify-center gap-2 ${
                  hasPendingUnholdRequest || hasUnholdChargesPending ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Plus className="w-5 h-5" />
                Deposit
              </button>
              <button
                onClick={() => {
                  if (hasPendingUnholdRequest) {
                    setShowBlockedActionModal(true)
                  } else if (hasUnholdChargesPending) {
                    toast.error('Your account is on hold. Please pay the unhold charges to enable withdrawals.', {
                      duration: 4000,
                      icon: '⚠️',
                      style: {
                        background: '#1a1b23',
                        color: '#fff',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }
                    })
                  } else if (hasUnpaidBankCharge) {
                    toast.error('Please complete your pending bank electronic charge payment first', {
                      duration: 4000,
                      icon: '⚠️',
                      style: {
                        background: '#1a1b23',
                        color: '#fff',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }
                    })
                  } else {
                    setActiveModal('withdraw')
                  }
                }}
                className={`flex-1 btn-secondary flex items-center justify-center gap-2 ${
                  hasPendingUnholdRequest || hasUnholdChargesPending || hasUnpaidBankCharge ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title={
                  hasUnholdChargesPending 
                    ? 'Account on hold - Pay unhold charges to enable withdrawals' 
                    : hasUnpaidBankCharge 
                      ? 'Complete your pending bank electronic charge payment to enable withdrawals' 
                      : ''
                }
              >
                <Minus className="w-5 h-5" />
                Withdraw
                {hasUnpaidBankCharge && (
                  <span className="ml-1 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                    Pending Payment
                  </span>
                )}
                {hasUnholdChargesPending && (
                  <span className="ml-1 text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                    Account on Hold
                  </span>
                )}
              </button>
            </div>
            <button
              onClick={async () => {
                try {
                  const depositResult = await walletService.deposit(500, 'bank', 'test')
                  toast.success('Added NPR 500 test balance!')
                  if (depositResult?.balance !== undefined) {
                    dispatch(setBalance({
                      total: depositResult.balance,
                      available: depositResult.balance,
                      blocked: 0,
                      invested: 0,
                    }))
                  }
                  await refreshWalletData()
                } catch {
                  toast.error('Failed to add test balance')
                }
              }}
              className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 py-2 px-4 rounded-xl text-sm font-medium transition-colors"
            >
              + Test Balance (NPR 500)
            </button>
            <button
              onClick={testBalanceUpdate}
              className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 py-2 px-4 rounded-xl text-sm font-medium transition-colors"
            >
              🔄 Refresh Balance (Debug)
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <p className="text-gray-400 text-sm mb-2">Margin Used</p>
          <p className="text-2xl font-bold text-white mb-1">NPR {balance.blocked.toLocaleString()}</p>
          <div className="w-full h-2 bg-[#12131a] rounded-full overflow-hidden">
            <div 
              className="h-full bg-warning rounded-full"
              style={{ width: `${(balance.blocked / balance.total) * 100}%` }}
            />
          </div>
          <p className="text-gray-400 text-xs mt-2">
            {((balance.blocked / balance.total) * 100).toFixed(1)}% of total balance
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <p className="text-gray-400 text-sm mb-2">Total Balance</p>
          <p className="text-2xl font-bold text-white mb-4">NPR {balance.total.toLocaleString()}</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Invested:</span>
            <span className="text-purple-400 font-medium">NPR {balance.invested.toLocaleString()}</span>
          </div>
        </motion.div>
      </div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-4 border border-purple-500/30 bg-purple-500/5"
      >
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-medium mb-1">Paper Trading Mode</p>
            <p className="text-gray-400 text-sm">
              You're using virtual money for practice. No real funds are involved. 
              Deposits and withdrawals are simulated and require admin approval for demo purposes.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Transaction History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card"
      >
        <div className="p-4 lg:p-6 border-b border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Transaction History</h2>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {(['all', 'deposit', 'withdrawal', 'trade'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium capitalize whitespace-nowrap transition-colors ${
                    filterType === type
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {type === 'all' ? 'All' : type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="divide-y divide-white/10">
          {loadingTransactions ? (
            <div className="p-8 text-center">
              <div className="inline-block w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
              <p className="text-gray-400 mt-4">Loading transactions...</p>
            </div>
          ) : filteredTransactions.length > 0 ? (
            filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="p-4 lg:px-6 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      transaction.type === 'deposit' || transaction.type === 'bonus'
                        ? 'bg-emerald-500/20'
                        : 'bg-danger/20'
                    }`}>
                      {getTypeIcon(transaction.type)}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{transaction.description}</p>
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{new Date(transaction.createdAt).toLocaleTimeString()}</span>
                        {transaction.reference && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              {transaction.reference}
                              <button className="hover:text-white transition-colors">
                                <Copy className="w-3 h-3" />
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className={`font-bold ${
                        transaction.type === 'deposit' || transaction.type === 'bonus'
                          ? 'text-emerald-400'
                          : 'text-danger'
                      }`}>
                        {transaction.type === 'deposit' || transaction.type === 'bonus' ? '+' : '-'}
                        NPR {transaction.amount.toLocaleString()}
                      </p>
                      <span 
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(transaction.status)}`}
                        onClick={() => {
                          if (transaction.status === 'failed' && transaction.type === 'withdrawal') {
                            setSelectedTransaction(transaction)
                          }
                        }}
                      >
                        {getStatusIcon(transaction.status)}
                        {transaction.status}
                      </span>
                    </div>
                    {(transaction.type === 'withdrawal' && transaction.status === 'failed' && (transaction as any).description?.includes('Due Bank Electronic Charge')) ? (
                      <button
                        onClick={() => {
                          setRetryTransaction(transaction)
                          setActiveModal('withdraw')
                        }}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-600 hover:to-cyan-500 text-white text-sm font-medium transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Pay and Withdraw
                      </button>
                    ) : null}
                    {(transaction.type === 'withdrawal' && (transaction as any).status === 'on_hold') ? (
                      <button
                        onClick={() => setShowUnholdModal(true)}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-medium transition-all shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Unhold Account
                      </button>
                    ) : null}
                    {transaction.type === 'withdrawal' && transaction.status === 'completed' && (transaction as any).paymentProofPdf && (
                      <button
                        onClick={() => {
                          const pdfWindow = window.open()
                          if (pdfWindow) {
                            pdfWindow.document.write(`<iframe width='100%' height='100%' src='${(transaction as any).paymentProofPdf}'></iframe>`)
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        View Receipt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">No transactions found</p>
              <p className="text-gray-400 text-sm">Try adjusting your filters</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Deposit Modal */}
      <AnimatePresence>
        {activeModal === 'deposit' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => depositStatus === 'idle' ? resetDepositModal() : undefined}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  {depositStep === 'form' && 'Deposit Funds'}
                  {depositStep === 'qr' && 'Scan QR Code'}
                  {depositStep === 'upload' && 'Upload Payment Proof'}
                </h2>
                <button
                  onClick={resetDepositModal}
                  className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${depositStep === 'form' ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                  <div className={`w-6 h-0.5 ${depositStep === 'qr' || depositStep === 'upload' ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                  <div className={`w-3 h-3 rounded-full ${depositStep === 'qr' ? 'bg-purple-500' : depositStep === 'upload' ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                  <div className={`w-6 h-0.5 ${depositStep === 'upload' ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                  <div className={`w-3 h-3 rounded-full ${depositStep === 'upload' ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                </div>
              </div>

              {/* Failed State */}
              {depositStatus === 'failed' && (
                <div className="py-6">
                  <div className="flex flex-col items-center justify-center">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', duration: 0.6 }}
                      className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mb-4 shadow-lg shadow-red-500/30"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring' }}
                      >
                        <X className="w-12 h-12 text-white stroke-[3]" />
                      </motion.div>
                    </motion.div>

                    <motion.h3
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-xl font-bold text-white mb-2"
                    >
                      Deposit Failed
                    </motion.h3>

                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-gray-400 text-center mb-6 max-w-xs"
                    >
                      We're experiencing server issues at the moment. Please contact our support team to complete your deposit of NPR {parseFloat(depositAmount).toLocaleString()}.
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="w-full space-y-3"
                    >
                      <button
                        onClick={handleDepositContactSupport}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold text-lg flex items-center justify-center gap-3 transition-all shadow-lg shadow-green-500/30 hover:shadow-green-500/50"
                      >
                        <MessageCircle className="w-6 h-6" />
                        Contact Support
                      </button>

                      <button
                        onClick={resetDepositModal}
                        className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"
                      >
                        Close
                      </button>
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="text-gray-400 text-xs mt-4 text-center"
                    >
                      Our support team will help you complete your deposit
                    </motion.p>
                  </div>
                </div>
              )}

              {/* Form Step */}
              {depositStep === 'form' && depositStatus !== 'failed' && (
                <div className="space-y-4">
                  {/* Amount Input */}
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">NPR</span>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0"
                        className="input-glass pl-16 text-2xl font-bold w-full"
                      />
                    </div>
                  </div>

                  {/* Quick Amounts */}
                  <div className="grid grid-cols-3 gap-2">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setDepositAmount(amount.toString())}
                        className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                          depositAmount === amount.toString()
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        NPR {amount.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleDepositRequest}
                    disabled={!depositAmount}
                    className="w-full btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to Payment
                  </button>
                </div>
              )}

              {/* QR Code Step */}
              {depositStep === 'qr' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-48 h-48 mx-auto bg-white rounded-xl flex items-center justify-center mb-4">
                      {paymentQrCode ? (
                        <img src={paymentQrCode} alt="Payment QR Code" className="w-48 h-48 object-contain rounded-lg" />
                      ) : (
                        <QrCode className="w-32 h-32 text-purple-600" />
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-4">
                      <p className="text-purple-400 font-semibold text-lg">NPR {parseFloat(depositAmount).toLocaleString()}</p>
                      <p className="text-gray-400 text-sm">Amount to pay</p>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-6">
                      <p className="text-blue-400 text-sm">
                        {paymentQrCode 
                          ? 'Scan the QR code above using your banking app or UPI app to make the payment. After successful payment, click continue to upload your payment proof.'
                          : 'QR code not configured - contact support'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setDepositStep('form')}
                      className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleQrContinue}
                      className="flex-1 py-3 rounded-xl bg-purple-500 hover:bg-purple-500/90 text-white font-medium transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Proof Step */}
              {depositStep === 'upload' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
                      <p className="text-green-400 font-semibold text-lg">NPR {parseFloat(depositAmount).toLocaleString()}</p>
                      <p className="text-gray-400 text-sm">Deposit Amount</p>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-6">
                      <p className="text-blue-400 text-sm">
                        Please upload a screenshot or photo of your successful payment as proof. This will be verified by our admin team.
                      </p>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Payment Proof</label>
                    <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center hover:border-white/30 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                        className="hidden"
                        id="payment-proof"
                      />
                      <label htmlFor="payment-proof" className="cursor-pointer">
                        {paymentProof ? (
                          <div className="space-y-2">
                            <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                            <p className="text-white font-medium">{paymentProof.name}</p>
                            <p className="text-gray-400 text-sm">Click to change file</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                            <p className="text-white font-medium">Click to upload payment proof</p>
                            <p className="text-gray-400 text-sm">PNG, JPG, JPEG up to 10MB</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setDepositStep('qr')}
                      className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleUploadProof}
                      disabled={depositStatus === 'loading' || !paymentProof}
                      className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-500/90 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {depositStatus === 'loading' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Submit Deposit'
                      )}
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal - New Component */}
      <WithdrawalModal
        isOpen={activeModal === 'withdraw'}
        onClose={() => {
          setActiveModal(null)
          setRetryTransaction(null)
        }}
        balance={balance.available}
        whatsappNumber={whatsappNumber}
        userId={user?.id || ''}
        retryTransaction={retryTransaction}
      />

      {/* Failure Reason Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedTransaction(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Transaction Failed</h2>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-danger/10 border border-danger/20">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Failure Reason</p>
                      <p className="text-gray-300 text-sm">
                        {(selectedTransaction as any).failureReason || 'Due Bank Electronic Charge'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Amount:</span>
                      <span className="text-white font-medium">NPR {selectedTransaction.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Date:</span>
                      <span className="text-white">{new Date(selectedTransaction.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status:</span>
                      <span className="text-danger font-medium">Failed</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-emerald-400 font-semibold mb-1">Amount Refunded</p>
                      <p className="text-gray-300 text-sm">
                        The full amount including charges has been refunded to your wallet.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedTransaction(null)
                    setActiveModal('withdraw')
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-600 hover:to-cyan-500 text-white font-semibold transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Try Withdraw Again
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unhold Account Modal */}
      <UnholdAccountModal
        isOpen={showUnholdModal}
        onClose={() => setShowUnholdModal(false)}
        balance={typeof balance === 'number' ? balance : balance.total}
        userId={user?.id || ''}
        onSuccess={refreshWalletData}
      />

      {/* Blocked Action Modal */}
      <AnimatePresence>
        {showBlockedActionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowBlockedActionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center justify-center py-4">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', duration: 0.6 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mb-6 shadow-lg shadow-orange-500/30"
                >
                  <Clock className="w-10 h-10 text-white" />
                </motion.div>

                <motion.h3
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-bold text-white text-center mb-2"
                >
                  {hasUnholdChargesPending ? 'Account on Hold' : 'Action Blocked'}
                </motion.h3>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-gray-300 text-center mb-6 max-w-xs"
                >
                  {hasUnholdChargesPending 
                    ? 'Your account is on hold due to multiple failed withdrawals. Pay the unhold charges to restore access.'
                    : 'We are working on your account unhold request. Please wait for admin approval.'
                  }
                </motion.p>

                <div className="w-full p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-6">
                  <p className="text-orange-400 text-sm text-center">
                    ⏱️ Your deposit and withdrawal functions are temporarily blocked. {hasUnholdChargesPending ? 'Pay the unhold charges to restore access.' : 'We are processing your unhold request.'}
                  </p>
                </div>

                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => setShowBlockedActionModal(false)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold transition-all shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50"
                >
                  OK, Got It
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default WalletPage
