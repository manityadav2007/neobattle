'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Ban, AlertCircle, CheckCircle,
  RefreshCw, Loader2, Trash2, Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { esportsApi, type EsportsBan, formatDate } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminEsportsBansPage() {
  const router = useRouter();
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const [bans, setBans] = useState<EsportsBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const [newUid, setNewUid] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, authLoading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await esportsApi.bans();
      setBans(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleAddBan = async () => {
    if (!newUid.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await esportsApi.addBan({ uid: newUid.trim(), reason: newReason.trim() || undefined });
      setActionMsg(res.message || 'UID banned');
      setNewUid('');
      setNewReason('');
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveBan = async (id: string) => {
    try {
      const res = await esportsApi.removeBan(id);
      setActionMsg(res.message || 'Ban removed');
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (authLoading) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Admin Panel
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Ban className="w-8 h-8 text-red-400" />
              Tournament Ban List
            </h1>
            <p className="text-zinc-400 mt-1">Ban UIDs from esports tournaments. Banned UIDs auto-disqualify registered teams.</p>
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

        <div className="glass-card rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-red-400" />
            Add Ban
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
              placeholder="Free Fire UID to ban..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-red-500/50 focus:outline-none"
            />
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Reason (optional)..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-red-500/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddBan}
              disabled={adding || !newUid.trim()}
              className="px-6 py-2.5 rounded-lg bg-red-500/20 text-red-400 font-semibold text-sm hover:bg-red-500/30 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Ban UID
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            {bans.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-4 font-medium">UID</th>
                    <th className="text-left px-6 py-4 font-medium">Reason</th>
                    <th className="text-left px-6 py-4 font-medium">Banned By</th>
                    <th className="text-left px-6 py-4 font-medium">Date</th>
                    <th className="text-right px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bans.map((ban) => (
                    <tr key={ban.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-6 py-4 text-white font-mono font-medium">{ban.uid}</td>
                      <td className="px-6 py-4 text-zinc-400">{ban.reason || '—'}</td>
                      <td className="px-6 py-4 text-zinc-300">{ban.bannedBy.username}</td>
                      <td className="px-6 py-4 text-xs text-zinc-500">{formatDate(ban.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveBan(ban.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-10 text-center text-zinc-500">No banned UIDs.</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
