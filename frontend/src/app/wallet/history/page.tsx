'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Copy, X, Eye, Loader2, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { redeemApi, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface RedeemItem {
  id: string;
  amount: number;
  type: string;
  status: string;
  giftCode?: string;
  rejectionReason?: string;
  createdAt: string;
}

export default function WithdrawalHistoryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [requests, setRequests] = useState<RedeemItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [viewCodeId, setViewCodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    redeemApi.myRequests()
      .then((res) => setRequests(res.data || []))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoadingData(false));
  }, [user]);

  const statusBadge = (s: string) => {
    switch (s) {
      case 'PENDING': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'COMPLETED': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'REJECTED': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  const viewingCode = requests.find((r) => r.id === viewCodeId);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/wallet" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Wallet
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Gift className="w-8 h-8 text-fire-400" />
            Withdrawal History
          </h1>
          <p className="text-zinc-400 mt-1">Track your redeem requests and view gift codes</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loadingData ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Gift className="w-14 h-14 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400 font-medium mb-1">No withdrawal requests yet</p>
            <p className="text-zinc-500 text-sm">Go to the shop to request a withdrawal</p>
            <Link href="/shop" className="inline-flex items-center gap-2 mt-4 btn-fire px-5 py-2.5 rounded-xl text-sm font-semibold text-white">
              Go to Shop
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-fire-400 font-bold text-lg">{formatCurrency(r.amount)}</span>
                      <span className="text-zinc-600 text-xs">|</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      <span>{r.type}</span>
                      <span className="text-zinc-700">•</span>
                      <span>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {r.rejectionReason && (
                      <p className="text-xs text-red-400 mt-1">{r.rejectionReason}</p>
                    )}
                  </div>
                  {r.status === 'COMPLETED' && r.giftCode && (
                    <button
                      onClick={() => setViewCodeId(r.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors shrink-0"
                    >
                      <Eye className="w-4 h-4" /> View Code
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {viewingCode && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewCodeId(null)} />
            <motion.div
              className="relative w-full max-w-sm glass-card rounded-2xl p-6 z-10 border border-green-500/20"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-green-400" />
                  Your Gift Code
                </h2>
                <button onClick={() => setViewCodeId(null)} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center mb-4">
                <p className="text-xs text-green-400/80 mb-2">Amount</p>
                <p className="text-2xl font-black gradient-text">{formatCurrency(viewingCode.amount)}</p>
              </div>

              <p className="text-xs text-zinc-400 mb-2">Redeem code:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 rounded-lg bg-black/40 text-white font-mono text-sm text-center tracking-widest select-all border border-white/5">
                  {viewingCode.giftCode}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(viewingCode.giftCode!)}
                  className="p-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[10px] text-zinc-600 mt-3 text-center">
                This code was issued on {new Date(viewingCode.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
