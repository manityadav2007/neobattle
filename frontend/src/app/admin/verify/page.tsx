'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Loader2, RefreshCw, Gamepad2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { verificationApi, formatDate } from '@/lib/services';
import { getErrorMessage, isAuthenticated } from '@/lib/api';

interface LinkedPlayer {
  id: string;
  username: string;
  email: string;
  freeFireUid: string;
  freeFireRegion: string | null;
  inGameNickname: string | null;
  inGameLevel: number | null;
  isVerified: boolean;
  lastSyncedAt: string | null;
}

export default function AdminLinkedPlayersPage() {
  const router = useRouter();
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  const [players, setPlayers] = useState<LinkedPlayer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!loading && !user && !isAuthenticated()) router.push('/login');
    if (!loading && user && !isAdmin && !isSuperAdmin) router.push('/dashboard');
  }, [user, loading, isAdmin, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const res = await verificationApi.listLinked();
      setPlayers(res.data || []);
      setTotal(res.pagination?.total ?? (res.data?.length ?? 0));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAdmin || isSuperAdmin) loadData();
  }, [isAdmin, isSuperAdmin]);

  if (loading || (!isSuperAdmin && !isAdmin)) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/admin" className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-3 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Admin Panel
            </Link>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-fire-400" />
              Linked Players
            </h1>
            <p className="text-zinc-400 mt-1">
              Players who have linked their Free Fire account ({total} total) — read-only view
            </p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">{error}</div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          {loadingData ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : players.length === 0 ? (
            <div className="py-16 text-center">
              <Gamepad2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No players have linked their Free Fire account yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Player</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Free Fire UID</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">In-Game Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Level</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Region</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Last Synced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {players.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-white">{p.username}</p>
                        <p className="text-xs text-zinc-500">{p.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-fire-400">{p.freeFireUid}</span>
                      </td>
                      <td className="px-5 py-3.5 text-white max-w-[160px] truncate" title={p.inGameNickname || ''}>
                        {p.inGameNickname || <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-white">
                        {p.inGameLevel ?? <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-300">
                        {p.freeFireRegion || 'IND'}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-400 text-xs">
                        {p.lastSyncedAt ? formatDate(p.lastSyncedAt) : '—'}
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