'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Trophy, Filter, Plus, Shield, Smartphone, Monitor, Gamepad2 } from 'lucide-react';
import TournamentCard from '@/components/TournamentCard';
import { useTournaments } from '@/hooks/useTournaments';
import { useAuth } from '@/hooks/useAuth';

const statusFilters = ['', 'REGISTRATION', 'ACTIVE', 'COMPLETED'];
const formatFilters = ['', 'SOLO', 'DUO', 'SQUAD'];
const platformFilters = ['', 'MOBILE', 'PC'];
const gameModeFilters = ['', 'FULL_MAP', 'CLASH_SQUAD'];

export default function TournamentsPage() {
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');
  const [platform, setPlatform] = useState('');
  const [gameMode, setGameMode] = useState('');
  const { user, isSuperAdmin, isHost } = useAuth();
  const canCreate = user && (isSuperAdmin || isHost);
  const hasFilters = status || format || platform || gameMode;
  const { tournaments, loading, error, refetch } = useTournaments({
    status: status || undefined,
    format: format || undefined,
    platform: platform || undefined,
    gameMode: gameMode || undefined,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
                <Trophy className="w-8 h-8 text-blue-400" />
                Tournaments
              </h1>
              <p className="text-zinc-400 mt-2">Find and join competitive Free Fire tournaments</p>
            </div>
            {canCreate && (
              <Link
                href="/host-dashboard"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white btn-fire whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create Tournament</span>
                <Shield className="w-3.5 h-3.5 opacity-70" />
              </Link>
            )}
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
          <Filter className="w-4 h-4 text-zinc-500" />
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 self-center mr-1">Status:</span>
            {statusFilters.map((s) => (
              <button
                key={s || 'all'}
                onClick={() => {
                  setStatus(s);
                  refetch(1, { status: s || undefined, format: format || undefined, platform: platform || undefined, gameMode: gameMode || undefined });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  status === s ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 self-center mr-1">Format:</span>
            {formatFilters.map((f) => (
              <button
                key={f || 'all'}
                onClick={() => {
                  setFormat(f);
                  refetch(1, { status: status || undefined, format: f || undefined, platform: platform || undefined, gameMode: gameMode || undefined });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  format === f ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {f || 'All'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 self-center mr-1">Platform:</span>
            {platformFilters.map((p) => (
              <button
                key={p || 'all'}
                onClick={() => {
                  setPlatform(p);
                  refetch(1, { status: status || undefined, format: format || undefined, platform: p || undefined, gameMode: gameMode || undefined });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  platform === p ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {p === 'MOBILE' ? <Smartphone className="w-3 h-3 inline mr-1" /> : p === 'PC' ? <Monitor className="w-3 h-3 inline mr-1" /> : null}
                {p || 'All'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 self-center mr-1">Mode:</span>
            {gameModeFilters.map((m) => (
              <button
                key={m || 'all'}
                onClick={() => {
                  setGameMode(m);
                  refetch(1, { status: status || undefined, format: format || undefined, platform: platform || undefined, gameMode: m || undefined });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  gameMode === m ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3 h-3 inline mr-1" />
                {m === 'FULL_MAP' ? 'Full Map' : m === 'CLASH_SQUAD' ? 'Clash Squad' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="glass-card rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-2xl h-72 animate-pulse bg-white/5" />
            ))}
          </div>
        ) : tournaments.length > 0 ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {tournaments.map((t, i) => (
              <TournamentCard key={t.id} tournament={t} index={i} />
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Trophy className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-zinc-400 mb-2">No tournaments available at the moment</h3>
            <p className="text-sm text-zinc-500">{hasFilters ? 'Try adjusting your filters' : 'Check back later for new tournaments'}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
