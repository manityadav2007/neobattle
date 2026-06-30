'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Banknote, AlertCircle, CheckCircle, XCircle, Eye, RefreshCw, Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminApi, formatCurrency, type DepositRequest } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminDepositsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      const res = await adminApi.pendingDeposits();
      setDeposits(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await adminApi.reviewDeposit(id, status, status === 'REJECTED' ? 'Screenshot invalid' : undefined);
      setActionMsg(`Deposit ${status.toLowerCase()}`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Admin Panel
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Banknote className="w-8 h-8 text-fire-400" />
              Deposit Requests
            </h1>
            <p className="text-zinc-400 mt-1">Review and approve/reject user deposit requests</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
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

        {loadingData ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : deposits.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Banknote className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No pending deposit requests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deposits.map((d) => (
              <div key={d.id} className="glass-card rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{d.user?.username || 'Unknown'}</p>
                    <p className="text-xs text-zinc-500">{d.user?.email}</p>
                    <p className="text-lg font-bold text-green-400 mt-1">{formatCurrency(d.amount)}</p>
                    <p className="text-xs text-zinc-500 mt-1">Requested: {new Date(d.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.screenshotUrl && (
                      <a href={d.screenshotUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-xs font-medium hover:bg-white/10 transition-colors">
                        <Eye className="w-3.5 h-3.5" /> View Screenshot
                      </a>
                    )}
                    <button onClick={() => handleReview(d.id, 'APPROVED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleReview(d.id, 'REJECTED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
