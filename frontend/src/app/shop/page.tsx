'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Copy, CheckCircle, AlertCircle, Loader2, X, ArrowRight, Landmark } from 'lucide-react';
import { SiGoogleplay } from 'react-icons/si';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface WithdrawMethod {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgClass: string;
}

const methods: WithdrawMethod[] = [
  {
    id: 'GOOGLE_PLAY',
    name: 'Google Play Redeem Code',
    description: 'Withdraw your winnings as a Google Play gift code',
    icon: SiGoogleplay,
    color: 'text-green-400',
    bgClass: 'bg-green-500/10 border-green-500/20',
  },
];

export default function ShopPage() {
  const { user, loading, refreshUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ code: string; amount: number } | null>(null);

  const balance = user?.wallet?.balance || 0;

  useEffect(() => {
    if (user) {
      setAmount(Number(balance));
    }
  }, [user, balance]);

  useEffect(() => {
    if (!loading && !user) {
      setShowModal(false);
    }
  }, [loading, user]);

  const openModal = () => {
    setAmount(Number(balance));
    setErr('');
    setResult(null);
    setShowModal(true);
  };

  const handleWithdraw = async () => {
    if (amount <= 0 || amount > balance) {
      setErr('Invalid amount');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      const res = await api.post('/store/withdraw', { amount });
      setResult(res.data.data);
    } catch (err) {
      setErr(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setResult(null);
    setErr('');
    refreshUser();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Landmark className="w-8 h-8 text-fire-400" />
            Withdraw
          </h1>
          <p className="text-zinc-400 mt-2">Cash out your winnings to gift codes</p>
        </div>

        <div className="glass-card rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Current Balance</p>
              <p className="text-3xl font-black gradient-text">{formatCurrency(balance)}</p>
            </div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-white mb-4">Withdrawal Methods</h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {methods.map((method) => (
            <button
              key={method.id}
              onClick={openModal}
              className="glass-card rounded-2xl p-6 text-left transition-all hover:fire-glow group"
            >
              <div className={`w-14 h-14 rounded-xl ${method.bgClass} flex items-center justify-center mb-4`}>
                <method.icon className={`w-7 h-7 ${method.color}`} />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{method.name}</h3>
              <p className="text-sm text-zinc-400">{method.description}</p>
              <div className="mt-4 flex items-center gap-1 text-sm text-fire-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Withdraw now <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </div>

        {!user && (
          <div className="glass-card rounded-2xl p-12 text-center mt-8">
            <p className="text-zinc-400">Please <a href="/login" className="text-fire-400 hover:underline">login</a> to withdraw your winnings</p>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
            <motion.div
              className="relative w-full max-w-md glass-card rounded-2xl p-6 z-10"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <SiGoogleplay className="w-5 h-5 text-green-400" />
                  Google Play Redeem
                </h2>
                <button onClick={handleClose} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {result ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                    <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                    <p className="text-green-400 font-bold text-lg mb-1">Withdrawal Successful!</p>
                    <p className="text-sm text-zinc-400">{formatCurrency(result.amount)} withdrawn</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400 mb-2">Your Google Play redeem code:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 rounded-lg bg-black/30 text-white font-mono text-sm text-center tracking-widest select-all">{result.code}</code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(result.code)}
                        className="p-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                        title="Copy code"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button onClick={handleClose} className="w-full px-4 py-2.5 rounded-lg bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Current Balance</span>
                      <span className="text-white font-bold">{formatCurrency(balance)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400 mb-1.5 block">Amount to Redeem</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => { setAmount(Number(e.target.value)); setErr(''); }}
                      placeholder="Enter amount"
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-lg font-bold focus:border-green-500/50 focus:outline-none"
                      min={1}
                      max={balance}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setAmount(Number(balance))}
                        className="text-[11px] px-2 py-1 rounded bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        Max
                      </button>
                      {[500, 1000, 2000].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(v <= balance ? v : Number(balance))}
                          className="text-[11px] px-2 py-1 rounded bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          ₹{v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {err && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {err}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={submitting || amount <= 0 || amount > balance}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-green-500 text-white text-sm font-bold hover:bg-green-400 transition-colors disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <SiGoogleplay className="w-4 h-4" />}
                    {submitting ? 'Processing...' : `Redeem ₹${amount.toLocaleString('en-IN')}`}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}