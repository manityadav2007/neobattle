'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Gift, Copy, CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, ArrowLeft, Search,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface RedeemRequestItem {
  id: string;
  userId: string;
  amount: number;
  type: string;
  status: string;
  accountDetails?: string;
  giftCode?: string;
  rejectionReason?: string;
  createdAt: string;
  user: { id: string; username: string; email: string };
}

export default function AdminRedeemsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [requests, setRequests] = useState<RedeemRequestItem[]>([]);
  const [filter, setFilter] = useState('PENDING');
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [giftCodeInput, setGiftCodeInput] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && !isSuperAdmin) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    try {
      setError('');
      const res = await adminApi.listRedeems(filter || undefined);
      setRequests(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin, filter]);

  const handleComplete = async (id: string) => {
    const code = giftCodeInput[id]?.trim();
    if (!code) return;
    setApproving(id);
    setActionMsg('');
    try {
      await adminApi.reviewRedeem(id, 'COMPLETED', { giftCode: code });
      setActionMsg('Redeem completed with gift code');
      setGiftCodeInput((prev) => ({ ...prev, [id]: '' }));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (id: string) => {
    setApproving(id);
    setActionMsg('');
    try {
      await adminApi.reviewRedeem(id, 'REJECTED', { rejectionReason: 'Request denied by admin' });
      setActionMsg('Redeem rejected');
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApproving(null);
    }
  };

  if (loading || !isSuperAdmin) return null;

  const statusColor = (s: string) => {
    switch (s) {
      case 'PENDING': return 'text-yellow-400 bg-yellow-500/10';
      case 'COMPLETED': return 'text-green-400 bg-green-500/10';
      case 'REJECTED': return 'text-red-400 bg-red-500/10';
      default: return 'text-zinc-400 bg-zinc-500/10';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>

        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Gift className="w-8 h-8 text-purple-400" />
              Redeem Requests
            </h1>
            <p className="text-zinc-400 mt-1">Manage withdrawal requests and provide gift codes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {['PENDING', 'COMPLETED', 'REJECTED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === s ? 'bg-fire-500/20 text-fire-400' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {actionMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" /> {actionMsg}
          </div>
        )}

        {requests.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Search className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">No {filter.toLowerCase()} redeem requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <div key={r.id} className="glass-card rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{r.user.username}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(r.status)}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{r.user.email}</p>
                    <div className="flex items-center gap-3 mt-2 text-sm">
                      <span className="text-fire-400 font-bold">{formatCurrency(r.amount)}</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-400">{r.type}</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-500 text-xs">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {r.giftCode && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-xs bg-black/30 px-2 py-1 rounded text-green-300 font-mono tracking-wider">{r.giftCode}</code>
                        <button onClick={() => navigator.clipboard.writeText(r.giftCode!)} className="text-zinc-500 hover:text-white transition-colors" title="Copy code">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {r.rejectionReason && (
                      <p className="text-xs text-red-400 mt-1">Reason: {r.rejectionReason}</p>
                    )}
                  </div>

                  {r.status === 'PENDING' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={giftCodeInput[r.id] || ''}
                          onChange={(e) => setGiftCodeInput((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Enter gift code..."
                          className="w-40 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-zinc-600 focus:border-green-500/50 outline-none"
                        />
                        <button
                          onClick={() => handleComplete(r.id)}
                          disabled={approving === r.id || !giftCodeInput[r.id]?.trim()}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                        >
                          {approving === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Complete
                        </button>
                      </div>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={approving === r.id}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
