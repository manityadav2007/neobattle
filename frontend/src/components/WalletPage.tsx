'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Wallet, Copy, CheckCircle, AlertCircle, Loader2, ArrowUpRight, History, CreditCard, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate } from '@/lib/services';

const UPI_ID = '8295196585-m71a@ybl';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
}

interface WalletData {
  balance: number;
  currency: string;
  transactions: Transaction[];
}

export default function WalletPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/wallet`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    })
      .then((res) => {
        const data: WalletData = res.data?.data || res.data;
        setBalance(typeof data.balance === 'number' ? data.balance : 0);
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load wallet'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(UPI_ID).then(() => {
      setCopied(true);
      alert('UPI ID Copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWithdraw = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { setWithdrawMsg('Enter a valid amount'); return; }
    if (num > balance) { setWithdrawMsg('Insufficient balance'); return; }
    setWithdrawLoading(true);
    setWithdrawMsg('');
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/wallet/withdraw`, { amount: num }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      setBalance((prev) => prev - num);
      setWithdrawMsg('Withdrawal request submitted!');
      setAmount('');
    } catch (err: any) {
      setWithdrawMsg(err.response?.data?.message || 'Withdrawal failed');
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="rounded-2xl h-64 animate-pulse bg-zinc-800/50" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fire-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-3 border border-fire-500/20">
            <Wallet className="w-7 h-7 text-fire-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white">Wallet</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your tournament funds</p>
        </div>

        {/* Balance Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-6 mb-5 text-center">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-fire-500/5 blur-3xl" />
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Available Balance</p>
          <p className="text-4xl font-display font-black text-white">{formatCurrency(balance)}</p>
          <p className="text-xs text-zinc-600 mt-1">INR</p>
        </div>

        {/* Action Input */}
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5 mb-5">
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white text-sm outline-none focus:border-fire-500/50 transition-colors"
              placeholder="Amount (₹)"
              min="1"
              step="1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleWithdraw}
              disabled={withdrawLoading || !amount || parseFloat(amount) <= 0}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold border border-zinc-700 hover:border-fire-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {withdrawLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
              {withdrawLoading ? 'Processing...' : 'Withdraw'}
            </button>
            <button
              onClick={() => {
                const num = parseFloat(amount);
                if (!isNaN(num) && num > 0) {
                  axios.post(`${process.env.NEXT_PUBLIC_API_URL}/wallet/deposit`, { amount: num }, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
                  }).then(() => {
                    setWithdrawMsg('Deposit request submitted!');
                    setAmount('');
                    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/wallet`, {
                      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
                    }).then((res) => {
                      const data = res.data?.data || res.data;
                      setBalance(typeof data.balance === 'number' ? data.balance : 0);
                    });
                  }).catch((err) => setWithdrawMsg(err.response?.data?.message || 'Deposit failed'));
                }
              }}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fire-600 to-fire-500 text-white text-sm font-semibold hover:from-fire-500 hover:to-fire-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-4 h-4" /> Deposit
            </button>
          </div>
          {withdrawMsg && (
            <div className={`flex items-center gap-2 mt-3 p-3 rounded-xl text-sm ${
              withdrawMsg.includes('failed') || withdrawMsg.includes('Insufficient')
                ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
            }`}>
              {withdrawMsg.includes('failed') || withdrawMsg.includes('Insufficient')
                ? <AlertCircle className="w-4 h-4 shrink-0" />
                : <CheckCircle className="w-4 h-4 shrink-0" />
              }
              {withdrawMsg}
            </div>
          )}
        </div>

        {/* UPI Section */}
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="w-5 h-5 text-green-400" />
            <h2 className="text-base font-bold text-white">UPI Payment</h2>
          </div>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-2xl border-2 border-zinc-700 shadow-xl p-3">
              <img
                src="/my_qr.jpg"
                alt="UPI QR"
                width={160}
                height={160}
                className="w-40 h-40 object-contain mx-auto"
              />
            </div>
          </div>

          {/* UPI ID + Copy */}
          <div className="bg-zinc-800/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 mb-0.5">UPI ID</p>
              <p className="text-sm font-mono text-green-300 font-medium truncate">{UPI_ID}</p>
            </div>
            <button
              onClick={handleCopyUpi}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/15 text-green-400 text-xs font-semibold hover:bg-green-500/25 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2 text-center">
            Send payment to this UPI ID, then use the Deposit button above to submit your transaction UTR.
          </p>
        </div>

        {/* Transactions */}
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-fire-400" />
              Recent Transactions
            </h2>
          </div>
          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-zinc-800/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tx.description || tx.type}</p>
                    <p className="text-xs text-zinc-600">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-sm font-bold ${
                      ['DEPOSIT', 'PRIZE', 'REFUND', 'ESCROW_RELEASE'].includes(tx.type)
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {['DEPOSIT', 'PRIZE', 'REFUND', 'ESCROW_RELEASE'].includes(tx.type) ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </p>
                    <p className="text-[10px] text-zinc-600">{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-8">No transactions yet</p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-400 text-sm mt-4">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
      </motion.div>
    </div>
  );
}
