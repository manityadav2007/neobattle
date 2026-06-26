'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, Users, Clock, ArrowRight, MapPin, Smartphone, Monitor, Gamepad2, Timer,
} from 'lucide-react';
import { Tournament, formatCurrency, getStatusColor, formatTag, getMapTheme, getCountdown } from '@/lib/services';

interface TournamentCardProps {
  tournament: Tournament;
  index?: number;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'MOBILE') return <Smartphone className="w-3 h-3" />;
  if (platform === 'PC') return <Monitor className="w-3 h-3" />;
  return null;
}

export default function TournamentCard({ tournament, index = 0 }: TournamentCardProps) {
  const entryCount = tournament._count?.entries ?? 0;
  const spotsLeft = tournament.maxParticipants - entryCount;
  const entryFee = typeof tournament.entryFee === 'string' ? parseFloat(tournament.entryFee) : tournament.entryFee;
  const prizePool = typeof tournament.prizePool === 'string' ? parseFloat(tournament.prizePool) : tournament.prizePool;
  const prizeFirst = tournament.prizeFirst != null ? (typeof tournament.prizeFirst === 'string' ? parseFloat(tournament.prizeFirst) : tournament.prizeFirst) : null;
  const prizeSecond = tournament.prizeSecond != null ? (typeof tournament.prizeSecond === 'string' ? parseFloat(tournament.prizeSecond) : tournament.prizeSecond) : null;
  const prizeThird = tournament.prizeThird != null ? (typeof tournament.prizeThird === 'string' ? parseFloat(tournament.prizeThird) : tournament.prizeThird) : null;
  const hasBreakdown = prizeFirst != null && prizeFirst > 0;
  const theme = getMapTheme(tournament.mapName);
  const countdown = getCountdown(tournament.startTime);
  const isUrgent = spotsLeft <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#0d0d16] transition-all duration-300 hover:border-fire-500/30 hover:shadow-[0_0_40px_rgba(249,115,22,0.12)]"
    >
      {/* Map Image Background — constrained to card bounds */}
      {theme.image && (
        <img
          src={theme.image}
          alt={theme.label}
          className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-55 transition-opacity duration-500"
        />
      )}
      <div className="absolute inset-0 opacity-25 transition-opacity duration-500 group-hover:opacity-35" style={{ background: `linear-gradient(${theme.gradient})` }} />
      <div className="absolute inset-0 opacity-20 transition-opacity duration-500" style={{ background: theme.overlay }} />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d16] via-[#0d0d16]/60 to-transparent" />

      {/* Top Bar — Status + Format + Platform */}
      <div className="relative z-10 flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusColor(tournament.status)}`}>
            {tournament.status}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
            {tournament.format}
          </span>
          {tournament.platform && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center gap-1">
              <PlatformIcon platform={tournament.platform} />
              {tournament.platform === 'MOBILE' ? 'Mobile' : 'PC'}
            </span>
          )}
          {tournament.gameMode && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 flex items-center gap-1">
              <Gamepad2 className="w-3 h-3" />
              {tournament.gameMode === 'FULL_MAP' ? 'Full Map' : 'Clash Squad'}
            </span>
          )}
        </div>
        <span className="text-[9px] text-zinc-600 font-mono">{tournament.uid}</span>
      </div>

      {/* Card Body */}
      <div className="relative z-10 p-4 pt-3">
        {/* Title + Map */}
        <div className="mb-3">
          <h3 className="text-base font-bold text-white leading-tight group-hover:text-fire-400 transition-colors line-clamp-1">
            {tournament.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <MapPin className="w-3 h-3 text-zinc-500" />
            <span className="text-[11px] text-zinc-500">{theme.label}</span>
          </div>
        </div>

        {/* Prize Breakdown & Entry — inline row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{hasBreakdown ? 'Prize Breakdown' : 'Prize Pool'}</p>
            {hasBreakdown ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-sm font-bold text-yellow-400">1st: {formatCurrency(prizeFirst!)}</p>
                {prizeSecond != null && prizeSecond > 0 && (
                  <p className="text-sm font-semibold text-zinc-300">2nd: {formatCurrency(prizeSecond)}</p>
                )}
                {prizeThird != null && prizeThird > 0 && (
                  <p className="text-sm font-semibold text-zinc-300">3rd: {formatCurrency(prizeThird)}</p>
                )}
              </div>
            ) : (
              <p className="text-lg font-black gradient-text">{formatCurrency(prizePool)}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Entry</p>
            <p className="text-sm font-bold text-fire-400">{entryFee === 0 ? 'FREE' : formatCurrency(entryFee)}</p>
          </div>
        </div>

        {/* Meta row: slots, countdown */}
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span>{entryCount}/{tournament.maxParticipants}</span>
            {isUrgent && (
              <span className="text-[10px] text-red-400 font-semibold ml-1 animate-pulse">{spotsLeft} left</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-yellow-400" />
            <span className={countdown === 'Started' ? 'text-green-400' : ''}>{countdown}</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 border-t border-white/5">
        <Link
          href={`/tournaments/${tournament.id}`}
          className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:bg-fire-500/10 hover:text-fire-400"
        >
          View Details <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  );
}
