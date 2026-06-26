'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Medal, ChevronDown, ChevronUp, Trophy, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { userApi, resolveAssetUrl } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import LeagueBadge from './LeagueBadge';
import Avatar from './Avatar';

interface LeaderboardEntry {
  rank: number;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; isVerified: boolean } | null;
  totalPoints: number;
  totalKills: number;
  tournamentsPlayed: number;
  totalWins: number;
  league: string;
}

export default function LeaderboardSnapshot() {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userApi
      .leaderboard()
      .then((res: any) => setEntries((res.data || []).slice(0, 5)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const top3 = entries.slice(0, 3);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-zinc-300" />;
    if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
    return null;
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="text-sm font-bold text-white">Leaderboard Top 3</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
      </button>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-fire-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="px-4 pb-4 text-xs text-red-400">{error}</div>
      ) : top3.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-zinc-500">No rankings yet.</div>
      ) : (
        <>
          {/* Top 3 always visible */}
          <div className="px-4 pb-3 space-y-2">
            {top3.map((entry, i) => (
              <div key={entry.rank} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-white/[0.03]">
                <div className="w-6 flex justify-center">{rankIcon(entry.rank)}</div>
                <Avatar src={resolveAssetUrl(entry.user?.avatarUrl)} alt={entry.user?.displayName || entry.user?.username || ''} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {entry.user?.displayName || entry.user?.username || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <LeagueBadge wins={entry.totalWins} size="sm" />
                  <span className="text-fire-400 font-bold">{entry.totalPoints} pts</span>
                </div>
              </div>
            ))}
          </div>

          {/* Expandable: next 2 and CTA */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-3">
                  {entries.slice(3).map((entry) => (
                    <div key={entry.rank} className="flex items-center gap-3 py-1.5 px-3">
                      <span className="w-6 text-center text-xs text-zinc-500">{entry.rank}</span>
                      <Avatar src={resolveAssetUrl(entry.user?.avatarUrl)} alt={entry.user?.displayName || entry.user?.username || ''} size={24} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-300 truncate">
                          {entry.user?.displayName || entry.user?.username || 'Unknown'}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-500">{entry.totalPoints} pts</span>
                    </div>
                  ))}
                  <Link
                    href="/leaderboards"
                    className="mt-2 flex items-center justify-center gap-1 py-2 text-xs font-medium text-fire-400 hover:text-fire-300 transition-colors"
                  >
                    View Full Leaderboard <ChevronDown className="w-3 h-3" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
