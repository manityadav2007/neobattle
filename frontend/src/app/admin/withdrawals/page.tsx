'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote, Copy, CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, ArrowLeft, Search, Check,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface WithdrawalItem {
  id: string;
  userId: string;
  amount: number;
  type: string;
  status: string;
  accountDetails?: string;
  payoutMethod?: string;
  payoutDetails?: {
    method?: string;
    upiId?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    accountHolderName?: string;
  } | null;
  reference?: string | null;
  description?: string | null;
  giftCode?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  user: { id: string; uid?: string; username: string; email: string; freeFireId?: string | null };
  source?: 'TRANSACTION' | 'REDEEM_REQUEST';
}

const TAB_STATUSES = ['PENDING', 'COMPLETED', 'REJECTED', 'ALL'] as const;

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin, isAdmin } = useAuth();
  const [requests, setRequests] = useState<WithdrawalItem[]>([]);
  const [filter, setFilter] = useState<string>('PENDING');
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [refInput, setRefInput] = useState<Record<string, string>>({});
  const [rejectionReasonInput, setRejectionReasonInput] = useState<Record<string, string>>({});
  const [showRejectBox, setShowRejectBox] = useState<Record<string, boolean>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && !isSuperAdmin && !isAdmin) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, isAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      setError('');
      const res = await adminApi.withdrawals(filter === 'ALL' ? undefined : filter);
      setRequests(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin || isAdmin) loadData();
  }, [isSuperAdmin, isAdmin, filter]);

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleApprove = async (r: WithdrawalItem) => {
    const reference = refInput[r.id]?.trim();
    setApproving(r.id);
    setActionMsg('');
    setError('');
    try {
      await adminApi.reviewWithdrawal(r.id, 'COMPLETED', {
        reference: reference || undefined,
        giftCode: r.type === 'GIFT_CARD' ? reference : undefined,
      });
      setActionMsg(`Withdrawal of ${formatCurrency(r.amount)} marked as completed!`);
      setRefInput((prev) => ({ ...prev, [r.id]: '' }));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (r: WithdrawalItem) => {
    const reason = rejectionReasonInput[r.id]?.trim() || 'Request declined by administrator';
    setApproving(r.id);
    setActionMsg('');
    setError('');
    try {
      await adminApi.reviewWithdrawal(r.id, 'REJECTED', { rejectionReason: reason });
      setActionMsg(`Withdrawal rejected — ${formatCurrency(r.amount)} refunded to user's wallet.`);
      setShowRejectBox((prev) => ({ ...prev, [r.id]: false }));
      setRejectionReasonInput((prev) => ({ ...prev, [r.id]: '' }));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApproving(null);
    }
  };

  if (loading || (!isSuperAdmin && !isAdmin)) return null;

  const statusColor = (s: string) => {
    switch (s) {
      case 'PENDING': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'APPROVED':
      case 'COMPLETED': return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'REJECTED':
      case 'CANCELLED': return 'text-red-400 bg-red-500/10 border-red-500/30';
      default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <Link href="/admin" className="hover:text-white transition-colors flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
              </Link>
            </div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Banknote className="w-8 h-8 text-blue-400" />
              Withdrawal Requests
            </h1>
            <p className="text-zinc-400 mt-1">Review, approve payouts, and process refunds for user withdrawals</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
              {TAB_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === s ? 'bg-fire-500/20 text-fire-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loadingData}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300 border border-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-fire-400' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4 shrink-0" /> {actionMsg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loadingData ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : requests.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Search className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400 font-medium">No {filter !== 'ALL' ? filter.toLowerCase() : ''} withdrawal requests found</p>
            <p className="text-xs text-zinc-600 mt-1">When users request withdrawals via UPI or Bank Transfer, they will appear here immediately.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const payout = r.payoutDetails;
              const isUpi = r.type === 'UPI' || !!payout?.upiId;
              const isBank = r.type === 'BANK_TRANSFER' || !!payout?.bankAccountNumber;
              const upiVal = payout?.upiId || (r.accountDetails?.startsWith('UPI:') ? r.accountDetails.replace(/^UPI:\s*/, '') : r.accountDetails);

              return (
                <div key={r.id} className="glass-card rounded-2xl p-5 border border-white/10 hover:border-white/20 transition-all shadow-md">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="min-w-0 flex-1 space-y-2.5">
                      {/* User & Status row */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-white text-base">{r.user.username}</span>
                        {r.user.uid && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                            UID: {r.user.uid}
                          </span>
                        )}
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${statusColor(r.status)}`}>
                          {r.status}
                        </span>
                        <span className="text-xs text-zinc-500">({r.user.email})</span>
                      </div>

                      {/* Amount & Method row */}
                      <div className="flex items-center gap-3 text-sm flex-wrap">
                        <span className="text-xl font-display font-extrabold text-fire-400">
                          {formatCurrency(r.amount)}
                        </span>
                        <span className="text-zinc-700">|</span>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${
                          isUpi
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isBank
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}>
                          {isUpi ? 'UPI Payout' : isBank ? 'Bank Transfer' : r.type}
                        </span>
                        <span className="text-zinc-700">|</span>
                        <span className="text-zinc-400 text-xs">
                          Requested: {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Explicit Payout Details Block */}
                      <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2 text-xs">
                        {isUpi && upiVal && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-zinc-400 font-medium">UPI ID / VPA:</span>
                            <code className="px-2.5 py-1 rounded bg-black/40 text-emerald-300 font-mono font-semibold text-sm">
                              {upiVal}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(upiVal, `${r.id}-upi`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                              title="Copy UPI ID"
                            >
                              {copiedKey === `${r.id}-upi` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                  <span className="text-green-400 font-medium">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy UPI</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {isBank && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div>
                                <span className="text-zinc-400">Account No: </span>
                                <code className="font-mono text-white font-semibold">{payout?.bankAccountNumber || 'N/A'}</code>
                              </div>
                              <div>
                                <span className="text-zinc-400">IFSC: </span>
                                <code className="font-mono text-yellow-300 font-semibold">{payout?.bankIfsc || 'N/A'}</code>
                              </div>
                              {payout?.accountHolderName && (
                                <div>
                                  <span className="text-zinc-400">Holder: </span>
                                  <span className="text-white font-medium">{payout.accountHolderName}</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => handleCopy(`${payout?.bankAccountNumber || ''} ${payout?.bankIfsc || ''}`, `${r.id}-bank`)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px]"
                              >
                                {copiedKey === `${r.id}-bank` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                <span>Copy Bank Details</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {!isUpi && !isBank && r.accountDetails && (
                          <div>
                            <span className="text-zinc-400">Account Info: </span>
                            <span className="text-zinc-200">{r.accountDetails}</span>
                          </div>
                        )}

                        {r.reference && (
                          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                            <span className="text-zinc-400">Transaction Ref / UTR:</span>
                            <code className="font-mono text-green-400 font-semibold">{r.reference}</code>
                          </div>
                        )}

                        {r.giftCode && (
                          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                            <span className="text-zinc-400">Gift Code:</span>
                            <code className="font-mono text-purple-300 font-semibold bg-black/40 px-2 py-0.5 rounded">{r.giftCode}</code>
                          </div>
                        )}

                        {r.rejectionReason && (
                          <div className="text-red-400 pt-1 border-t border-white/5">
                            <span>Rejection Reason: </span>
                            <span className="text-red-300">{r.rejectionReason}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Controls for PENDING */}
                    {r.status === 'PENDING' && (
                      <div className="flex flex-col gap-2.5 shrink-0 lg:w-72 pt-2 lg:pt-0">
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-zinc-400 block">UTR / Transaction Ref (Optional):</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={refInput[r.id] || ''}
                              onChange={(e) => setRefInput((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="e.g. UTR / Ref ID..."
                              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono placeholder:text-zinc-600 focus:border-green-500/50 outline-none"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => handleApprove(r)}
                          disabled={approving === r.id}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-xs font-bold transition-all shadow-md hover:scale-[1.01] disabled:opacity-50"
                        >
                          {approving === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          <span>Approve & Mark Paid</span>
                        </button>

                        {!showRejectBox[r.id] ? (
                          <button
                            onClick={() => setShowRejectBox((prev) => ({ ...prev, [r.id]: true }))}
                            disabled={approving === r.id}
                            className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject & Refund
                          </button>
                        ) : (
                          <div className="space-y-2 p-2.5 rounded-xl bg-red-500/5 border border-red-500/20">
                            <input
                              type="text"
                              value={rejectionReasonInput[r.id] || ''}
                              onChange={(e) => setRejectionReasonInput((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="Reason for rejection..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs placeholder:text-zinc-600 outline-none focus:border-red-500"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReject(r)}
                                disabled={approving === r.id}
                                className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
                              >
                                Confirm Reject
                              </button>
                              <button
                                onClick={() => setShowRejectBox((prev) => ({ ...prev, [r.id]: false }))}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
