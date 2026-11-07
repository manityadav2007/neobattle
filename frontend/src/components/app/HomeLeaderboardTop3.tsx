'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Crown, Medal, Trophy } from 'lucide-react';
import Avatar from '@/components/Avatar';
import LeagueBadge from '@/components/LeagueBadge';
import { userApi, resolveAssetUrl } from '@/lib/services';

interface LeaderboardItem {
  rank: number;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    isVerified: boolean;
  } | null;
  totalPoints: number;
  totalKills: number;
  tournamentsPlayed: number;
  totalWins: number;
  league: string;
}

export default function HomeLeaderboardTop3() {
  const [top3, setTop3] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    userApi
      .leaderboard()
      .then((res: any) => {
        if (!cancelled) {
          const list = Array.isArray(res.data) ? res.data : [];
          setTop3(list.slice(0, 3));
        }
      })
      .catch(() => {
        if (!cancelled) setTop3([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400">
          <Crown className="w-4 h-4" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-300/15 border border-zinc-300/30 text-zinc-300">
          <Medal className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-600/15 border border-amber-600/30 text-amber-500">
        <Medal className="w-4 h-4" />
      </div>
    );
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-display font-bold text-white uppercase tracking-wider">
            Leaderboard Top 3
          </h2>
        </div>
        <Link
          href="/leaderboards"
          className="text-fire-400 hover:text-fire-300 text-xs font-medium flex items-center gap-1 transition-colors"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 p-3 space-y-2.5">
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] animate-pulse"
              >
                <div className="w-7 h-7 rounded-full bg-white/10 shrink-0" />
                <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="h-3 w-24 rounded bg-white/10" />
                  <div className="h-2.5 w-16 rounded bg-white/5" />
                </div>
                <div className="h-4 w-14 rounded-full bg-white/10 shrink-0" />
              </div>
            ))}
          </div>
        ) : top3.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-500">No rankings yet. Play tournaments to earn points!</p>
          </div>
        ) : (
          top3.map((entry) => {
            const displayName =
              entry.user?.displayName || entry.user?.username || 'Player';
            return (
              <div
                key={entry.rank}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 transition-colors hover:bg-white/[0.06]"
              >
                <div className="shrink-0">{rankBadge(entry.rank)}</div>
                <Avatar
                  src={resolveAssetUrl(entry.user?.avatarUrl)}
                  alt={displayName}
                  size={32}
                  className="shrink-0 ring-1 ring-white/10"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                    {entry.user?.isVerified && (
                      <span className="text-[10px] text-green-400 bg-green-400/10 px-1 rounded">✓</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <LeagueBadge wins={entry.totalWins} size="sm" />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-fire-400 tabular-nums">
                    {entry.totalPoints} pts
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {entry.totalWins} wins
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
