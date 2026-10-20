'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Shield, Users, Trophy, AlertCircle, CheckCircle, XCircle,
  Activity, RefreshCw, DollarSign, Banknote, Gift, Ban, ShoppingBag,
  MessageSquareMore, Wallet, Loader2, Crosshair, Sparkles, ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  adminApi,
  winnerProofApi,
  WinnerProof,
  DepositRequest,
  RedeemRequest,
  AdminStats,
  formatCurrency,
} from '@/lib/services';
import { getErrorMessage, isAuthenticated } from '@/lib/api';

interface RecentUserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt?: string;
  freeFireId?: string;
  ign?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  const [recentUsers, setRecentUsers] = useState<RecentUserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersRateLimited, setUsersRateLimited] = useState(false);
  const [usersRetrySeconds, setUsersRetrySeconds] = useState(0);

  const [pendingPayouts, setPendingPayouts] = useState<WinnerProof[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [redeems, setRedeems] = useState<RedeemRequest[]>([]);
  const [queueErrors, setQueueErrors] = useState<{ payouts?: string; deposits?: string; redeems?: string }>({});

  const [queuesLoading, setQueuesLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');

  const usersRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const usersCountdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading && !user && !isAuthenticated()) {
      router.push('/login');
      return;
    }
    if (!loading && user && !isAdmin && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, isAdmin, isSuperAdmin, router]);

  const loadData = useCallback(async () => {
    setActionError('');
    if (usersRetryTimerRef.current) clearTimeout(usersRetryTimerRef.current);
    if (usersCountdownTimerRef.current) clearInterval(usersCountdownTimerRef.current);

    // 1. Fetch dashboard stats independently
    setStatsLoading(true);
    setStatsError('');
    try {
      const statsRes = await adminApi.stats();
      if (statsRes?.data) {
        setStats(statsRes.data);
        if (Array.isArray(statsRes.data.recentUsers) && statsRes.data.recentUsers.length > 0) {
          setRecentUsers(statsRes.data.recentUsers);
          setUsersError('');
          setUsersRateLimited(false);
        }
      }
    } catch (err: any) {
      console.warn('Dashboard stats load error:', err);
      setStatsError(getErrorMessage(err));
    } finally {
      setStatsLoading(false);
    }

    // 2. Fetch users list (as fallback or primary list for recent users)
    setUsersLoading(true);
    setUsersError('');
    setUsersRateLimited(false);
    try {
      const usersRes = await adminApi.users();
      if (Array.isArray(usersRes?.data) && usersRes.data.length > 0) {
        setRecentUsers((prev) => (prev.length > 0 ? prev : usersRes.data.slice(0, 10)));
        setUsersError('');
        setUsersRateLimited(false);
      }
    } catch (err: any) {
      console.warn('Users fallback load error:', err);
      const is429 = axios.isAxiosError(err) && err.response?.status === 429;
      if (is429) {
        setUsersRateLimited(true);
        const retryDelay = 5;
        setUsersRetrySeconds(retryDelay);
        setUsersError('Too many requests. Retrying automatically...');

        usersCountdownTimerRef.current = setInterval(() => {
          setUsersRetrySeconds((prev) => {
            if (prev <= 1) {
              if (usersCountdownTimerRef.current) clearInterval(usersCountdownTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        usersRetryTimerRef.current = setTimeout(() => {
          loadData();
        }, retryDelay * 1000);
      } else {
        setUsersError(getErrorMessage(err) || 'Failed to load users');
      }
    } finally {
      setUsersLoading(false);
    }

    // 3. Fetch Super Admin pending queues with Promise.allSettled (fully resilient)
    if (isSuperAdmin) {
      setQueuesLoading(true);
      const newQueueErrors: { payouts?: string; deposits?: string; redeems?: string } = {};

      const results = await Promise.allSettled([
        winnerProofApi.pending(),
        adminApi.pendingDeposits(),
        adminApi.pendingRedeems(),
      ]);

      // Pending Payouts
      if (results[0].status === 'fulfilled' && results[0].value?.data) {
        setPendingPayouts(Array.isArray(results[0].value.data) ? results[0].value.data : []);
      } else if (results[0].status === 'rejected') {
        console.warn('Pending payouts call failed:', results[0].reason);
        newQueueErrors.payouts = getErrorMessage(results[0].reason);
      }

      // Pending Deposits
      if (results[1].status === 'fulfilled' && results[1].value?.data) {
        setDeposits(Array.isArray(results[1].value.data) ? results[1].value.data : []);
      } else if (results[1].status === 'rejected') {
        console.warn('Pending deposits call failed:', results[1].reason);
        newQueueErrors.deposits = getErrorMessage(results[1].reason);
      }

      // Pending Redeems
      if (results[2].status === 'fulfilled' && results[2].value?.data) {
        setRedeems(Array.isArray(results[2].value.data) ? results[2].value.data : []);
      } else if (results[2].status === 'rejected') {
        console.warn('Pending redeems call failed:', results[2].reason);
        newQueueErrors.redeems = getErrorMessage(results[2].reason);
      }

      setQueueErrors(newQueueErrors);
      setQueuesLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    return () => {
      if (usersRetryTimerRef.current) clearTimeout(usersRetryTimerRef.current);
      if (usersCountdownTimerRef.current) clearInterval(usersCountdownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isAdmin || isSuperAdmin) loadData();
  }, [isAdmin, isSuperAdmin, loadData]);

  const handlePayoutReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      setActionError('');
      await winnerProofApi.review(id, status, status === 'REJECTED' ? 'Proof does not match' : undefined);
      setActionMsg(`Payout ${status.toLowerCase()}`);
      setPendingPayouts((prev) => prev.filter((p) => p.id !== id));
      loadData();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const handleDepositReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      setActionError('');
      await adminApi.reviewDeposit(id, status, status === 'REJECTED' ? 'Screenshot invalid' : undefined);
      setActionMsg(`Deposit ${status.toLowerCase()}`);
      setDeposits((prev) => prev.filter((d) => d.id !== id));
      loadData();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const handleRedeemReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      setActionError('');
      await adminApi.reviewRedeem(id, status, status === 'REJECTED' ? { rejectionReason: 'Request denied' } : undefined);
      setActionMsg(`Redeem ${status.toLowerCase()}`);
      setRedeems((prev) => prev.filter((r) => r.id !== id));
      loadData();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  if (loading || (!isSuperAdmin && !isAdmin)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire-400" />
      </div>
    );
  }

  // Categorized administration sections
  const sectionCategories = [
    {
      title: 'Money & Balances',
      items: [
        { href: '/admin/payments', label: 'UPI Payments & Deposits', desc: 'Auto SMS, QR & claims review', icon: DollarSign, tone: 'bg-emerald-500/15 text-emerald-400' },
        { href: '/admin/withdrawals', label: 'Withdrawals & Payouts', desc: 'UPI & bank payout requests', icon: Banknote, tone: 'bg-sky-500/15 text-sky-400' },
        { href: '/admin/revenue', label: 'Platform Revenue', desc: 'Commission & match revenue', icon: DollarSign, tone: 'bg-yellow-500/15 text-yellow-400' },
        { href: '/admin/transactions', label: 'Transactions', desc: 'Master ledger & audit history', icon: Activity, tone: 'bg-cyan-500/15 text-cyan-400' },
        { href: '/admin/wallet-adjust', label: 'Wallet Adjust', desc: 'Manual balance adjustments', icon: Wallet, tone: 'bg-indigo-500/15 text-indigo-400' },
      ],
    },
    {
      title: 'Tournaments & Competition',
      items: [
        { href: '/admin/tournaments', label: 'Tournaments', desc: 'Create, schedule & manage', icon: Trophy, tone: 'bg-amber-500/15 text-amber-400' },
        { href: '/admin/pending-results', label: 'Pending Results', desc: 'Review winner match proofs', icon: Trophy, tone: 'bg-orange-500/15 text-orange-400' },
        { href: '/admin/esports', label: 'Esports Config', desc: 'Seasons & prize distribution', icon: Trophy, tone: 'bg-yellow-500/15 text-yellow-400' },
        { href: '/admin/kill-counter', label: 'AI Kill Counter', desc: 'Scan match video for kills', icon: Crosshair, tone: 'bg-rose-500/15 text-rose-400' },
        { href: '/admin/test-ai-counter', label: 'Test AI Counter', desc: 'Feed tester & CV playground', icon: Sparkles, tone: 'bg-violet-500/15 text-violet-400' },
      ],
    },
    {
      title: 'Users & Safety',
      items: [
        { href: '/admin/users', label: 'User Management', desc: 'Roles, levels & bans', icon: Users, tone: 'bg-fire-500/15 text-fire-400' },
        { href: '/admin/verify', label: 'Player Verification', desc: 'Free Fire UID & level checks', icon: Shield, tone: 'bg-lime-500/15 text-lime-400' },
        { href: '/admin/esports-bans', label: 'Ban List', desc: 'Banned accounts & anti-cheat', icon: Ban, tone: 'bg-red-500/15 text-red-400' },
        { href: '/admin/support', label: 'Support Tickets', desc: 'Player queries & reports', icon: MessageSquareMore, tone: 'bg-blue-500/15 text-blue-400' },
      ],
    },
    {
      title: 'Store & Rewards',
      items: [
        { href: '/admin/store?tab=catalog', label: 'Store & Gift Cards', desc: 'Gift cards, pricing & stock', icon: ShoppingBag, tone: 'bg-green-500/15 text-green-400' },
        { href: '/admin/store?tab=orders', label: 'Orders & Redemptions', desc: 'Deliver codes & refunds', icon: Gift, tone: 'bg-purple-500/15 text-purple-400' },
      ],
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
                <Shield className="w-8 h-8 text-fire-400" />
                Admin Panel
              </h1>
              <p className="text-zinc-400 mt-1">Platform management &amp; revenue dashboard</p>
            </div>
            <button
              onClick={loadData}
              disabled={statsLoading || queuesLoading}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300 shrink-0 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${statsLoading || queuesLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Grouped Admin Quick Links */}
          <div className="space-y-6">
            {sectionCategories.map((cat) => (
              <div key={cat.title}>
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5 px-0.5">
                  {cat.title}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {cat.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="glass-card rounded-xl p-4 flex flex-col items-start gap-2.5 transition-all hover:border-fire-500/30 hover:bg-white/[0.05] group"
                    >
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
                        <item.icon className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="block text-xs font-semibold text-white leading-tight group-hover:text-fire-400 transition-colors">
                          {item.label}
                        </span>
                        <span className="block text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{item.desc}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Global Action Alerts */}
        {actionError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" /> {actionError}
          </div>
        )}
        {actionMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4 shrink-0" /> {actionMsg}
          </div>
        )}
        {statsError && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 text-amber-300 text-xs mb-6">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> Failed to refresh stats: {statsError}
            </span>
            <button onClick={loadData} className="underline hover:text-white">Retry</button>
          </div>
        )}

        {/* Platform Stat Cards */}
        {stats ? (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
              {[
                { icon: Users, label: 'Total Users', value: stats.totalUsers ?? 0, color: 'text-blue-400', href: '/admin/users' },
                { icon: Shield, label: 'Total Hosts', value: stats.totalHosts ?? 0, color: 'text-green-400', href: '/admin/users?role=HOST' },
                { icon: Trophy, label: 'Tournaments', value: stats.totalTournaments ?? 0, color: 'text-fire-400', href: '/admin/tournaments' },
                { icon: Activity, label: 'Active Tournaments', value: stats.activeTournaments ?? 0, color: 'text-emerald-400', href: '/admin/tournaments?status=ACTIVE' },
                { icon: Shield, label: 'Linked Players', value: stats.linkedPlayers ?? stats.pendingVerifications ?? 0, color: 'text-lime-400', href: '/admin/verify' },
                { icon: Activity, label: 'Transactions', value: stats.totalTransactions ?? 0, color: 'text-purple-400', href: '/admin/transactions' },
              ].map((s) => (
                <Link key={s.label} href={s.href} className="glass-card rounded-xl p-5 block hover:bg-white/[0.04] transition-colors group">
                  <s.icon className={`w-5 h-5 ${s.color} mb-2 group-hover:scale-110 transition-transform`} />
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
                </Link>
              ))}
            </div>

            {/* Super Admin Financial Cards */}
            {isSuperAdmin && (
              <div className="grid sm:grid-cols-3 gap-4 mb-10">
                <Link href="/admin/revenue" className="glass-card rounded-xl p-5 border border-yellow-500/20 block hover:bg-white/[0.04] transition-colors group">
                  <DollarSign className="w-5 h-5 text-yellow-400 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-2xl font-bold text-white">{formatCurrency(stats.totalCommissionCollected ?? 0)}</p>
                  <p className="text-xs text-zinc-500 mt-1">Total Commission Collected</p>
                </Link>
                <Link href="/admin/payments" className="glass-card rounded-xl p-5 border border-fire-500/20 block hover:bg-white/[0.04] transition-colors group">
                  <DollarSign className="w-5 h-5 text-fire-400 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-2xl font-bold text-white">{stats.pendingDeposits ?? 0}</p>
                  <p className="text-xs text-zinc-500 mt-1">Pending Deposits (UPI / Claims)</p>
                </Link>
                <Link href="/admin/withdrawals" className="glass-card rounded-xl p-5 border border-green-500/20 block hover:bg-white/[0.04] transition-colors group">
                  <Banknote className="w-5 h-5 text-green-400 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-2xl font-bold text-white">{stats.pendingRedeems ?? 0}</p>
                  <p className="text-xs text-zinc-500 mt-1">Pending Withdrawals &amp; Payouts</p>
                </Link>
              </div>
            )}
          </>
        ) : statsLoading ? (
          <div className="glass-card rounded-xl p-8 mb-6 flex items-center justify-center gap-3 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin text-fire-400" />
            <span>Loading platform statistics...</span>
          </div>
        ) : null}

        {/* Super Admin Action Queues */}
        {isSuperAdmin && (
          <>
            {/* Pending Payouts Queue */}
            {pendingPayouts.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-yellow-400" />
                    Pending Winner Payouts ({pendingPayouts.length})
                  </h2>
                  <Link href="/admin/pending-results" className="text-xs text-fire-400 hover:text-fire-300 flex items-center gap-1">
                    Manage all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {pendingPayouts.map((p) => (
                    <div key={p.id} className="p-4 rounded-xl bg-white/3 border border-yellow-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{p.winnerIgn}</p>
                        <p className="text-xs text-zinc-500">Free Fire UID: <span className="font-mono text-zinc-300">{p.winnerUid}</span></p>
                        <p className="text-xs text-yellow-400/80 mt-1">Tournament payout awaiting review</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handlePayoutReview(p.id, 'APPROVED')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approve Payout
                        </button>
                        <button
                          onClick={() => handlePayoutReview(p.id, 'REJECTED')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Deposits Queue */}
            {deposits.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-emerald-400" />
                    Pending Deposit Approvals ({deposits.length})
                  </h2>
                  <Link href="/admin/payments" className="text-xs text-fire-400 hover:text-fire-300 flex items-center gap-1">
                    Manage all in Payments <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {deposits.map((d) => (
                    <div key={d.id} className="p-4 rounded-xl bg-white/3 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{d.user?.username || 'Unknown User'}</p>
                        <p className="text-sm text-emerald-400 font-bold">{formatCurrency(d.amount)}</p>
                        {d.screenshotUrl && (
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Screenshot: <a href={d.screenshotUrl} target="_blank" rel="noreferrer" className="text-fire-400 hover:underline">View Proof</a>
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleDepositReview(d.id, 'APPROVED')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleDepositReview(d.id, 'REJECTED')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Redeem Requests Queue */}
            {redeems.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-purple-400" />
                    Pending Withdrawals &amp; Redemptions ({redeems.length})
                  </h2>
                  <Link href="/admin/withdrawals" className="text-xs text-fire-400 hover:text-fire-300 flex items-center gap-1">
                    Manage all in Withdrawals <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {redeems.map((r) => (
                    <div key={r.id} className="p-4 rounded-xl bg-white/3 border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{r.user?.username || 'Unknown User'}</p>
                        <p className="text-sm text-purple-400 font-bold">{formatCurrency(r.amount)} — {r.type}</p>
                        {r.accountDetails && <p className="text-xs text-zinc-400 font-mono mt-0.5">{r.accountDetails}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleRedeemReview(r.id, 'APPROVED')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleRedeemReview(r.id, 'REJECTED')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Recent Users List */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Recent Users</h2>
              <p className="text-xs text-zinc-400">Newly registered players and platform members</p>
            </div>
            <Link
              href="/admin/users"
              className="text-xs font-semibold text-fire-400 hover:text-fire-300 flex items-center gap-1 transition-colors"
            >
              View all in User Management <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentUsers.length > 0 ? (
            <div className="divide-y divide-white/5">
              {recentUsers.map((u) => {
                const role = u.role?.toUpperCase() || 'USER';
                const roleBadgeClass =
                  role === 'SUPER_ADMIN'
                    ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                    : role === 'ADMIN'
                    ? 'text-fire-400 bg-fire-400/10 border-fire-400/20'
                    : role === 'HOST'
                    ? 'text-green-400 bg-green-400/10 border-green-400/20'
                    : 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';

                return (
                  <div key={u.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                        {u.username?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{u.username}</p>
                        <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {u.createdAt && (
                        <span className="text-[11px] text-zinc-500 hidden sm:inline">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${roleBadgeClass}`}>
                        {role}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : usersLoading || statsLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fire-400" />
              <span>Loading users...</span>
            </div>
          ) : usersRateLimited || usersError ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-amber-400 text-sm font-medium">
                {usersRateLimited ? `Server busy (rate limit). Retrying in ${usersRetrySeconds}s...` : usersError}
              </p>
              <button
                type="button"
                onClick={() => loadData()}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Now
              </button>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No users yet</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
