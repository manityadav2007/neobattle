'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Crown, Medal, ShieldCheck, Loader2, Trophy, Target } from 'lucide-react';
import Link from 'next/link';
import { userApi, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import LeagueBadge from '@/components/LeagueBadge';

interface LeaderboardEntry {
  rank: number;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; isVerified: boolean } | null;
  totalPoints: number;
  totalKills: number;
  tournamentsPlayed: number;
  totalWins: number;
  league: string;
}

export default function LeaderboardsPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userApi
      .leaderboard()
      .then((res: any) => setEntries(res.data || []))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-zinc-300" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 text-sm text-zinc-500">{rank}</span>;
  };

  return (
    <div className="relative px-4 py-16 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fire-300">Competitive Ranking</p>
        <h1 className="mt-5 text-4xl font-display font-black text-white sm:text-6xl">
          <span className="gradient-text">Leaderboards</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
          Top 50 players ranked by total points across all tournaments.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/tournaments" className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white">
            Enter a Tournament <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/stats" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-fire-500/40 hover:text-white">
            View Stats
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
        ) : entries.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No rankings yet. Play tournaments to earn points!</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-4 font-medium">Rank</th>
                    <th className="text-left px-6 py-4 font-medium">Player</th>
                    <th className="text-left px-6 py-4 font-medium">League</th>
                    <th className="text-center px-6 py-4 font-medium">Points</th>
                    <th className="text-center px-6 py-4 font-medium">Kills</th>
                    <th className="text-center px-6 py-4 font-medium">Wins</th>
                    <th className="text-center px-6 py-4 font-medium">Matches</th>
                    <th className="text-center px-6 py-4 font-medium">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <motion.tr
                      key={entry.user?.id || i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">{rankIcon(entry.rank)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-fire-500/20 flex items-center justify-center text-fire-400 text-xs font-bold">
                            {entry.user?.displayName?.[0] || entry.user?.username?.[0] || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-white flex items-center gap-1.5">
                              {entry.user?.displayName || entry.user?.username || 'Unknown'}
                              {entry.user?.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-green-400" />}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <LeagueBadge wins={entry.totalWins} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-fire-400">{entry.totalPoints}</td>
                      <td className="px-6 py-4 text-center text-zinc-300">{entry.totalKills}</td>
                      <td className="px-6 py-4 text-center text-green-400 font-semibold">{entry.totalWins}</td>
                      <td className="px-6 py-4 text-center text-zinc-400">{entry.tournamentsPlayed}</td>
                      <td className="px-6 py-4 text-center text-zinc-300">
                        {entry.tournamentsPlayed > 0
                          ? `${Math.round((entry.totalWins / entry.tournamentsPlayed) * 100)}%`
                          : '0%'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
