'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  Crosshair,
  Gamepad2,
  Info,
  MapPin,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import SettingsAboutSheet from '@/components/SettingsAboutSheet';
import { useAuth } from '@/hooks/useAuth';
import { useTournaments } from '@/hooks/useTournaments';
import {
  Tournament,
  formatCurrency,
  getCountdown,
  getEffectiveStatus,
  getMapTheme,
  isTournamentEnded,
  resolveAssetUrl,
  tournamentApi,
} from '@/lib/services';

interface MyEntry {
  id: string;
  registeredAt?: string;
  tournament: Tournament;
}

type AppTab = 'upcoming' | 'mine';

function getStatusLabel(status: string): string {
  switch (status) {
    case 'REGISTRATION':
      return 'Open';
    case 'ACTIVE':
    case 'Live':
      return 'Live';
    case 'Playing':
      return 'Playing';
    case 'Registration Closed':
      return 'Closed';
    case 'Slots Full':
      return 'Full';
    case 'Awaiting Payout':
      return 'Payout';
    case 'Ended':
      return 'Ended';
    default:
      return status;
  }
}

function statusPillClass(status: string): string {
  const label = getStatusLabel(status);
  if (label === 'Live' || label === 'Playing') {
    return 'border-fire-500/40 bg-fire-500/15 text-fire-300';
  }
  if (label === 'Open') {
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  }
  if (label === 'Full' || label === 'Closed') {
    return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  }
  return 'border-white/15 bg-white/10 text-zinc-300';
}

function modeLabel(gameMode: Tournament['gameMode']): string {
  return gameMode === 'CLASH_SQUAD' ? 'Clash Squad' : 'Full Map';
}

function ModeIcon({ gameMode, className }: { gameMode: Tournament['gameMode']; className?: string }) {
  return gameMode === 'CLASH_SQUAD' ? <Crosshair className={className} /> : <MapPin className={className} />;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
}

export default function AppHomeScreen() {
  const { user, loading: authLoading } = useAuth();
  const { tournaments, loading: tournamentsLoading } = useTournaments();
  const [tab, setTab] = useState<AppTab>('upcoming');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [myEntries, setMyEntries] = useState<MyEntry[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [greeting, setGreeting] = useState('Welcome back');

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setMyEntries([]);
      setMyLoading(false);
      return;
    }

    let cancelled = false;
    setMyLoading(true);

    tournamentApi
      .my()
      .then((res) => {
        if (cancelled) return;
        const raw = Array.isArray(res.data) ? (res.data as MyEntry[]) : [];
        setMyEntries(raw.filter((entry) => Boolean(entry?.tournament)));
      })
      .catch(() => {
        if (!cancelled) setMyEntries([]);
      })
      .finally(() => {
        if (!cancelled) setMyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const upcoming = useMemo(
    () => tournaments.filter((t) => t.status === 'REGISTRATION' && !isTournamentEnded(t)),
    [tournaments]
  );

  const live = useMemo(
    () =>
      tournaments.filter((t) => {
        const status = getEffectiveStatus(t);
        return status === 'ACTIVE' || status === 'Live' || status === 'Playing';
      }),
    [tournaments]
  );

  const featured = live.length > 0 ? live : upcoming.slice(0, 3);
  const displayName = user?.displayName || user?.ign || user?.username || 'Player';
  const walletBalance = user?.wallet?.balance ?? 0;

  const openMatches = myEntries.filter(({ tournament }) => !isTournamentEnded(tournament)).length;

  return (
    <div className="relative w-full max-w-lg mx-auto px-4 pb-12 text-white">
      {/* Quick User & Wallet Status Chip inside home content */}
      <div className="pt-3 pb-2">
        {authLoading ? (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
              <div className="space-y-1.5 min-w-0">
                <div className="w-16 h-2 bg-white/10 rounded" />
                <div className="w-24 h-3 bg-white/10 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-20 h-7 rounded-xl bg-white/10" />
              <div className="w-8 h-8 rounded-xl bg-white/10" />
            </div>
          </div>
        ) : user ? (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 group">
              <Avatar
                src={resolveAssetUrl(user.avatarUrl)}
                alt={displayName}
                size={36}
                className="ring-1 ring-fire-500/30 group-hover:ring-fire-400 transition-all"
              />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider truncate">
                  {greeting}
                </p>
                <p className="text-xs font-bold text-white truncate group-hover:text-fire-300 transition-colors">
                  {displayName}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href="/wallet"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.05] text-xs font-semibold text-white hover:bg-white/[0.1] transition-colors"
              >
                <Wallet className="h-3.5 w-3.5 text-fire-400" />
                <span className="tabular-nums">
                  {authLoading ? '—' : formatCurrency(walletBalance)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label="Open settings and about"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 hover:text-white transition-colors"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
              <Zap className="h-4 w-4 text-fire-400 shrink-0" />
              <span className="truncate">Compete in Free Fire Tournaments</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-xl btn-fire text-xs font-bold text-white"
              >
                Sign In
              </Link>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label="Open settings and about"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-400 hover:text-white transition-colors"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active tournament carousel */}
      {featured.length > 0 && (
        <section className="pt-3">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fire-400">
                Jump in now
              </p>
              <h2 className="text-lg font-display font-bold">
                {live.length > 0 ? 'Live & Active' : 'Featured Tournaments'}
              </h2>
            </div>
            <Link
              href="/tournaments"
              className="text-xs font-semibold text-zinc-400 active:text-white transition-colors"
            >
              See all
            </Link>
          </div>

          <div className="app-hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1 -mx-4 px-4">
            {featured.map((tournament) => {
              const theme = getMapTheme(tournament.mapName);
              const status = getEffectiveStatus(tournament);
              const entryFee = toNumber(tournament.entryFee);

              return (
                <Link
                  key={tournament.id}
                  href={`/tournaments/${tournament.id}`}
                  className="relative flex min-h-[168px] w-[86%] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-3xl border border-white/10 p-4 transition-transform active:scale-[0.985]"
                  style={{ backgroundImage: `linear-gradient(${theme.gradient})` }}
                >
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundImage: theme.overlay }}
                    aria-hidden="true"
                  />
                  <div className="relative flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusPillClass(status)}`}
                    >
                      <Zap className="h-3 w-3" />
                      {getStatusLabel(status)}
                    </span>
                    <span className="rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                      {tournament.format}
                    </span>
                  </div>

                  <div className="relative">
                    <h3 className="line-clamp-1 text-xl font-display font-black uppercase tracking-wide drop-shadow">
                      {tournament.title}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-white/75">
                      <ModeIcon gameMode={tournament.gameMode} className="h-3.5 w-3.5" />
                      {modeLabel(tournament.gameMode)}
                      <span className="text-white/40">•</span>
                      {theme.label}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/60">Prize pool</p>
                        <p className="text-lg font-bold text-white">{formatCurrency(tournament.prizePool)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-white/60">
                          {entryFee === 0 ? 'Free entry' : 'Entry'}
                        </p>
                        <p className="text-sm font-bold text-white">
                          {entryFee === 0 ? 'FREE' : formatCurrency(entryFee)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-white/75">
                      <Clock className="h-3.5 w-3.5" />
                      {getCountdown(tournament.startTime)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick stats */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Open Tournaments
          </p>
          <p className="mt-1 text-2xl font-display font-black text-fire-400">
            {upcoming.length}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            My Registered Matches
          </p>
          <p className="mt-1 text-2xl font-display font-black text-white">
            {user ? openMatches : '—'}
          </p>
        </div>
      </section>

      {/* Tab switch — Upcoming vs My Matches */}
      <div className="mt-6">
        <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`relative min-h-[44px] flex-1 rounded-xl text-sm font-semibold transition-colors ${
              tab === 'upcoming' ? 'bg-white/[0.08] text-white' : 'text-zinc-500'
            }`}
          >
            Upcoming
            {upcoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                {upcoming.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={`relative min-h-[44px] flex-1 rounded-xl text-sm font-semibold transition-colors ${
              tab === 'mine' ? 'bg-white/[0.08] text-white' : 'text-zinc-500'
            }`}
          >
            My Matches
            {user && myEntries.length > 0 && (
              <span className="ml-1.5 rounded-full bg-fire-500/20 px-1.5 py-0.5 text-[10px] font-bold text-fire-300">
                {myEntries.length}
              </span>
            )}
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mt-4 space-y-2.5"
          >
            {tab === 'upcoming' ? (
              tournamentsLoading ? (
                <TournamentSkeleton count={3} />
              ) : upcoming.length > 0 ? (
                upcoming.map((tournament) => (
                  <CompactTournamentCard key={tournament.id} tournament={tournament} />
                ))
              ) : (
                <EmptyState
                  icon={<Trophy className="h-7 w-7" />}
                  title="No open tournaments"
                  body="New Free Fire tournaments drop soon. Check back shortly."
                  actionHref="/tournaments"
                  actionLabel="Browse tournaments"
                />
              )
            ) : authLoading ? (
              <TournamentSkeleton count={2} />
            ) : !user ? (
              <EmptyState
                icon={<UserRound className="h-7 w-7" />}
                title="Sign in to see your matches"
                body="Your registrations, room details, and match history appear here."
                actionHref="/login"
                actionLabel="Sign in"
              />
            ) : myLoading ? (
              <TournamentSkeleton count={2} />
            ) : myEntries.length > 0 ? (
              myEntries.map((entry) => (
                <CompactTournamentCard
                  key={entry.id}
                  tournament={entry.tournament}
                  registeredAt={entry.registeredAt}
                />
              ))
            ) : (
              <EmptyState
                icon={<Gamepad2 className="h-7 w-7" />}
                title="No registrations yet"
                body="Join an open tournament and it will show up here with room details."
                actionHref="/tournaments"
                actionLabel="Find a match"
              />
            )}
          </motion.div>
        </AnimatePresence>

        <p className="mt-8 flex items-center justify-center gap-1.5 pb-2 text-center text-[11px] text-zinc-600">
          <ShieldCheck className="h-3.5 w-3.5" />
          Skill-based esports · Secure wallet
        </p>
      </div>

      {/* Settings & About sheet */}
      <SettingsAboutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function CompactTournamentCard({
  tournament,
  registeredAt,
}: {
  tournament: Tournament;
  registeredAt?: string;
}) {
  const theme = getMapTheme(tournament.mapName);
  const status = getEffectiveStatus(tournament);
  const entryFee = toNumber(tournament.entryFee);
  const entryCount = tournament._count?.entries ?? 0;
  const spotsLeft = Math.max(tournament.maxParticipants - entryCount, 0);

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="flex min-h-[96px] items-center gap-3 rounded-2xl border border-white/10 bg-[#111116] p-3 transition-colors active:bg-white/[0.06]"
    >
      <div
        className="relative flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10"
        style={{ backgroundImage: `linear-gradient(${theme.gradient})` }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: theme.overlay }}
          aria-hidden="true"
        />
        <ModeIcon gameMode={tournament.gameMode} className="relative h-5 w-5 text-white/90" />
        <span className="relative mt-1 text-[9px] font-bold uppercase tracking-wide text-white/80">
          {tournament.format}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusPillClass(status)}`}
          >
            {getStatusLabel(status)}
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300">
            <ModeIcon gameMode={tournament.gameMode} className="h-2.5 w-2.5" />
            {modeLabel(tournament.gameMode)}
          </span>
          <span className="truncate text-[9px] font-medium uppercase tracking-wider text-zinc-500">
            {theme.label}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] font-bold text-white">{tournament.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
          <Clock className="h-3 w-3" />
          {getCountdown(tournament.startTime)}
          <span className="text-zinc-700">•</span>
          <span>{spotsLeft > 0 ? `${spotsLeft} spots left` : 'Slots full'}</span>
        </p>
        {registeredAt && (
          <p className="mt-0.5 truncate text-[10px] text-emerald-400/80">Registered</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Prize</p>
        <p className="text-sm font-bold text-fire-400">{formatCurrency(tournament.prizePool)}</p>
        <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
          {entryFee === 0 ? 'Free entry' : `${formatCurrency(entryFee)} entry`}
        </p>
      </div>
    </Link>
  );
}

function TournamentSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[96px] animate-pulse items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3"
        >
          <div className="h-[68px] w-[68px] shrink-0 rounded-xl bg-white/[0.05]" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
            <div className="h-3 w-3/4 rounded bg-white/[0.08]" />
            <div className="h-2.5 w-1/2 rounded bg-white/[0.05]" />
          </div>
          <div className="h-8 w-14 rounded bg-white/[0.05]" />
        </div>
      ))}
    </>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111116] px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-500">
        {icon}
      </div>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-zinc-500">{body}</p>
      <Link
        href={actionHref}
        className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-fire-500/40 bg-fire-500/12 px-5 text-sm font-semibold text-fire-300 transition-colors active:bg-fire-500/20"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
