'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown, Award, Banknote, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { adminApi, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface RevenueData {
  totalDeposits: number;
  totalWithdrawals: number;
  totalPrizePayouts: number;
  totalPlatformCommission: number;
}

export default function AdminRevenuePage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [data, setData] = useState<RevenueData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) router.push(user ? '/dashboard' : '/login');
  }, [user, loading, isSuperAdmin, router]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const res = await adminApi.revenue();
        setData(res.data);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [isSuperAdmin]);

  if (loading || !isSuperAdmin) return null;

  const cards = data ? [
    { icon: DollarSign, label: 'Total Deposits', value: data.totalDeposits, color: 'text-green-400', bg: 'bg-green-500/10' },
    { icon: TrendingUp, label: 'Total Withdrawals', value: data.totalWithdrawals, color: 'text-red-400', bg: 'bg-red-500/10' },
    { icon: Award, label: 'Prize Payouts', value: data.totalPrizePayouts, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { icon: Banknote, label: 'Platform Commission', value: data.totalPlatformCommission, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Admin Panel
      </Link>
      <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3 mb-8">
        <DollarSign className="w-8 h-8 text-yellow-400" />
        Revenue Overview
      </h1>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {!data && !error && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
        </div>
      )}

      {data && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((c) => (
            <div key={c.label} className={`${c.bg} rounded-xl p-6 border border-white/5`}>
              <c.icon className={`w-6 h-6 ${c.color} mb-3`} />
              <p className="text-3xl font-bold text-white">{formatCurrency(c.value)}</p>
              <p className="text-sm text-zinc-400 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
