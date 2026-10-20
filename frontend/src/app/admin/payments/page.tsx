'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw,
  MessageSquare, Search, UserCheck, ChevronDown, ChevronUp, X, CreditCard, Eye,
  Zap, TrendingUp, ShieldCheck, User, Clock, Sparkles, Link as LinkIcon, FileText, Banknote
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api, getErrorMessage } from '@/lib/api';
import {
  formatCurrency, formatDate, dynamicDepositApi, UnmatchedPaymentRecord, userApi,
  AutoDepositRecord, AutoDepositSummary, adminApi, type DepositRequest
} from '@/lib/services';

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

interface SearchedUser {
  id: string;
  uid: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  freeFireId?: string | null;
}

function formatTimeSinceExpiry(ms?: number): string {
  if (!ms || ms <= 0) return 'Just expired';
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin, isAdmin } = useAuth();
  const hasAccess = isSuperAdmin || isAdmin;

  const [payments, setPayments] = useState<UpiPayment[]>([]);
  const [depositClaims, setDepositClaims] = useState<DepositRequest[]>([]);
  const [unmatchedPayments, setUnmatchedPayments] = useState<UnmatchedPaymentRecord[]>([]);
  const [autoDeposits, setAutoDeposits] = useState<AutoDepositRecord[]>([]);
  const [autoSummary, setAutoSummary] = useState<AutoDepositSummary | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'UNMATCHED' | 'AUTO' | ''>('PENDING');
  const [pendingSubFilter, setPendingSubFilter] = useState<'ALL' | 'CLAIMS' | 'UPI' | 'UNMATCHED'>('ALL');

  // Claim Review State
  const [rejectModalClaim, setRejectModalClaim] = useState<DepositRequest | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [rejectingClaim, setRejectingClaim] = useState(false);
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);

  // Credit Unmatched Modal state
  const [selectedPaymentForCredit, setSelectedPaymentForCredit] = useState<UnmatchedPaymentRecord | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<SearchedUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedTargetUser, setSelectedTargetUser] = useState<SearchedUser | null>(null);
  const [creditNotes, setCreditNotes] = useState('');
  const [creditProcessing, setCreditProcessing] = useState(false);

  // View SMS Modal state
  const [viewSmsPayment, setViewSmsPayment] = useState<UnmatchedPaymentRecord | null>(null);

  // Collapsible Resolved History
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !hasAccess)) router.push(user ? '/dashboard' : '/login');
  }, [user, loading, hasAccess, router]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      // Always fetch auto deposits and summary metrics
      try {
        const autoRes = await dynamicDepositApi.listAutoDeposits();
        if (autoRes.success && autoRes.data) {
          setAutoDeposits(autoRes.data.deposits || []);
          setAutoSummary(autoRes.data.summary || null);
        }
      } catch (autoErr) {
        console.warn('Failed to load auto deposits data:', autoErr);
      }

      if (filter === 'UNMATCHED') {
        const res = await dynamicDepositApi.listUnmatched();
        setUnmatchedPayments(res.data || []);
      } else if (filter === 'AUTO') {
        // Handled by listAutoDeposits
      } else if (filter === 'PENDING') {
        const [upiRes, claimsRes, unmatchedRes] = await Promise.allSettled([
          api.get('/payment/pending'),
          adminApi.pendingDeposits(),
          dynamicDepositApi.listUnmatched(),
        ]);
        if (upiRes.status === 'fulfilled') setPayments(upiRes.value.data?.data || []);
        if (claimsRes.status === 'fulfilled') setDepositClaims(claimsRes.value?.data || []);
        if (unmatchedRes.status === 'fulfilled') setUnmatchedPayments(unmatchedRes.value?.data || []);
      } else {
        const endpoint = filter ? `/payment/all?status=${filter}` : '/payment/pending';
        const res = await api.get(endpoint);
        setPayments(res.data.data || []);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (hasAccess) loadData();
  }, [hasAccess, filter]);

  // Debounced search for users
  useEffect(() => {
    if (!selectedPaymentForCredit) return;
    const timer = setTimeout(async () => {
      const q = userSearchQuery.trim();
      if (q.length >= 2) {
        setIsSearchingUsers(true);
        try {
          const res = await userApi.search(q);
          setUserSearchResults(res.data || []);
        } catch {
          setUserSearchResults([]);
        } finally {
          setIsSearchingUsers(false);
        }
      } else {
        setUserSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearchQuery, selectedPaymentForCredit]);

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

  const handleApproveClaim = async (claim: DepositRequest, useSuggested = false) => {
    setProcessing(`claim_${claim.id}`);
    setError('');
    setActionMsg('');
    try {
      const unmatchedId = useSuggested ? claim.suggestedMatch?.id : undefined;
      await adminApi.reviewDeposit(claim.id, 'APPROVED', undefined, unmatchedId);
      setActionMsg(`Claim for ${formatCurrency(claim.amount)} approved and credited!`);
      setDepositClaims((prev) => prev.filter((c) => c.id !== claim.id));
      if (useSuggested && claim.suggestedMatch?.id) {
        setUnmatchedPayments((prev) => prev.filter((u) => u.id !== claim.suggestedMatch!.id));
      }
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing(null);
    }
  };

  const handleConfirmRejectClaim = async () => {
    if (!rejectModalClaim) return;
    const reason = rejectReasonInput.trim();
    if (!reason) {
      setError('Please provide a rejection reason so the user knows what to correct.');
      return;
    }
    setRejectingClaim(true);
    setError('');
    setActionMsg('');
    try {
      await adminApi.reviewDeposit(rejectModalClaim.id, 'REJECTED', reason);
      setActionMsg('Deposit claim rejected.');
      setDepositClaims((prev) => prev.filter((c) => c.id !== rejectModalClaim.id));
      setRejectModalClaim(null);
      setRejectReasonInput('');
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setRejectingClaim(false);
    }
  };

  const handleOpenCreditModal = (payment: UnmatchedPaymentRecord) => {
    setSelectedPaymentForCredit(payment);
    setSelectedTargetUser(null);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setCreditNotes('');
  };

  const handleConfirmCredit = async () => {
    if (!selectedPaymentForCredit || !selectedTargetUser) return;
    setCreditProcessing(true);
    setError('');
    setActionMsg('');
    try {
      await dynamicDepositApi.creditUnmatched(
        selectedPaymentForCredit.id,
        selectedTargetUser.id,
        creditNotes.trim() || undefined
      );
      setActionMsg(
        `Successfully credited ${formatCurrency(selectedPaymentForCredit.amount)} to @${selectedTargetUser.username}`
      );
      setSelectedPaymentForCredit(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreditProcessing(false);
    }
  };

  if (loading || !hasAccess) return null;

  const pendingUnmatched = unmatchedPayments.filter((p) => p.status === 'PENDING');
  const resolvedUnmatched = unmatchedPayments.filter((p) => p.status === 'RESOLVED');
  const totalPendingCount = payments.length + depositClaims.length + pendingUnmatched.length;

  const tabs = [
    { label: 'Pending', value: 'PENDING' as const, badge: totalPendingCount },
    { label: 'Approved', value: 'APPROVED' as const },
    { label: 'Rejected', value: 'REJECTED' as const },
    { label: 'Completed (Auto)', value: 'AUTO' as const },
    { label: 'Unmatched (SMS)', value: 'UNMATCHED' as const },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-fire-400" />
              UPI Payments & Deposits
            </h1>
            <p className="text-zinc-400 mt-1">Review manual requests and automated bank SMS deposits</p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Daily Summary Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden bg-gradient-to-br from-emerald-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-400">Auto Deposits Today</p>
                <p className="text-2xl font-bold font-display text-white mt-1">
                  {autoSummary ? autoSummary.todayCount : 0}
                </p>
                <p className="text-[11px] text-emerald-400/80 mt-1 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Webhook verified
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Zap className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden bg-gradient-to-br from-cyan-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-400">Auto Deposited Today</p>
                <p className="text-2xl font-bold font-display text-cyan-400 mt-1">
                  {formatCurrency(autoSummary ? autoSummary.todayTotalAmount : 0)}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Instant balance credits
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden bg-gradient-to-br from-purple-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-400">All-Time Auto Volume</p>
                <p className="text-2xl font-bold font-display text-purple-400 mt-1">
                  {formatCurrency(autoSummary ? autoSummary.allTimeTotalAmount : 0)}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {autoSummary ? autoSummary.allTimeCount : 0} deposits total
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {actionMsg && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4 shrink-0" /> {actionMsg}
          </div>
        )}

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => setFilter('')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              !filter
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-sm'
                : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
            }`}
          >
            All Manual
          </button>
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all relative ${
                filter === t.value
                  ? t.value === 'UNMATCHED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : t.value === 'AUTO'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-sm'
                  : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              {t.label}
              {t.value === 'PENDING' && totalPendingCount > 0 && filter !== 'PENDING' && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white">
                  {totalPendingCount}
                </span>
              )}
              {t.value === 'UNMATCHED' && pendingUnmatched.length > 0 && filter !== 'UNMATCHED' && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black">
                  {pendingUnmatched.length}
                </span>
              )}
              {t.value === 'AUTO' && autoSummary && autoSummary.todayCount > 0 && filter !== 'AUTO' && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {autoSummary.todayCount} today
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ======================================================== */}
        {/* COMPLETED (AUTO) PAYMENTS TAB                            */}
        {/* ======================================================== */}
        {filter === 'AUTO' ? (
          <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  Completed Automated Deposits ({autoDeposits.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Deposits automatically verified by the SMS webhook engine with dynamic decimal offsets and instant wallet credit.
                </p>
              </div>
            </div>

            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            ) : autoDeposits.length === 0 ? (
              <div className="text-center py-10">
                <AlertCircle className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-300 font-medium text-sm">No automated deposits yet</p>
                <p className="text-zinc-500 text-xs mt-1">When users pay via dynamic QR and SMS is received, they will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 border-b border-white/5 text-xs uppercase tracking-wider">
                      <th className="text-left py-3 pr-4 font-semibold">User</th>
                      <th className="text-left py-3 pr-4 font-semibold">Credited</th>
                      <th className="text-left py-3 pr-4 font-semibold">QR Paid</th>
                      <th className="text-left py-3 pr-4 font-semibold">UTR / Reference</th>
                      <th className="text-left py-3 pr-4 font-semibold">Date &amp; Time</th>
                      <th className="text-left py-3 pr-4 font-semibold">Matched SMS</th>
                      <th className="text-right py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {autoDeposits.map((d) => {
                      const creditedAmt = Number(d.requestedAmount || d.amount);
                      const actualPaid = d.actualQrAmount ? Number(d.actualQrAmount) : creditedAmt;
                      const rawSms = d.metadata?.rawSms || d.description || '';
                      const sender = d.metadata?.sender || 'Bank / SuperMoney';
                      const utr = d.reference || d.metadata?.utrNumber || 'N/A';

                      return (
                        <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 pr-4 whitespace-nowrap">
                            <div>
                              <span className="font-semibold text-white">@{d.user?.username || 'Unknown'}</span>
                              <div className="text-zinc-500 text-[11px] font-mono">UID: {d.user?.uid || d.userId}</div>
                              {d.user?.email && (
                                <div className="text-zinc-500 text-[10px]">{d.user.email}</div>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 pr-4 text-emerald-400 font-bold text-base whitespace-nowrap">
                            {formatCurrency(creditedAmt)}
                          </td>
                          <td className="py-3.5 pr-4 whitespace-nowrap">
                            <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300">
                              ₹{actualPaid.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4 font-mono text-xs text-zinc-300 whitespace-nowrap">
                            {utr}
                          </td>
                          <td className="py-3.5 pr-4 text-zinc-400 text-xs whitespace-nowrap">
                            {formatDate(d.createdAt)}
                          </td>
                          <td className="py-3.5 pr-4 text-zinc-400 text-xs max-w-xs">
                            {rawSms ? (
                              <div className="flex items-center gap-2">
                                <span className="truncate block font-mono text-zinc-400 max-w-[160px]">
                                  {rawSms}
                                </span>
                                <button
                                  onClick={() =>
                                    setViewSmsPayment({
                                      id: d.id,
                                      amount: actualPaid,
                                      sender,
                                      rawMessage: rawSms,
                                      utrNumber: utr !== 'N/A' ? utr : null,
                                      receivedAt: d.createdAt,
                                      status: 'RESOLVED',
                                      resolvedAt: d.createdAt,
                                      resolvedBy: 'SYSTEM',
                                      resolvedUserId: d.userId,
                                      notes: 'Auto-matched via SMS webhook',
                                    })
                                  }
                                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors shrink-0"
                                  title="View full SMS"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-zinc-600 italic">No SMS payload</span>
                            )}
                          </td>
                          <td className="py-3.5 text-right whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <Zap className="w-3 h-3" /> Auto Matched
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : filter === 'UNMATCHED' ? (
          <div className="space-y-6">
            {/* Pending Unmatched Card */}
            <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    Unmatched Bank Credits ({pendingUnmatched.length})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    SMS payments received where no pending order matched the exact amount. Manually assign them to users.
                  </p>
                </div>
              </div>

              {loadingData ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
              ) : pendingUnmatched.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-10 h-10 text-emerald-400/60 mx-auto mb-2" />
                  <p className="text-zinc-300 font-medium text-sm">All SMS credits matched</p>
                  <p className="text-zinc-500 text-xs mt-1">No pending unmatched bank payments found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-400 border-b border-white/5 text-xs uppercase tracking-wider">
                        <th className="text-left py-3 pr-4 font-semibold">Amount</th>
                        <th className="text-left py-3 pr-4 font-semibold">Sender / Bank</th>
                        <th className="text-left py-3 pr-4 font-semibold">UTR / Ref</th>
                        <th className="text-left py-3 pr-4 font-semibold">Received Date</th>
                        <th className="text-left py-3 pr-4 font-semibold">SMS Message</th>
                        <th className="text-right py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {pendingUnmatched.map((p) => (
                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 pr-4 text-white font-bold text-base whitespace-nowrap">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="py-3.5 pr-4 text-zinc-300 font-medium whitespace-nowrap">
                            {p.sender || <span className="text-zinc-500 italic">Unknown</span>}
                          </td>
                          <td className="py-3.5 pr-4 font-mono text-xs text-zinc-400 whitespace-nowrap">
                            {p.utrNumber || <span className="text-zinc-600">N/A</span>}
                          </td>
                          <td className="py-3.5 pr-4 text-zinc-400 text-xs whitespace-nowrap">
                            {formatDate(p.receivedAt)}
                          </td>
                          <td className="py-3.5 pr-4 text-zinc-400 text-xs max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className="truncate block font-mono text-zinc-400 max-w-[200px]">
                                {p.rawMessage}
                              </span>
                              <button
                                onClick={() => setViewSmsPayment(p)}
                                className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors shrink-0"
                                title="View full SMS"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleOpenCreditModal(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold transition-all shadow-sm active:scale-95"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Manually Credit Wallet
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Resolved Payments History Collapsible */}
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setShowResolvedHistory((prev) => !prev)}
                className="w-full px-6 py-4 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-zinc-300">
                    Resolved Payments History ({resolvedUnmatched.length})
                  </span>
                </div>
                <div className="text-zinc-400 flex items-center gap-1 text-xs">
                  <span>{showResolvedHistory ? 'Hide' : 'Show'} History</span>
                  {showResolvedHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showResolvedHistory && (
                <div className="p-6 border-t border-white/5">
                  {resolvedUnmatched.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-4">No resolved payments yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-500 border-b border-white/5 uppercase tracking-wider">
                            <th className="text-left py-2.5 pr-4">Amount</th>
                            <th className="text-left py-2.5 pr-4">Credited To</th>
                            <th className="text-left py-2.5 pr-4">UTR / Ref</th>
                            <th className="text-left py-2.5 pr-4">Resolved Date</th>
                            <th className="text-left py-2.5 pr-4">Notes</th>
                            <th className="text-right py-2.5">SMS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {resolvedUnmatched.map((r) => (
                            <tr key={r.id} className="text-zinc-400 hover:bg-white/[0.01]">
                              <td className="py-2.5 pr-4 text-white font-medium whitespace-nowrap">
                                {formatCurrency(r.amount)}
                              </td>
                              <td className="py-2.5 pr-4 whitespace-nowrap">
                                {r.resolvedUser ? (
                                  <span className="text-emerald-400 font-medium">
                                    @{r.resolvedUser.username}
                                    <span className="text-zinc-500 text-[10px] ml-1">({r.resolvedUser.email})</span>
                                  </span>
                                ) : (
                                  <span className="text-zinc-500">ID: {r.resolvedUserId}</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-zinc-500 whitespace-nowrap">
                                {r.utrNumber || 'N/A'}
                              </td>
                              <td className="py-2.5 pr-4 whitespace-nowrap">
                                {r.resolvedAt ? formatDate(r.resolvedAt) : 'N/A'}
                              </td>
                              <td className="py-2.5 pr-4 max-w-xs truncate text-zinc-500">
                                {r.notes || '-'}
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => setViewSmsPayment(r)}
                                  className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white inline-flex"
                                  title="View SMS"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : filter === 'PENDING' ? (
          /* ======================================================== */
          /* UNIFIED PENDING QUEUES: CLAIMS + UPI + UNMATCHED        */
          /* ======================================================== */
          <div className="space-y-6">
            {/* Sub-Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPendingSubFilter('ALL')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  pendingSubFilter === 'ALL'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                All Pending ({totalPendingCount})
              </button>
              <button
                onClick={() => setPendingSubFilter('CLAIMS')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  pendingSubFilter === 'CLAIMS'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                Screenshot Claims ({depositClaims.length})
              </button>
              <button
                onClick={() => setPendingSubFilter('UPI')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  pendingSubFilter === 'UPI'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                UPI Submissions ({payments.length})
              </button>
              <button
                onClick={() => setPendingSubFilter('UNMATCHED')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  pendingSubFilter === 'UNMATCHED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                Unmatched SMS ({pendingUnmatched.length})
              </button>
            </div>

            {loadingData ? (
              <div className="glass-card rounded-2xl p-12 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
              </div>
            ) : totalPendingCount === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center border border-white/10 shadow-xl">
                <CheckCircle className="w-12 h-12 text-emerald-400/80 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">Queue is clear!</h3>
                <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                  No pending manual deposit claims, UPI payments, or unmatched SMS waiting for review.
                </p>
              </div>
            ) : (
              <>
                {/* 1. SCREENSHOT CLAIMS */}
                {(pendingSubFilter === 'ALL' || pendingSubFilter === 'CLAIMS') && depositClaims.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-1">
                      <h2 className="text-sm font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
                        <Banknote className="w-4 h-4" />
                        Manual Screenshot Claims ({depositClaims.length})
                      </h2>
                    </div>

                    {depositClaims.map((d) => {
                      const exactAmt = typeof d.exactAmount === 'number' ? d.exactAmount : Number(d.amount);
                      const baseAmt = typeof d.baseAmount === 'number' ? d.baseAmount : Number(d.amount);
                      const isClaimBusy = processing === `claim_${d.id}`;

                      return (
                        <div
                          key={d.id}
                          className="glass-card rounded-2xl p-5 sm:p-6 border border-white/10 hover:border-teal-500/30 transition-all shadow-xl"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                            {/* User & Amount */}
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-bold text-white text-base flex items-center gap-1.5">
                                  <User className="w-4 h-4 text-teal-400" />
                                  @{d.user?.username || 'Unknown User'}
                                </span>
                                <span className="text-xs text-zinc-400 font-mono bg-white/5 px-2 py-0.5 rounded">
                                  {d.user?.email}
                                </span>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
                                  Under Review
                                </span>
                              </div>

                              <div className="flex items-baseline gap-2.5 flex-wrap">
                                <span className="text-2xl font-black text-white font-mono">
                                  {formatCurrency(exactAmt, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-xs text-zinc-400">
                                  (Exact paid amount • Wallet credit:{' '}
                                  <strong className="text-emerald-400">{formatCurrency(baseAmt)}</strong>)
                                </span>
                              </div>

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

                              {d.notes && (
                                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-zinc-300 flex items-start gap-1.5 max-w-xl">
                                  <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                                  <span>
                                    <strong>User Note:</strong> {d.notes}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Actions & Screenshot */}
                            <div className="flex items-center gap-2.5 flex-wrap lg:justify-end">
                              {d.screenshotUrl && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewScreenshotUrl(d.screenshotUrl)}
                                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 text-zinc-200 text-xs font-semibold hover:bg-white/10 border border-white/10 transition-colors"
                                >
                                  <Eye className="w-4 h-4 text-teal-400" /> View Screenshot
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleApproveClaim(d, false)}
                                disabled={isClaimBusy}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                              >
                                {isClaimBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Approve ({formatCurrency(baseAmt)})
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModalClaim(d);
                                  setRejectReasonInput('');
                                }}
                                disabled={isClaimBusy}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-all disabled:opacity-50"
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
                                onClick={() => handleApproveClaim(d, true)}
                                disabled={isClaimBusy}
                                className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                              >
                                {isClaimBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                                Approve with Matched SMS
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. REGULAR UPI SUBMISSIONS */}
                {(pendingSubFilter === 'ALL' || pendingSubFilter === 'UPI') && payments.length > 0 && (
                  <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
                    <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      UPI Submissions ({payments.length})
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-400 border-b border-white/5 text-xs uppercase tracking-wider">
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
                              <td className="py-3 pr-4 text-zinc-300">@{p.user?.username || 'N/A'}</td>
                              <td className="py-3 pr-4 text-zinc-400">{p.tournament?.title || 'Wallet Deposit'}</td>
                              <td className="py-3 pr-4 text-right text-white font-medium">{formatCurrency(p.amount)}</td>
                              <td className="py-3 pr-4 font-mono text-xs text-zinc-400">{p.utrNumber}</td>
                              <td className="py-3 pr-4">
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-yellow-400 bg-yellow-500/10">
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-zinc-500 text-xs whitespace-nowrap">{formatDate(p.createdAt)}</td>
                              <td className="py-3 text-right">
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
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. UNMATCHED BANK SMS */}
                {(pendingSubFilter === 'ALL' || pendingSubFilter === 'UNMATCHED') && pendingUnmatched.length > 0 && (
                  <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
                    <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Unmatched Bank Credits ({pendingUnmatched.length})
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-400 border-b border-white/5 text-xs uppercase tracking-wider">
                            <th className="text-left py-3 pr-4 font-semibold">Amount</th>
                            <th className="text-left py-3 pr-4 font-semibold">Sender / Bank</th>
                            <th className="text-left py-3 pr-4 font-semibold">UTR / Ref</th>
                            <th className="text-left py-3 pr-4 font-semibold">Received Date</th>
                            <th className="text-left py-3 pr-4 font-semibold">SMS Message</th>
                            <th className="text-right py-3 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {pendingUnmatched.map((p) => (
                            <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3.5 pr-4 text-white font-bold text-base whitespace-nowrap">
                                {formatCurrency(p.amount)}
                              </td>
                              <td className="py-3.5 pr-4 text-zinc-300 font-medium whitespace-nowrap">
                                {p.sender || <span className="text-zinc-500 italic">Unknown</span>}
                              </td>
                              <td className="py-3.5 pr-4 font-mono text-xs text-zinc-400 whitespace-nowrap">
                                {p.utrNumber || <span className="text-zinc-600">N/A</span>}
                              </td>
                              <td className="py-3.5 pr-4 text-zinc-400 text-xs whitespace-nowrap">
                                {formatDate(p.receivedAt)}
                              </td>
                              <td className="py-3.5 pr-4 text-zinc-400 text-xs max-w-xs">
                                <div className="flex items-center gap-2">
                                  <span className="truncate block font-mono text-zinc-400 max-w-[200px]">
                                    {p.rawMessage}
                                  </span>
                                  <button
                                    onClick={() => setViewSmsPayment(p)}
                                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors shrink-0"
                                    title="View full SMS"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-3.5 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleOpenCreditModal(p)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold transition-all shadow-sm active:scale-95"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Manually Credit Wallet
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* REGULAR MANUAL UPI PAYMENTS TAB (APPROVED, REJECTED, ALL) */
          /* ======================================================== */
          <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
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
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              p.status === 'PENDING'
                                ? 'text-yellow-400 bg-yellow-500/10'
                                : p.status === 'APPROVED'
                                ? 'text-green-400 bg-green-500/10'
                                : 'text-red-400 bg-red-500/10'
                            }`}
                          >
                            {p.status}
                          </span>
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
                                {processing === p.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                )}
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(p.id)}
                                disabled={processing === p.id}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
                              >
                                {processing === p.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
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
        )}
      </motion.div>

      {/* ======================================================== */}
      {/* MODAL: MANUALLY CREDIT UNMATCHED PAYMENT                */}
      {/* ======================================================== */}
      <AnimatePresence>
        {selectedPaymentForCredit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Credit Unmatched Payment</h3>
                    <p className="text-xs text-zinc-400">
                      Amount:{' '}
                      <span className="text-emerald-400 font-bold">
                        {formatCurrency(selectedPaymentForCredit.amount)}
                      </span>{' '}
                      • UTR: {selectedPaymentForCredit.utrNumber || 'N/A'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPaymentForCredit(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Payment Details summary */}
              <div className="bg-white/5 rounded-xl p-3 text-xs space-y-1 text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Sender / Bank:</span>
                  <span className="font-semibold text-white">{selectedPaymentForCredit.sender || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Received Date:</span>
                  <span>{formatDate(selectedPaymentForCredit.receivedAt)}</span>
                </div>
                <div className="pt-1 text-zinc-400 font-mono text-[11px] truncate">
                  SMS: &quot;{selectedPaymentForCredit.rawMessage}&quot;
                </div>
              </div>

              {/* User search & selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 block">
                  Select User to Credit Wallet
                </label>

                {selectedTargetUser ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />
                      <div>
                        <div className="text-xs font-bold">@{selectedTargetUser.username}</div>
                        <div className="text-[11px] text-zinc-400">{selectedTargetUser.email || selectedTargetUser.uid}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTargetUser(null)}
                      className="text-xs text-zinc-400 hover:text-white underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus-within:border-amber-500/50">
                      <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder="Search by username, email, or UID..."
                        className="bg-transparent text-white text-xs w-full outline-none placeholder:text-zinc-500"
                        autoFocus
                      />
                      {isSearchingUsers && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" />}
                    </div>

                    {/* Results dropdown */}
                    {userSearchResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto bg-zinc-950 border border-white/10 rounded-xl p-1 divide-y divide-white/5 shadow-2xl">
                        {userSearchResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setSelectedTargetUser(u);
                              setUserSearchResults([]);
                            }}
                            className="w-full text-left p-2.5 rounded-lg hover:bg-white/10 flex items-center justify-between text-xs transition-colors"
                          >
                            <div>
                              <div className="font-semibold text-white">@{u.username}</div>
                              <div className="text-[11px] text-zinc-400">{u.email || u.uid}</div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-zinc-300">Select</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {userSearchQuery.trim().length >= 2 && !isSearchingUsers && userSearchResults.length === 0 && (
                      <p className="text-[11px] text-zinc-500 mt-1.5 px-1">No users found for &quot;{userSearchQuery}&quot;</p>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Admin Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300 block">
                  Admin Resolution Notes <span className="text-zinc-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  placeholder="e.g. Matched via support ticket #45 / WhatsApp screenshot"
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentForCredit(null)}
                  disabled={creditProcessing}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCredit}
                  disabled={!selectedTargetUser || creditProcessing}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-bold text-xs transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {creditProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Crediting Wallet...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" /> Credit {formatCurrency(selectedPaymentForCredit.amount)}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* MODAL: VIEW FULL SMS MESSAGE                             */}
      {/* ======================================================== */}
      <AnimatePresence>
        {viewSmsPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-zinc-400" />
                  <h3 className="text-base font-bold text-white">Full Bank SMS Content</h3>
                </div>
                <button
                  onClick={() => setViewSmsPayment(null)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-black/50 border border-white/5 rounded-xl p-4 font-mono text-xs text-zinc-200 break-words leading-relaxed whitespace-pre-wrap">
                {viewSmsPayment.rawMessage}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Sender: <strong className="text-white">{viewSmsPayment.sender || 'Unknown'}</strong></span>
                <span>Amount: <strong className="text-emerald-400">{formatCurrency(viewSmsPayment.amount)}</strong></span>
              </div>

              <div className="pt-2 text-right">
                <button
                  onClick={() => setViewSmsPayment(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-medium"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* MODAL: PREVIEW CLAIM SCREENSHOT                          */}
      {/* ======================================================== */}
      <AnimatePresence>
        {previewScreenshotUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-teal-400" /> Payment Screenshot
                </h3>
                <button
                  onClick={() => setPreviewScreenshotUrl(null)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-center bg-black/60 rounded-xl overflow-hidden max-h-[70vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewScreenshotUrl}
                  alt="Payment Screenshot"
                  className="max-h-[70vh] w-auto object-contain rounded"
                />
              </div>
              <div className="mt-2 flex justify-between items-center text-xs">
                <a
                  href={previewScreenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:text-teal-300 underline"
                >
                  Open original in new tab
                </a>
                <button
                  onClick={() => setPreviewScreenshotUrl(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* MODAL: REJECT DEPOSIT CLAIM WITH REASON                 */}
      {/* ======================================================== */}
      <AnimatePresence>
        {rejectModalClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-md w-full bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" /> Reject Deposit Claim
                </h3>
                <button
                  onClick={() => {
                    setRejectModalClaim(null);
                    setRejectReasonInput('');
                  }}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-zinc-400">
                Explain why this claim for{' '}
                <strong className="text-white">
                  {formatCurrency(Number(rejectModalClaim.amount))}
                </strong>{' '}
                from @{rejectModalClaim.user?.username || 'user'} is being rejected. The user will see this explanation so they can correct it.
              </p>
              <textarea
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="e.g. UTR does not match our bank statement, or screenshot is illegible"
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-red-500/50 resize-none placeholder:text-zinc-500"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectModalClaim(null);
                    setRejectReasonInput('');
                  }}
                  disabled={rejectingClaim}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRejectClaim}
                  disabled={rejectingClaim || !rejectReasonInput.trim()}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {rejectingClaim ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
