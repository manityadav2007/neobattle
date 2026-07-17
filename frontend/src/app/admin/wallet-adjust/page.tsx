'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote, AlertCircle, CheckCircle, ArrowLeft, Loader2, Search,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adjustWalletApi, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminWalletAdjustPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    if (!userId.trim()) { setError('User ID is required'); return; }
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount === 0) { setError('Non-zero amount is required'); return; }
    if (!confirm(`${numAmount > 0 ? 'Credit' : 'Debit'} ₹${Math.abs(numAmount).toFixed(2)} ${numAmount > 0 ? 'to' : 'from'} user ${userId.trim()}?`)) return;

    setSubmitting(true);
    try {
      const res = await adjustWalletApi.adjust({ userId: userId.trim(), amount: numAmount, reason: reason.trim() || undefined });
      setMsg(res.message || `Successfully adjusted wallet`);
      setUserId('');
      setAmount('');
      setReason('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Banknote className="w-8 h-8 text-purple-400" />
            Wallet Adjustment
          </h1>
          <p className="text-zinc-400 mt-1">Manually credit or debit any user's wallet for corrections or bonuses</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {msg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" /> {msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">User ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User's UUID or FA-XXXX uid"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-600 focus:border-purple-500/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Amount <span className="text-zinc-500">(positive = credit, negative = debit)</span>
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 100 or -50"
              step="0.01"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-600 focus:border-purple-500/50 outline-none"
            />
            {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== 0 && (
              <p className={`text-xs mt-1.5 ${parseFloat(amount) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(amount) > 0 ? 'Crediting' : 'Debiting'} user by {formatCurrency(Math.abs(parseFloat(amount)))}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this adjustment being made?"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-600 focus:border-purple-500/50 outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-purple-500/20 text-purple-400 font-medium text-sm hover:bg-purple-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            {submitting ? 'Processing...' : 'Apply Adjustment'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
