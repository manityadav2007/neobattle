'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Users, Trophy, AlertCircle, CheckCircle, XCircle,
  Activity, RefreshCw, DollarSign, Banknote, Gift, Ban, ShoppingBag,
  MessageSquareMore, Eye,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminApi, winnerProofApi, WinnerProof, DepositRequest, RedeemRequest, AdminStats, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface VerificationRequest {
  id: string;
  freeFireId: string;
  screenshotUrl: string;
  status: string;
  user: { id: string; username: string; email: string };
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<WinnerProof[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [redeems, setRedeems] = useState<RedeemRequest[]>([]);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && !isSuperAdmin) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    try {
      const calls: any[] = [
        adminApi.stats(),
        adminApi.pendingVerifications(),
      ];
      if (isSuperAdmin) {
        calls.push(winnerProofApi.pending(), adminApi.pendingDeposits(), adminApi.pendingRedeems());
      }
      const [statsRes, verRes, ...rest] = await Promise.all(calls);
      setStats(statsRes.data);
      setVerifications(verRes.data || []);
      if (isSuperAdmin) {
        setPendingPayouts(rest[0]?.data || []);
        setDeposits(rest[1]?.data || []);
        setRedeems(rest[2]?.data || []);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await adminApi.reviewVerification(id, status, status === 'REJECTED' ? 'Screenshot does not match profile' : undefined);
      setActionMsg(`Verification ${status.toLowerCase()}`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handlePayoutReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await winnerProofApi.review(id, status, status === 'REJECTED' ? 'Proof does not match' : undefined);
      setActionMsg(`Payout ${status.toLowerCase()}`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDepositReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await adminApi.reviewDeposit(id, status, status === 'REJECTED' ? 'Screenshot invalid' : undefined);
      setActionMsg(`Deposit ${status.toLowerCase()}`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleRedeemReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await adminApi.reviewRedeem(id, status, status === 'REJECTED' ? 'Request denied' : undefined);
      setActionMsg(`Redeem ${status.toLowerCase()}`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-fire-400" />
              Admin Panel
            </h1>
            <p className="text-zinc-400 mt-1">Platform management & revenue dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/esports" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors">
              <Trophy className="w-4 h-4" /> Esports Config
            </Link>
            <Link href="/admin/esports-bans" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors">
              <Ban className="w-4 h-4" /> Ban List
            </Link>
            <Link href="/admin/users" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/20 text-fire-400 text-sm font-medium hover:bg-fire-500/30 transition-colors">
              <Users className="w-4 h-4" /> User Management
            </Link>
            <Link href="/admin/store" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors">
              <ShoppingBag className="w-4 h-4" /> Store Manager
            </Link>
            <Link href="/admin/support" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/30 transition-colors">
              <MessageSquareMore className="w-4 h-4" /> Support
            </Link>
            <Link href="/admin/gift-cards" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-500/20 text-pink-400 text-sm font-medium hover:bg-pink-500/30 transition-colors">
              <Gift className="w-4 h-4" /> Gift Cards
            </Link>
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

        {stats && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
              {[
                { icon: Users, label: 'Total Users', value: stats.totalUsers, color: 'text-blue-400', href: '/admin/users' },
                { icon: Shield, label: 'Total Hosts', value: stats.totalHosts, color: 'text-green-400', href: '/admin/users?role=HOST' },
                { icon: Trophy, label: 'Tournaments', value: stats.totalTournaments, color: 'text-fire-400', href: '/admin/tournaments' },
                { icon: Activity, label: 'Active Tournaments', value: stats.activeTournaments, color: 'text-green-400', href: '/admin/tournaments?status=ACTIVE' },
                { icon: AlertCircle, label: 'Pending ID Verifications', value: stats.pendingVerifications, color: 'text-yellow-400', href: '/admin/verify' },
                { icon: Activity, label: 'Transactions', value: stats.totalTransactions, color: 'text-purple-400', href: '/admin/transactions' },
              ].map((s) => (
                <Link key={s.label} href={s.href} className="glass-card rounded-xl p-5 block hover:bg-white/[0.04] transition-colors">
                  <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-zinc-500">{s.label}</p>
                </Link>
              ))}
            </div>

            {isSuperAdmin && (
              <div className="grid sm:grid-cols-3 gap-4 mb-10">
                <Link href="/admin/revenue" className="glass-card rounded-xl p-5 border border-yellow-500/20 block hover:bg-white/[0.04] transition-colors">
                  <DollarSign className="w-5 h-5 text-yellow-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{formatCurrency(stats.totalCommissionCollected)}</p>
                  <p className="text-xs text-zinc-500">Total Commission Collected</p>
                </Link>
                <Link href="/admin/deposits" className="glass-card rounded-xl p-5 border border-fire-500/20 block hover:bg-white/[0.04] transition-colors">
                  <Banknote className="w-5 h-5 text-fire-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{stats.pendingDeposits}</p>
                  <p className="text-xs text-zinc-500">Pending Deposits</p>
                </Link>
                <Link href="/admin/redeems" className="glass-card rounded-xl p-5 border border-green-500/20 block hover:bg-white/[0.04] transition-colors">
                  <Gift className="w-5 h-5 text-green-400 mb-2" />
                  <p className="text-2xl font-bold text-white">{stats.pendingRedeems}</p>
                  <p className="text-xs text-zinc-500">Pending Redeems</p>
                </Link>
              </div>
            )}
          </>
        )}

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Pending Verifications</h2>
            {verifications.length > 0 ? (
              <div className="space-y-4">
                {verifications.map((v) => (
                  <div key={v.id} className="p-4 rounded-xl bg-white/3 border border-white/5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium text-white">{v.user.username}</p>
                        <p className="text-xs text-zinc-500">{v.user.email}</p>
                        <p className="text-sm text-fire-400 font-mono mt-1">ID: {v.freeFireId}</p>
                        {v.screenshotUrl && (
                          <a href={v.screenshotUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-fire-400 hover:text-fire-300 mt-1">
                            <Eye className="w-3 h-3" /> View Screenshot
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleReview(v.id, 'APPROVED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => handleReview(v.id, 'REJECTED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">No pending verifications</p>
            )}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Recent Users</h2>
            {stats?.recentUsers && stats.recentUsers.length > 0 ? (
              <div className="space-y-3">
                {stats.recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-white/5">
                    <div>
                      <p className="text-sm font-medium text-white">{u.username}</p>
                      <p className="text-xs text-zinc-500">{u.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'ADMIN' || u.role === 'SUPER_ADMIN' ? 'text-fire-400 bg-fire-400/10' : 'text-zinc-400 bg-zinc-400/10'}`}>
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">No users yet</p>
            )}
          </div>
        </div>

        {isSuperAdmin && (
          <>
            {pendingPayouts.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-yellow-400" />
                  Pending Payouts ({pendingPayouts.length})
                </h2>
                <div className="space-y-4">
                  {pendingPayouts.map((p) => (
                    <div key={p.id} className="p-4 rounded-xl bg-white/3 border border-yellow-500/20">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-medium text-white">{p.winnerIgn}</p>
                          <p className="text-xs text-zinc-500">UID: {p.winnerUid}</p>
                          <p className="text-sm text-fire-400 mt-1">Tournament payout pending</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handlePayoutReview(p.id, 'APPROVED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve Payout
                        </button>
                        <button onClick={() => handlePayoutReview(p.id, 'REJECTED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deposits.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-green-400" />
                  Pending Deposit Approvals ({deposits.length})
                </h2>
                <div className="space-y-4">
                  {deposits.map((d) => (
                    <div key={d.id} className="p-4 rounded-xl bg-white/3 border border-green-500/20">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-medium text-white">{d.user?.username || 'Unknown'}</p>
                          <p className="text-sm text-green-400 font-semibold">{formatCurrency(d.amount)}</p>
                          <p className="text-xs text-zinc-500">Screenshot: <a href={d.screenshotUrl} target="_blank" rel="noreferrer" className="text-fire-400 hover:underline">View</a></p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleDepositReview(d.id, 'APPROVED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => handleDepositReview(d.id, 'REJECTED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {redeems.length > 0 && (
              <div className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-purple-400" />
                  Pending Redeem Requests ({redeems.length})
                </h2>
                <div className="space-y-4">
                  {redeems.map((r) => (
                    <div key={r.id} className="p-4 rounded-xl bg-white/3 border border-purple-500/20">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-medium text-white">{r.user?.username || 'Unknown'}</p>
                          <p className="text-sm text-purple-400 font-semibold">{formatCurrency(r.amount)} — {r.type}</p>
                          {r.accountDetails && <p className="text-xs text-zinc-500 mt-1">{r.accountDetails}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleRedeemReview(r.id, 'APPROVED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => handleRedeemReview(r.id, 'REJECTED')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">
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
      </motion.div>
    </div>
  );
}
