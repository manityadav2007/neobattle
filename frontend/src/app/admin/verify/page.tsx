'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, CheckCircle, XCircle, AlertCircle, Loader2, Eye, RefreshCw, MessageSquareMore,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminApi, verificationApi, formatDate } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface VerificationItem {
  id: string;
  freeFireId: string;
  screenshotUrl: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  user: { id: string; username: string; email: string };
}

export default function AdminVerifyPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && !isSuperAdmin) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const res = await verificationApi.listPending();
      setVerifications(res.data || []);
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
    setProcessing(id);
    setError('');
    setActionMsg('');
    try {
      await adminApi.reviewVerification(id, 'APPROVED');
      setActionMsg('Verification approved');
      setVerifications((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setProcessing(id);
    setError('');
    setActionMsg('');
    try {
      await adminApi.reviewVerification(id, 'REJECTED', rejectReason.trim());
      setActionMsg('Verification rejected');
      setVerifications((prev) => prev.filter((v) => v.id !== id));
      setSelectedId(null);
      setRejectReason('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing(null);
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-fire-400" />
              Verification Queue
            </h1>
            <p className="text-zinc-400 mt-1">Review Free Fire ID verification submissions</p>
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

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">
            Pending Reviews ({verifications.length})
          </h2>

          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : verifications.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No pending verifications</p>
          ) : (
            <div className="space-y-4">
              {verifications.map((v) => (
                <div key={v.id} className="p-5 rounded-xl bg-white/3 border border-white/5">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-white">{v.user.username}</p>
                        <span className="text-xs text-zinc-500">{formatDate(v.createdAt)}</span>
                      </div>
                      <p className="text-xs text-zinc-500">{v.user.email}</p>
                      <p className="text-sm font-mono text-fire-400 mt-2">UID: {v.freeFireId}</p>
                      <div className="mt-3">
                        {v.screenshotUrl ? (
                          <a
                            href={v.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-fire-400 hover:text-fire-300"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Screenshot
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500">No screenshot</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:min-w-[200px]">
                      {selectedId === v.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReject(v.id)}
                              disabled={processing === v.id || !rejectReason.trim()}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
                            >
                              {processing === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => { setSelectedId(null); setRejectReason(''); }}
                              className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-xs hover:bg-white/10"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(v.id)}
                            disabled={processing === v.id}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50"
                          >
                            {processing === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            Approve
                          </button>
                          <button
                            onClick={() => { setSelectedId(v.id); setRejectReason(''); }}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
