'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft,
  Shield,
  Banknote,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Loader2,
  Clock,
  Sparkles,
  Link as LinkIcon,
  X,
  FileText,
  User,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminApi, formatCurrency, formatDate, type DepositRequest } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

function formatTimeSinceExpiry(ms?: number): string {
  if (!ms || ms <= 0) return 'Just expired';
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminDepositsPage() {
  const router = useRouter();
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Rejection modal state
  const [rejectModalClaim, setRejectModalClaim] = useState<DepositRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Screenshot modal preview
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);

  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading && (!user || (!isSuperAdmin && !isAdmin))) router.push('/dashboard');
  }, [user, loading, isAdmin, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    setIsRateLimited(false);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    try {
      const res = await adminApi.pendingDeposits();
      setDeposits(res.data || []);
      setError('');
    } catch (err: any) {
      const is429 = axios.isAxiosError(err) && err.response?.status === 429;
      if (is429) {
        setIsRateLimited(true);
        const retryDelay = 5;
        setRetrySeconds(retryDelay);
        setError('Too many requests. Retrying automatically...');

        countdownTimerRef.current = setInterval(() => {
          setRetrySeconds((prev) => {
            if (prev <= 1) {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        retryTimerRef.current = setTimeout(() => {
          loadData();
        }, retryDelay * 1000);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAdmin || isSuperAdmin) loadData();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isAdmin, isSuperAdmin]);

  const handleReview = async (
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
    unmatchedPaymentId?: string
  ) => {
    try {
      setSubmittingAction(true);
      setError('');
      await adminApi.reviewDeposit(id, status, reason, unmatchedPaymentId);
      setActionMsg(
        status === 'APPROVED'
          ? unmatchedPaymentId
            ? 'Deposit approved and linked with bank SMS!'
            : 'Deposit approved and credited!'
          : 'Deposit claim rejected.'
      );
      setRejectModalClaim(null);
      setRejectionReason('');
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading || (!isSuperAdmin && !isAdmin)) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href="/admin"
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Banknote className="w-8 h-8 text-teal-400" />
              Manual Deposits Queue
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Review and approve user deposit claims with screenshot verification and SMS matching
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loadingData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-zinc-300 transition-colors disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} /> Refresh Queue
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {actionMsg && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{actionMsg}</span>
          </div>
        )}

        {/* Queue Content */}
        {loadingData ? (
          <div className="p-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <p className="text-xs text-zinc-500">Loading pending deposit claims...</p>
          </div>
        ) : isRateLimited ? (
          <div className="glass-card rounded-2xl p-10 text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-2" />
            <p className="text-amber-400 font-medium">
              Server busy (rate limit). Retrying in {retrySeconds}s...
            </p>
            <button
              type="button"
              onClick={loadData}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Now
            </button>
          </div>
        ) : deposits.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400/80 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Queue is clear!</h3>
            <p className="text-zinc-400 text-sm max-w-sm mx-auto">
              No pending manual deposit claims or screenshot verifications waiting for review.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {deposits.map((d) => {
              const exactAmt = typeof d.exactAmount === 'number' ? d.exactAmount : Number(d.amount);
              const baseAmt = typeof d.baseAmount === 'number' ? d.baseAmount : Number(d.amount);

              return (
                <div
                  key={d.id}
                  className="glass-card rounded-2xl p-5 sm:p-6 border border-white/10 hover:border-teal-500/30 transition-all shadow-xl"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Left: User & Amount details */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-white text-base flex items-center gap-1.5">
                          <User className="w-4 h-4 text-teal-400" />
                          {d.user?.username || 'Unknown User'}
                        </span>
                        <span className="text-xs text-zinc-400 font-mono bg-white/5 px-2 py-0.5 rounded">
                          {d.user?.email}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
                          Under Review
                        </span>
                      </div>

                      {/* Amounts */}
                      <div className="flex items-baseline gap-2.5 flex-wrap">
                        <span className="text-2xl font-black text-white font-mono">
                          {formatCurrency(exactAmt, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-zinc-400">
                          (Exact paid amount with paise • Wallet will be credited{' '}
                          <strong className="text-emerald-400">{formatCurrency(baseAmt)}</strong>)
                        </span>
                      </div>

                      {/* UTR & Timestamps */}
                      <div className="flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
                        {d.utrNumber ? (
                          <div className="flex items-center gap-1 text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg font-mono">
                            <span className="text-zinc-400">UTR:</span>
                            <strong>{d.utrNumber}</strong>
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">No UTR provided</span>
                        )}

                        <span className="text-zinc-500">•</span>
                        <span>Claim Submitted: {formatDate(d.createdAt)}</span>

                        {d.requestExpiredAt && (
                          <>
                            <span className="text-zinc-500">•</span>
                            <span className="flex items-center gap-1 text-orange-400">
                              <Clock className="w-3.5 h-3.5" />
                              Expired {formatTimeSinceExpiry(d.timeSinceExpiryMs)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* User Notes if present */}
                      {d.notes && (
                        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-zinc-300 flex items-start gap-1.5 max-w-xl">
                          <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Note:</strong> {d.notes}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions & Screenshot */}
                    <div className="flex items-center gap-2.5 flex-wrap lg:justify-end">
                      {d.screenshotUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewScreenshotUrl(d.screenshotUrl)}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 text-zinc-200 text-xs font-semibold hover:bg-white/10 border border-white/10 transition-colors"
                        >
                          <Eye className="w-4 h-4 text-teal-400" /> View Screenshot
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleReview(d.id, 'APPROVED')}
                        disabled={submittingAction}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve ({formatCurrency(baseAmt)})
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRejectModalClaim(d);
                          setRejectionReason('');
                        }}
                        disabled={submittingAction}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>

                  {/* Auto-suggested matching bank SMS banner */}
                  {d.suggestedMatch && (
                    <div className="mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                      <div className="flex items-start gap-2.5 text-xs">
                        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-emerald-300">
                            Auto-suggested Match from Unmatched SMS:
                          </p>
                          <p className="text-zinc-300 mt-0.5">
                            Amount:{' '}
                            <strong className="text-white">
                              {formatCurrency(d.suggestedMatch.amount, { minimumFractionDigits: 2 })}
                            </strong>{' '}
                            • Sender: {d.suggestedMatch.sender || 'Unknown'} • UTR:{' '}
                            <span className="font-mono">{d.suggestedMatch.utrNumber || 'N/A'}</span> • Received:{' '}
                            {formatDate(d.suggestedMatch.receivedAt)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReview(d.id, 'APPROVED', undefined, d.suggestedMatch!.id)}
                        disabled={submittingAction}
                        className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        Link &amp; Approve
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Screenshot Preview Modal */}
      <AnimatePresence>
        {previewScreenshotUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setPreviewScreenshotUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col items-center"
            >
              <div className="w-full flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-teal-400" /> Payment Screenshot
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewScreenshotUrl(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-auto rounded-xl bg-black flex items-center justify-center w-full">
                <img
                  src={previewScreenshotUrl}
                  alt="Deposit Proof"
                  className="max-h-[70vh] w-auto object-contain rounded-lg shadow-inner"
                />
              </div>

              <p className="text-[11px] text-zinc-500 mt-3 text-center">
                Signed URL generated securely for administrator review. Expires automatically.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rejection Modal with Required Reason */}
      <AnimatePresence>
        {rejectModalClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setRejectModalClaim(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-md w-full bg-zinc-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" /> Reject Deposit Claim
                </h3>
                <button
                  type="button"
                  onClick={() => setRejectModalClaim(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-zinc-400 mb-3">
                Please specify a reason for rejecting the claim for user{' '}
                <strong className="text-white">{rejectModalClaim.user?.username}</strong> (
                {formatCurrency(Number(rejectModalClaim.amount))}). This reason will be sent to the user in an in-app notification.
              </p>

              <div className="space-y-3 mb-5">
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. UTR number not found in bank records, screenshot unreadable, or amount mismatch..."
                  className="input-field w-full p-3 rounded-xl text-white text-xs"
                  autoFocus
                />
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    'UTR not found in bank records',
                    'Screenshot invalid or unreadable',
                    'Amount mismatch',
                    'Payment was cancelled or reversed',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionReason(preset)}
                      className="text-[10px] bg-white/5 hover:bg-white/10 text-zinc-300 px-2 py-1 rounded-lg border border-white/5 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalClaim(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReview(rejectModalClaim.id, 'REJECTED', rejectionReason.trim())}
                  disabled={!rejectionReason.trim() || submittingAction}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {submittingAction ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
