'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  Crosshair,
  Gamepad2,
  MapPin,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTournaments } from '@/hooks/useTournaments';
import HomeLeaderboardTop3 from './HomeLeaderboardTop3';
import {
  Tournament,
  formatCurrency,
  getCountdown,
  getEffectiveStatus,
  getMapTheme,
  getStatusColor,
  isTournamentEnded,
  tournamentApi,
} from '@/lib/services';

interface MyEntry {
  id: string;
  registeredAt?: string;
  tournament: Tournament;
}

type AppTab = 'upcoming' | 'mine';

function getGreetingPrefix(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function modeLabel(gameMode: Tournament['gameMode']): string {
  return gameMode === 'CLASH_SQUAD' ? 'Clash Squad' : 'Full Map';
}

function ModeIcon({ gameMode, className }: { gameMode: Tournament['gameMode']; className?: string }) {
  return gameMode === 'CLASH_SQUAD' ? <Crosshair className={className} /> : <MapPin className={className} />;
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
  const [myEntries, setMyEntries] = useState<MyEntry[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  // Check URL tab parameter on mount (e.g. /?tab=mine from hamburger menu)
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.dispatchEvent(new CustomEvent('app:route-painted'));
        } catch {}
      });
    });
  }, []);

  useEffect(() => {
    if (!tournamentsLoading) {
      try {
        window.dispatchEvent(new CustomEvent('app:data-ready'));
      } catch {}
    }
  }, [tournamentsLoading]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const paramTab = new URLSearchParams(window.location.search).get('tab');
      if (paramTab === 'mine' || paramTab === 'upcoming') {
        setTab(paramTab);
      }
    }
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
  const walletBalance = user?.wallet?.balance ?? 0;
  const rawName = user?.displayName || user?.username || user?.ign || 'Player';
  const firstName = rawName.trim().split(/\s+/)[0] || 'Player';
  const greetingPrefix = getGreetingPrefix(new Date().getHours());
  const openMatches = myEntries.filter(({ tournament }) => !isTournamentEnded(tournament)).length;

  return (
    <div data-app-home="true" className="relative w-full max-w-lg mx-auto px-4 pb-12 text-white">
      {/* 3. HOME TOP STRIP: "Good <morning/afternoon/evening>, <first name>" and a wallet chip */}
      <div className="pt-3 pb-3 flex items-center justify-between gap-3">
        {authLoading ? (
          <div className="flex items-center justify-between w-full animate-pulse">
            <div className="h-5 w-36 rounded bg-white/10" />
            <div className="h-8 w-24 rounded-xl bg-white/10" />
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-zinc-300 truncate">
              {greetingPrefix},{' '}
              <span className="font-bold text-white">{firstName}</span>
            </p>
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.05] text-xs font-semibold text-white hover:bg-white/[0.1] transition-colors shrink-0"
            >
              <Wallet className="h-3.5 w-3.5 text-fire-400" />
              <span className="tabular-nums">{formatCurrency(walletBalance)}</span>
            </Link>
          </>
        )}
      </div>

      {/* 4. ACTIVE TOURNAMENT CAROUSEL (reusing website tokens: glass-card, rounded-2xl, font-display) */}
      {featured.length > 0 && (
        <section className="pt-2">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Jump In Now
              </p>
              <h2 className="text-lg font-display font-bold">
                {live.length > 0 ? (
                  <>Live &amp; <span className="gradient-text">Playing</span></>
                ) : (
                  <>Featured <span className="gradient-text">Tournaments</span></>
                )}
              </h2>
            </div>
            <Link
              href="/tournaments"
              className="text-fire-400 hover:text-fire-300 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
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
                  className="glass-card relative flex min-h-[168px] w-[86%] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-4 transition-transform active:scale-[0.985] hover:fire-glow"
                  style={{ backgroundImage: `linear-gradient(${theme.gradient})` }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-40"
                    style={{ backgroundImage: theme.overlay }}
                    aria-hidden="true"
                  />
                  <div className="relative z-10 flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(status)}`}
                    >
                      <Zap className="h-3 w-3" />
                      {status}
                    </span>
                    <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                      {tournament.format}
                    </span>
                  </div>

                  <div className="relative z-10">
                    <h3 className="line-clamp-1 text-lg font-display font-bold uppercase tracking-wide text-white drop-shadow">
                      {tournament.title}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-white/80">
                      <ModeIcon gameMode={tournament.gameMode} className="h-3.5 w-3.5" />
                      {modeLabel(tournament.gameMode)}
                      <span className="text-white/40">•</span>
                      {theme.label}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider">Prize Pool</p>
                        <p className="text-base font-bold text-white">{formatCurrency(tournament.prizePool)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-400 uppercase tracking-wider">
                          {entryFee === 0 ? 'Free entry' : 'Entry'}
                        </p>
                        <p className="text-sm font-bold text-white">
                          {entryFee === 0 ? 'FREE' : formatCurrency(entryFee)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-zinc-300">
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

      {/* 4. STAT CARD COMPONENT: Same number style (gradient-text) and label style (uppercase tracking-wider) as site stats */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-bold gradient-text">
            {upcoming.length}
          </p>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">
            Open Tournaments
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-bold gradient-text">
            {authLoading ? '—' : user ? openMatches : '—'}
          </p>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">
            My Registered Matches
          </p>
        </div>
      </section>

      {/* 4. SAME TABS COMPONENT FOR UPCOMING / MY MATCHES (matching site style) */}
      <div className="mt-6">
        <div className="flex border-b border-white/10 gap-4">
          <button
            type="button"
            onClick={() => {
              setTab('upcoming');
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              if (document.documentElement) document.documentElement.scrollTop = 0;
              if (document.body) document.body.scrollTop = 0;
            }}
            className={`relative pb-3 text-sm font-semibold transition-colors ${
              tab === 'upcoming' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Upcoming
            {upcoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-zinc-300">
                {upcoming.length}
              </span>
            )}
            {tab === 'upcoming' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-fire-500 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('mine');
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              if (document.documentElement) document.documentElement.scrollTop = 0;
              if (document.body) document.body.scrollTop = 0;
            }}
            className={`relative pb-3 text-sm font-semibold transition-colors ${
              tab === 'mine' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            My Matches
            {user && myEntries.length > 0 && (
              <span className="ml-1.5 rounded-full bg-fire-500/20 px-2 py-0.5 text-xs font-bold text-fire-400">
                {myEntries.length}
              </span>
            )}
            {tab === 'mine' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-fire-500 rounded-full" />
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
                  icon={<Trophy className="w-8 h-8" />}
                  title="No Open Tournaments"
                  body="New Free Fire tournaments will be open soon. Check back shortly."
                  actionHref="/tournaments"
                  actionLabel="Browse Tournaments"
                />
              )
            ) : authLoading ? (
              <TournamentSkeleton count={2} />
            ) : !user ? (
              <EmptyState
                icon={<UserRound className="w-8 h-8" />}
                title="Sign in to View Matches"
                body="Your registrations, room credentials, and match results appear here."
                actionHref="/login"
                actionLabel="Sign In"
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
                icon={<Gamepad2 className="w-8 h-8" />}
                title="No Registrations Yet"
                body="Register for an open tournament and it will appear here with your room details."
                actionHref="/tournaments"
                actionLabel="Find a Tournament"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Directly below Upcoming / My Matches: Leaderboard Top 3 Card */}
        <HomeLeaderboardTop3 />

        <p className="mt-8 flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-zinc-500">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Skill-based esports · Secure wallet
        </p>
      </div>
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
  const effectiveStatus = getEffectiveStatus(tournament);
  const ended = isTournamentEnded(tournament);
  const entryFee = toNumber(tournament.entryFee);
  const entryCount = tournament._count?.entries ?? 0;
  const spotsLeft = Math.max(tournament.maxParticipants - entryCount, 0);

  // Status label: ENDED / LIVE / UPCOMING matching spec
  const statusLabel = ended
    ? 'ENDED'
    : effectiveStatus === 'ACTIVE' || effectiveStatus === 'Live' || effectiveStatus === 'Playing'
    ? 'LIVE'
    : 'UPCOMING';

  const startState = ended
    ? 'Ended'
    : effectiveStatus === 'Playing' || effectiveStatus === 'Live'
    ? 'Playing now'
    : getCountdown(tournament.startTime);

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="glass-card flex min-h-[100px] items-center gap-3 rounded-2xl border border-white/5 p-3 sm:p-3.5 transition-all hover:fire-glow hover:border-fire-500/30"
    >
      {/* Map Thumbnail */}
      <div
        className="relative flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10"
        style={{ backgroundImage: `linear-gradient(${theme.gradient})` }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: theme.overlay }}
          aria-hidden="true"
        />
        <ModeIcon gameMode={tournament.gameMode} className="relative h-5 w-5 text-white/90" />
        <span className="relative mt-1 text-[9px] font-bold uppercase tracking-wide text-white/80 whitespace-nowrap">
          {tournament.format}
        </span>
      </div>

      {/* Middle column: Line 1 (status + mode), Line 2 (full map name + start state), Title */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Line 1: Status badge (ENDED / LIVE / UPCOMING) + Mode badge (Full Map / Clash Squad) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`whitespace-nowrap inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getStatusColor(
              effectiveStatus
            )}`}
          >
            {statusLabel}
          </span>
          <span className="whitespace-nowrap inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
            <ModeIcon gameMode={tournament.gameMode} className="h-3 w-3 shrink-0" />
            {modeLabel(tournament.gameMode)}
          </span>
        </div>

        {/* Line 2: Full map name (not truncated) and the start state */}
        <div className="flex items-center gap-1.5 flex-wrap text-zinc-400">
          <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-zinc-300">
            {theme.label}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="whitespace-nowrap flex items-center gap-1 text-[11px] text-zinc-400">
            <Clock className="h-3 w-3 text-zinc-500 shrink-0" />
            {startState}
          </span>
          {registeredAt && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="whitespace-nowrap text-[10px] font-semibold text-emerald-400">
                Registered
              </span>
            </>
          )}
        </div>

        {/* Tournament Title */}
        <p className="line-clamp-1 text-sm font-bold text-white drop-shadow-sm">
          {tournament.title}
        </p>
      </div>

      {/* Right column: Prize & Entry Fee */}
      <div className="shrink-0 text-right pl-1 sm:pl-2 self-center">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Prize</p>
        <p className="text-sm font-bold text-fire-400 tabular-nums whitespace-nowrap">
          {formatCurrency(tournament.prizePool)}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-400 whitespace-nowrap">
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
          className="glass-card flex min-h-[96px] animate-pulse items-center gap-3 rounded-2xl border border-white/5 p-3.5"
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
    <div className="glass-card rounded-2xl p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-fire-500/10 text-fire-400">
        {icon}
      </div>
      <h3 className="text-base font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 mb-4 max-w-xs mx-auto leading-relaxed">{body}</p>
      <Link
        href={actionHref}
        className="btn-fire px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
