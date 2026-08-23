'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, ArrowUpRight, History, AlertCircle, CheckCircle, CreditCard,
  Loader2, X, Smartphone, Landmark,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { walletApi, formatCurrency, formatDate } from '@/lib/services';
import UpiPayment from '@/components/RazorpayCheckout';
import { getErrorMessage } from '@/lib/api';

type PayoutMethod = 'UPI' | 'BANK_TRANSFER';

export default function WalletPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { wallet, loading, error, refetch } = useWallet();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [showUpi, setShowUpi] = useState(false);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('UPI');
  const [upiId, setUpiId] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalErr, setModalErr] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const balance = wallet ? Number(wallet.balance) : 0;

  const openWithdrawModal = () => {
    if (!amount || Number(amount) <= 0) {
      setMessage('Enter a valid amount first');
      return;
    }
    if (Number(amount) > balance) {
      setMessage('Insufficient balance');
      return;
    }
    setWithdrawAmount(amount);
    setModalErr('');
    setShowWithdrawModal(true);
  };

  const isPayoutValid =
    payoutMethod === 'UPI'
      ? /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim())
      : bankAccountNumber.trim().length >= 8 && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(bankIfsc.trim());

  const handleSubmitWithdrawal = async () => {
    if (Number(withdrawAmount) <= 0 || Number(withdrawAmount) > balance) {
      setModalErr('Invalid amount');
      return;
    }
    if (!isPayoutValid) {
      setModalErr(payoutMethod === 'UPI'
        ? 'Enter a valid UPI ID (e.g. name@bank)'
        : 'Enter a valid account number and IFSC code (e.g. SBIN0001234)');
      return;
    }

    setSubmitting(true);
    setModalErr('');
    try {
      const res = await walletApi.withdraw(Number(withdrawAmount), {
        payoutMethod,
        ...(payoutMethod === 'UPI'
          ? { upiId: upiId.trim() }
          : {
              bankAccountNumber: bankAccountNumber.trim(),
              bankIfsc: bankIfsc.trim(),
              accountHolderName: accountHolderName.trim() || undefined,
            }),
      });
      setShowWithdrawModal(false);
      setMessage(res.message || 'Withdrawal request submitted — pending admin approval.');
      setAmount('');
      await refetch();
    } catch (err) {
      setModalErr(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
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
               onChange={(e) => { setAmount(e.target.value); setShowUpi(false); }}
              className="input-field flex-1 px-4 py-3 rounded-lg text-white"
              placeholder="Amount (₹)"
              min="1"
              step="1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowUpi(true)}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex items-center justify-center gap-2 btn-fire py-3 rounded-lg font-semibold text-white disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              Deposit
            </button>
            <button
              onClick={openWithdrawModal}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-zinc-300 border border-white/10 hover:border-fire-500/50 transition-colors disabled:opacity-50"
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw
            </button>
          </div>

          {showUpi && amount && parseFloat(amount) > 0 && (
            <div className="mt-4">
              <UpiPayment amount={parseFloat(amount)} onSuccess={() => { refetch(); setShowUpi(false); setAmount(''); setMessage('Deposit submitted! Awaiting admin approval.'); }} />
            </div>
          )}

          {(error || message) && !showUpi && (
            <div className={`flex items-center gap-2 mt-4 p-3 rounded-lg text-sm ${
              message ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {message ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {message || error}
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-fire-400" />
              Recent Transactions
            </h2>
            <Link href="/wallet/history" className="text-xs text-fire-400 hover:text-fire-300 font-medium transition-colors">
              Withdrawal History &rarr;
            </Link>
          </div>
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

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)} />
            <motion.div
              className="relative w-full max-w-md glass-card rounded-2xl p-6 z-10"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-fire-400" />
                  Withdraw Funds
                </h2>
                <button onClick={() => setShowWithdrawModal(false)} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-white/5 flex items-center justify-between text-sm mb-5">
                <span className="text-zinc-400">Amount</span>
                <span className="text-white font-bold">{formatCurrency(Number(withdrawAmount) || 0)}</span>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Payout Method</label>
              <div className="grid grid-cols-2 gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setPayoutMethod('UPI')}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    payoutMethod === 'UPI'
                      ? 'bg-fire-500/15 border-fire-500/50 text-fire-400'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" /> UPI
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMethod('BANK_TRANSFER')}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    payoutMethod === 'BANK_TRANSFER'
                      ? 'bg-fire-500/15 border-fire-500/50 text-fire-400'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Landmark className="w-4 h-4" /> Bank Account
                </button>
              </div>

              {payoutMethod === 'UPI' ? (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-zinc-300 mb-2">UPI ID</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => { setUpiId(e.target.value); setModalErr(''); }}
                    placeholder="yourname@bank"
                    className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-fire-500/50 focus:outline-none"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-4 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Account Number</label>
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={(e) => { setBankAccountNumber(e.target.value); setModalErr(''); }}
                      placeholder="Enter bank account number"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-fire-500/50 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">IFSC Code</label>
                    <input
                      type="text"
                      value={bankIfsc}
                      onChange={(e) => { setBankIfsc(e.target.value.toUpperCase()); setModalErr(''); }}
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm uppercase focus:border-fire-500/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Account Holder Name <span className="text-zinc-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      placeholder="Name as per bank records"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-fire-500/50 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {modalErr && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {modalErr}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitWithdrawal}
                disabled={submitting || !isPayoutValid || Number(withdrawAmount) <= 0}
                className="btn-fire w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
                {submitting ? 'Submitting...' : `Submit Withdrawal (${formatCurrency(Number(withdrawAmount) || 0)})`}
              </button>
              <p className="text-xs text-zinc-500 mt-3 text-center">
                Funds are held securely and paid out after admin verification.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
