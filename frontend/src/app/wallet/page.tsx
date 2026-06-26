'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Wallet, ArrowDownLeft, ArrowUpRight, History, AlertCircle, CheckCircle, CreditCard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { formatCurrency, formatDate } from '@/lib/services';
import RazorpayCheckout from '@/components/RazorpayCheckout';

export default function WalletPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { wallet, loading, error, actionLoading, withdraw, refetch } = useWallet();
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [message, setMessage] = useState('');
  const [showRazorpay, setShowRazorpay] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const handleWithdraw = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setMessage('Enter a valid amount');
      return;
    }
    setAction('withdraw');
    setMessage('');
    const success = await withdraw(num);
    if (success) {
      setMessage('Withdrawal successful!');
      setAmount('');
    }
    setAction(null);
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <div className="glass-card rounded-2xl h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-10">
          <Wallet className="w-10 h-10 text-fire-400 mx-auto mb-4" />
          <h1 className="text-3xl font-display font-bold text-white">Wallet</h1>
          <p className="text-zinc-400 mt-2">Manage your tournament funds</p>
        </div>

        <div className="glass-card rounded-2xl p-8 mb-6 fire-glow text-center">
          <p className="text-sm text-zinc-400 mb-2">Available Balance</p>
          <p className="text-5xl font-display font-black gradient-text">
            {wallet ? formatCurrency(wallet.balance) : '₹0'}
          </p>
          <p className="text-xs text-zinc-500 mt-2">{wallet?.currency || 'INR'}</p>
        </div>

        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setShowRazorpay(false); }}
              className="input-field flex-1 px-4 py-3 rounded-lg text-white"
              placeholder="Amount (₹)"
              min="1"
              step="1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowRazorpay(true)}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex items-center justify-center gap-2 btn-fire py-3 rounded-lg font-semibold text-white disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              Deposit via Razorpay
            </button>
            <button
              onClick={handleWithdraw}
              disabled={actionLoading || !amount || parseFloat(amount) <= 0}
              className="flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-zinc-300 border border-white/10 hover:border-fire-500/50 transition-colors disabled:opacity-50"
            >
              <ArrowUpRight className="w-4 h-4" />
              {action === 'withdraw' ? 'Processing...' : 'Withdraw'}
            </button>
          </div>

          {showRazorpay && amount && parseFloat(amount) > 0 && (
            <div className="mt-4">
              <RazorpayCheckout amount={parseFloat(amount)} onSuccess={() => { refetch(); setShowRazorpay(false); setAmount(''); setMessage('Wallet credited!'); }} />
            </div>
          )}

          {(error || message) && !showRazorpay && (
            <div className={`flex items-center gap-2 mt-4 p-3 rounded-lg text-sm ${
              message ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {message ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {message || error}
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-fire-400" />
            Recent Transactions
          </h2>
          {wallet?.transactions && wallet.transactions.length > 0 ? (
            <div className="space-y-3">
              {wallet.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-white">{tx.description || tx.type}</p>
                    <p className="text-xs text-zinc-500">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      ['DEPOSIT', 'PRIZE', 'REFUND', 'ESCROW_RELEASE'].includes(tx.type)
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {['DEPOSIT', 'PRIZE', 'REFUND', 'ESCROW_RELEASE'].includes(tx.type) ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-zinc-500">{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No transactions yet</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
