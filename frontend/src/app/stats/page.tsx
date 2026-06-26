'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, BarChart3, Flame, Timer, Users, Trophy, DollarSign, Activity, Loader2, Target, Award } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { statsApi, userApi, formatCurrency, type PlatformStats, type UserStats } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import LeagueBadge from '@/components/LeagueBadge';

export default function StatsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      statsApi.get().then((res) => setStats(res.data || null)),
      user ? userApi.stats().then((res) => setUserStats(res.data || null)).catch(() => {}) : Promise.resolve(),
    ])
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="relative px-4 py-16 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fire-300">Performance Insights</p>
        <h1 className="mt-5 text-4xl font-display font-black text-white sm:text-6xl">
          <span className="gradient-text">Stats</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
          Platform-wide statistics and performance metrics across NEOBATTLE.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/leaderboards" className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white">
            See Top Players <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-fire-500/40 hover:text-white">
            Review Your Dashboard
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
        ) : stats ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-10">
              {[
                { icon: Users, label: 'Total Players', value: stats.totalUsers.toLocaleString(), color: 'text-blue-400' },
                { icon: Trophy, label: 'Tournaments', value: stats.totalTournaments.toLocaleString(), color: 'text-fire-400' },
                { icon: Activity, label: 'Active Now', value: stats.activeTournaments.toLocaleString(), color: 'text-green-400' },
                { icon: DollarSign, label: 'Prize Pool', value: formatCurrency(stats.totalPrizePool), color: 'text-yellow-400' },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="glass-card rounded-2xl p-6 text-center hover:fire-glow transition-shadow"
                  >
                    <div className="inline-flex p-3 rounded-xl bg-white/5 mb-3">
                      <Icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                    <p className="text-2xl font-display font-bold text-white">{stat.value}</p>
                    <p className="text-sm text-zinc-400 mt-1">{stat.label}</p>
                  </motion.div>
                );
              })}
            </div>

            {user && userStats && (
              <div className="glass-card rounded-2xl p-6 mb-10 border border-white/5">
                <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-400" />
                  Your Performance
                </h2>
                <div className="flex items-center gap-3 mb-6">
                  <LeagueBadge wins={userStats.totalWins} size="lg" />
                  <span className="text-sm text-zinc-500">
                    {user.displayName || user.username} &mdash; {userStats.league}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { icon: Trophy, label: 'Tournaments Played', value: userStats.totalTournamentsPlayed, color: 'text-blue-400' },
                    { icon: Award, label: 'Total Wins', value: userStats.totalWins, color: 'text-green-400' },
                    { icon: DollarSign, label: 'Prize Money Won', value: formatCurrency(userStats.totalPrizeMoney), color: 'text-yellow-400' },
                    { icon: Target, label: 'Win Rate', value: `${userStats.winRate}%`, color: 'text-fire-400' },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                        <Icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
                        <p className="text-xl font-bold text-white">{s.value}</p>
                        <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  icon: BarChart3, title: 'Placement Trends', desc: `${stats.totalTournaments} tournaments completed across solo, duo, and squad formats with tracked placement data.`,
                },
                {
                  icon: Flame, title: 'Momentum Tracking', desc: `${stats.activeTournaments} tournaments currently active. ${stats.totalTransactions} transactions processed through the platform.`,
                },
                {
                  icon: Timer, title: 'Fast Reads', desc: `${formatCurrency(stats.totalPrizePool)} in total prize pool distributed across ${stats.totalTournaments} events.`,
                },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="glass-card rounded-3xl p-6"
                  >
                    <div className="mb-4 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">{card.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
