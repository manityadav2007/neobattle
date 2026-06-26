'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Trophy, AlertCircle, RefreshCw, Loader2, Users, DollarSign, MapPin, Clock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { tournamentApi, formatCurrency, formatDate, getStatusColor, type Tournament } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminTournamentsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, authLoading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await tournamentApi.list({ page: 1 });
      setTournaments(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  if (authLoading) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Admin Panel
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Trophy className="w-8 h-8 text-fire-400" />
              All Tournaments
            </h1>
            <p className="text-zinc-400 mt-1">View all tournaments on the platform</p>
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

        {loading ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : tournaments.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No tournaments found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t, i) => {
              const entryFee = typeof t.entryFee === 'string' ? parseFloat(t.entryFee) : t.entryFee;
              const prizePool = typeof t.prizePool === 'string' ? parseFloat(t.prizePool) : t.prizePool;
              const entryCount = t._count?.entries ?? 0;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card rounded-2xl overflow-hidden group"
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-fire-400 transition-colors">{t.title}</h3>
                        <p className="text-xs text-zinc-500 mt-1">by {t.creator?.username || 'System'}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(t.status)}`}>{t.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="flex items-center gap-1 text-zinc-400"><DollarSign className="w-3 h-3 text-green-400" /> {formatCurrency(prizePool)}</span>
                      <span className="flex items-center gap-1 text-zinc-400"><Users className="w-3 h-3 text-blue-400" /> {entryCount}/{t.maxParticipants}</span>
                      <span className="flex items-center gap-1 text-zinc-400"><MapPin className="w-3 h-3 text-fire-400" /> {t.mapName || 'TBA'}</span>
                      <span className="flex items-center gap-1 text-zinc-400"><Clock className="w-3 h-3 text-yellow-400" /> {formatDate(t.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500">Fee:</span>
                      <span className="text-fire-400 font-semibold">{entryFee === 0 ? 'FREE' : formatCurrency(entryFee)}</span>
                      <span className="text-zinc-500 ml-2">Format:</span>
                      <span className="text-purple-400 font-semibold">{t.format}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
