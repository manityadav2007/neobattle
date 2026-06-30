'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Activity, AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { adminApi, Transaction, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface TransactionsResponse {
  transactions: (Transaction & { user?: { id: string; uid: string; username: string; email: string } })[];
  total: number;
  page: number;
  totalPages: number;
}

const typeColors: Record<string, string> = {
  DEPOSIT: 'text-green-400 bg-green-500/10',
  WITHDRAWAL: 'text-red-400 bg-red-500/10',
  ENTRY_FEE: 'text-blue-400 bg-blue-500/10',
  PRIZE: 'text-yellow-400 bg-yellow-500/10',
  REFUND: 'text-purple-400 bg-purple-500/10',
};

const statusColors: Record<string, string> = {
  COMPLETED: 'text-green-400 bg-green-500/10',
  PENDING: 'text-yellow-400 bg-yellow-500/10',
  FAILED: 'text-red-400 bg-red-500/10',
  CANCELLED: 'text-zinc-400 bg-zinc-500/10',
};

export default function AdminTransactionsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) router.push(user ? '/dashboard' : '/login');
  }, [user, loading, isSuperAdmin, router]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const res = await adminApi.transactions(page);
        setData(res.data);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [isSuperAdmin, page]);

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Admin Panel
      </Link>
      <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3 mb-8">
        <Activity className="w-8 h-8 text-purple-400" />
        All Transactions
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
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-white/5">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Description</th>
                  <th className="text-left py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-zinc-300 font-mono text-xs">{tx.id.slice(0, 8)}...</td>
                    <td className="py-3 px-4 text-zinc-300">{tx.user?.username || tx.user?.uid || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColors[tx.type] || 'text-zinc-400 bg-zinc-500/10'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[tx.status] || 'text-zinc-400 bg-zinc-500/10'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-white">{formatCurrency(tx.amount)}</td>
                    <td className="py-3 px-4 text-zinc-400 max-w-[200px] truncate">{tx.description || '-'}</td>
                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">{new Date(tx.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {data.transactions.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-zinc-500">No transactions found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm text-zinc-300"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-sm text-zinc-400">Page {data.page} of {data.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm text-zinc-300"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
