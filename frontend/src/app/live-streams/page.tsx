'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Radio, Camera, Users, Loader2, Trophy, Eye } from 'lucide-react';
import Link from 'next/link';
import { tournamentApi, formatDate } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface Tournament {
  id: string;
  title: string;
  status: string;
  format: string;
  startTime: string;
  mapName: string | null;
  _count?: { entries: number };
  maxParticipants: number;
}

export default function LiveStreamsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tournamentApi
      .list({ status: 'ACTIVE' })
      .then((res: any) => setTournaments(res.data || []))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative px-4 py-16 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fire-300">Broadcast Hub</p>
        <h1 className="mt-5 text-4xl font-display font-black text-white sm:text-6xl">
          <span className="gradient-text">Live Streams</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
          Active tournaments happening right now. Watch the action unfold.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/tournaments" className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white">
            View Active Tournaments <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/stats" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-fire-500/40 hover:text-white">
            Explore Match Stats
          </Link>
        </div>
      </motion.div>

      <div className="mt-14">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[
              { icon: Radio, title: 'Featured Broadcasts', desc: 'No live broadcasts right now. Check back when tournaments go active.' },
              { icon: Camera, title: 'Creator Ready', desc: 'Give streamers a clear, branded home for schedules, spotlight clips, and event promos.' },
              { icon: Users, title: 'Audience Momentum', desc: 'Make it easy for players and fans to discover where the action is happening right now.' },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="glass-card rounded-3xl p-6">
                  <div className="mb-4 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{card.desc}</p>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {tournaments.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass-card rounded-3xl p-6 hover:fire-glow transition-shadow"
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-400">LIVE</span>
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">{t.title}</h2>
                <div className="space-y-2 text-sm text-zinc-400">
                  <p className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-fire-400" />
                    {t.format} — {t.mapName || 'TBD'}
                  </p>
                  <p className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    {t._count?.entries || 0}/{t.maxParticipants} players
                  </p>
                  <p className="text-xs text-zinc-500">Started {formatDate(t.startTime)}</p>
                </div>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fire-400 hover:text-fire-300 transition-colors"
                >
                  Watch Now <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
