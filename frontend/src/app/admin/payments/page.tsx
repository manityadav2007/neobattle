'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface UpiPayment {
  id: string;
  userId: string;
  tournamentId: string | null;
  amount: number;
  utrNumber: string;
  status: string;
  createdAt: string;
  user: { id: string; uid: string; username: string; email: string };
  tournament: { id: string; title: string } | null;
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [payments, setPayments] = useState<UpiPayment[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | ''>('PENDING');

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) router.push(user ? '/dashboard' : '/login');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      const endpoint = filter ? `/payment/all?status=${filter}` : '/payment/pending';
      const res = await api.get(endpoint);
      setPayments(res.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin, filter]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    setError('');
    setActionMsg('');
    try {
      await api.patch(`/payment/${id}/approve`);
      setActionMsg('Payment approved');
      setPayments((prev) => prev.filter((p) => p.id !== id));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    setError('');
    setActionMsg('');
    try {
      await api.patch(`/payment/${id}/reject`);
      setActionMsg('Payment rejected');
      setPayments((prev) => prev.filter((p) => p.id !== id));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing(null);
    }
  };

  if (loading || !isSuperAdmin) return null;

  const tabs = [
    { label: 'Pending', value: 'PENDING' as const },
    { label: 'Approved', value: 'APPROVED' as const },
    { label: 'Rejected', value: 'REJECTED' as const },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-fire-400" />
              UPI Payments
            </h1>
            <p className="text-zinc-400 mt-1">Review and approve UPI payment requests</p>
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

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filter ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-zinc-400 hover:text-white'}`}
          >
            All
          </button>
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === t.value ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-zinc-400 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="glass-card rounded-2xl p-6">
          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No payments found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-400 border-b border-white/5">
                    <th className="text-left py-3 pr-4">User</th>
                    <th className="text-left py-3 pr-4">Tournament</th>
                    <th className="text-right py-3 pr-4">Amount</th>
                    <th className="text-left py-3 pr-4">UTR</th>
                    <th className="text-left py-3 pr-4">Status</th>
                    <th className="text-left py-3 pr-4">Date</th>
                    <th className="text-right py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 text-zinc-300">{p.user?.username || 'N/A'}</td>
                      <td className="py-3 pr-4 text-zinc-400">{p.tournament?.title || 'Wallet Deposit'}</td>
                      <td className="py-3 pr-4 text-right text-white font-medium">{formatCurrency(p.amount)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-zinc-400">{p.utrNumber}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          p.status === 'PENDING' ? 'text-yellow-400 bg-yellow-500/10' :
                          p.status === 'APPROVED' ? 'text-green-400 bg-green-500/10' :
                          'text-red-400 bg-red-500/10'
                        }`}>{p.status}</span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-500 text-xs whitespace-nowrap">{formatDate(p.createdAt)}</td>
                      <td className="py-3 text-right">
                        {p.status === 'PENDING' && (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleApprove(p.id)}
                              disabled={processing === p.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50"
                            >
                              {processing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(p.id)}
                              disabled={processing === p.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
                            >
                              {processing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
