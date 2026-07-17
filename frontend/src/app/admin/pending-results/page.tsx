'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Trophy, AlertCircle, CheckCircle, XCircle, Loader2, Eye, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { winnerProofApi, formatCurrency, formatDate, type WinnerProof } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminPendingResultsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [proofs, setProofs] = useState<WinnerProof[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      const res = await winnerProofApi.pending();
      setProofs(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleApprove = async (id: string) => {
    try {
      await winnerProofApi.review(id, 'APPROVED');
      setMsg('Winner approved! Prizes distributed.');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    try {
      await winnerProofApi.review(id, 'REJECTED', rejectReason.trim());
      setMsg('Winner proof rejected.');
      setRejectId(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Trophy className="w-8 h-8 text-yellow-400" />
              Pending Results
            </h1>
            <p className="text-zinc-400 mt-1">Review host-submitted winner proofs and approve payouts</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {msg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" /> {msg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loadingData ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : proofs.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No pending results to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {proofs.map((p) => (
              <div key={p.id} className="glass-card rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{p.tournament?.title || 'Tournament'}</h3>
                    <p className="text-sm text-zinc-400">
                      Winner: <span className="text-fire-400">{p.user?.username || 'Unknown'}</span>
                      {p.winnerIgn && <span className="text-zinc-500"> ({p.winnerIgn})</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-zinc-500">Prize Pool</p>
                    <p className="text-lg font-bold text-yellow-400">{formatCurrency(typeof p.tournament?.prizePool === 'string' ? parseFloat(p.tournament.prizePool) : p.tournament?.prizePool || 0)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                  <div className="p-2 rounded-lg bg-white/5">
                    <p className="text-zinc-500 text-xs">Winner UID</p>
                    <p className="text-white font-mono">{p.winnerUid}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <p className="text-zinc-500 text-xs">Winner IGN</p>
                    <p className="text-white">{p.winnerIgn || '—'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <p className="text-zinc-500 text-xs">Submitted</p>
                    <p className="text-white">{formatDate(p.createdAt)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5">
                    <p className="text-zinc-500 text-xs">Status</p>
                    <p className="text-yellow-400 font-medium">{p.status}</p>
                  </div>
                </div>

                {p.screenshotUrl && (
                  <a
                    href={p.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-fire-400 hover:text-fire-300 mb-4"
                  >
                    <Eye className="w-4 h-4" /> View Proof Screenshot
                  </a>
                )}

                {rejectId === p.id ? (
                  <div className="space-y-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Enter rejection reason..."
                      className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(p.id)}
                        disabled={!rejectReason.trim()}
                        className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => { setRejectId(null); setRejectReason(''); }}
                        className="px-4 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-xs font-medium hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(p.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve Payout
                    </button>
                    <button
                      onClick={() => setRejectId(p.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
