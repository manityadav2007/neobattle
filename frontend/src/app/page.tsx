'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Trophy, Shield, Zap, Users, ChevronRight, LayoutDashboard } from 'lucide-react';
import ParticleCanvas from '@/components/ParticleCanvas';
import TournamentCard from '@/components/TournamentCard';
import LeaderboardSnapshot from '@/components/LeaderboardSnapshot';
import LogoAsset from '@/components/LogoAsset';
import { useTournaments } from '@/hooks/useTournaments';
import { useAuth } from '@/hooks/useAuth';
import { statsApi } from '@/lib/services';

const features = [
  { icon: Trophy, title: 'Elite Tournaments', desc: 'Solo, Duo & Squad formats with real prize pools' },
  { icon: Shield, title: 'Secure Escrow', desc: 'Entry fees held safely until tournament completion' },
  { icon: Zap, title: 'Instant Registration', desc: 'One-click signup with wallet integration' },
  { icon: Users, title: 'Team Management', desc: 'Create squads, invite members, compete together' },
];

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { tournaments, loading } = useTournaments({ status: 'REGISTRATION' });
  const [platformStats, setPlatformStats] = useState({ totalUsers: 0, totalTournaments: 0, totalPrizePool: 0 });

  useEffect(() => {
    statsApi.get().then((res) => {
      if (res.data) setPlatformStats(res.data);
    }).catch(() => {});
  }, []);

  const isLoggedIn = !!user;

  return (
    <div className="relative">
      <ParticleCanvas />

      <section className="relative z-10 min-h-[90vh] flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-2 mb-6">
                <LogoAsset className="h-[22px] w-auto" />
                <span className="text-fire-400 text-sm font-semibold tracking-widest uppercase">
                  Free Fire Tournament Platform
                </span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-display font-black leading-tight mb-6">
                <span className="gradient-text">DOMINATE</span>
                <br />
                <span className="text-white">THE ARENA</span>
              </h1>
              <p className="text-lg text-zinc-400 mb-8 max-w-xl leading-relaxed">
                Join thousands of Free Fire warriors in competitive tournaments.
                Secure payments, verified players, and epic prize pools await.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={isLoggedIn ? '/dashboard' : '/tournaments'}
                  className="btn-fire flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-bold text-white"
                >
                  {isLoggedIn ? 'My Dashboard' : 'Browse Tournaments'}
                  <ChevronRight className="w-5 h-5" />
                </Link>
                {!isLoggedIn && (
                  <Link
                    href="/register"
                    className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-bold text-zinc-300 border border-white/10 hover:border-fire-500/50 hover:text-white transition-all"
                  >
                    Create Account
                  </Link>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-16 grid grid-cols-3 gap-8 max-w-md"
            >
              <div>
                <p className="text-2xl font-display font-bold gradient-text">{platformStats.totalUsers || 0}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Players</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold gradient-text">₹{platformStats.totalPrizePool.toLocaleString('en-IN')}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Prizes Won</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold gradient-text">{platformStats.totalTournaments || 0}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Tournaments</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-display font-bold text-center mb-12">
            Why <span className="gradient-text">NEOBATTLE</span>?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card rounded-2xl p-6 text-center hover:fire-glow transition-shadow"
              >
                <div className="inline-flex p-3 rounded-xl bg-fire-500/10 mb-4">
                  <f.icon className="w-6 h-6 text-fire-400" />
                </div>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Registrations + Leaderboard Snapshot */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-display font-bold">
                  Open <span className="gradient-text">Registrations</span>
                </h2>
                <Link href="/tournaments" className="text-fire-400 hover:text-fire-300 text-sm font-medium flex items-center gap-1">
                  View All <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {loading ? (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-2xl h-72 animate-pulse bg-white/5" />
                  ))}
                </div>
              ) : tournaments.length > 0 ? (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {tournaments.slice(0, 6).map((t, i) => (
                    <TournamentCard key={t.id} tournament={t} index={i} />
                  ))}
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-12 text-center">
                  <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400">No open tournaments right now. Check back soon!</p>
                </div>
              )}
            </div>

            {/* Leaderboard Sidebar */}
            <div className="lg:col-span-1">
              <LeaderboardSnapshot />
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
