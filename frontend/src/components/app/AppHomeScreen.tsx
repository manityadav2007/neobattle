'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Clock,
  Crosshair,
  Gamepad2,
  Home,
  Info,
  MapPin,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
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

const appNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/dashboard', label: 'Profile', icon: UserRound },
];

const legalLinks = [
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund' },
  { label: 'Fair Play Policy', href: '/fair-play' },
  { label: 'Prize Policy', href: '/prize-policy' },
  { label: 'Disclaimer', href: '/disclaimer' },
];

const sheetLinks = [
  { label: 'My Profile', href: '/dashboard', icon: UserRound },
  { label: 'Wallet', href: '/wallet', icon: Wallet },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Help & Feedback', href: '/help-feedback', icon: Info },
];

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
  const pathname = usePathname();
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
    <div className="relative min-h-screen bg-[#0a0a0c] text-white">
      <div className="mx-auto w-full max-w-lg pb-[calc(108px+env(safe-area-inset-bottom,0px))]">
        {/* App header */}
        <header
          className="relative z-30 border-b border-white/5 bg-[#0a0a0c]/90 backdrop-blur-xl"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-3">
            <Link href="/dashboard" className="flex min-h-[44px] min-w-0 items-center gap-3">
              <Avatar
                src={resolveAssetUrl(user?.avatarUrl)}
                alt={displayName}
                size={42}
                className="ring-2 ring-fire-500/30"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {greeting}
                </p>
                <p className="truncate text-sm font-bold text-white">{displayName}</p>
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href={user ? '/wallet' : '/login'}
                className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white transition-colors active:bg-white/[0.1]"
              >
                <Wallet className="h-4 w-4 text-fire-400" />
                <span className="tabular-nums">
                  {authLoading ? '—' : user ? formatCurrency(walletBalance) : 'Sign in'}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label="Open settings and about"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-300 transition-colors active:bg-white/[0.1]"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="px-4">
          {/* Active tournament carousel */}
          {featured.length > 0 && (
            <section className="pt-5">
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
                  className="flex min-h-[44px] items-center gap-0.5 text-xs font-semibold text-zinc-400 transition-colors active:text-white"
                >
                  See all <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="app-hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
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
            <div className="rounded-2xl border border-white/10 bg-[#111116] p-3.5">
              <div className="flex items-center gap-2 text-emerald-400">
                <Trophy className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Open now</span>
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums">{upcoming.length}</p>
              <p className="text-[11px] text-zinc-500">Tournaments taking entries</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#111116] p-3.5">
              <div className="flex items-center gap-2 text-fire-400">
                <Gamepad2 className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">My matches</span>
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums">{user ? openMatches : '—'}</p>
              <p className="text-[11px] text-zinc-500">Upcoming registrations</p>
            </div>
          </section>

          {/* Tabs */}
          <div className="mt-6 flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setTab('upcoming')}
              className={`relative min-h-[44px] flex-1 rounded-xl text-sm font-semibold transition-colors ${
                tab === 'upcoming' ? 'bg-white/[0.08] text-white' : 'text-zinc-500'
              }`}
            >
              Upcoming
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
                    body="New Free Fire tournaments drop soon. Pull down to refresh or check the tournaments tab."
                    actionHref="/tournaments"
                    actionLabel="Browse tournaments"
                  />
                )
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
      </div>

      {/* Bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto max-w-lg px-3 pb-2">
          <div className="flex items-center justify-around rounded-3xl border border-white/10 bg-[#101014]/95 p-1.5 shadow-[0_-8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            {appNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-[48px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                    active ? 'text-fire-300' : 'text-zinc-500 active:text-zinc-200'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="app-bottom-nav-active"
                      className="absolute inset-0 rounded-2xl bg-fire-500/12"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                    />
                  )}
                  <Icon
                    className={`relative h-5 w-5 ${
                      active ? 'drop-shadow-[0_0_6px_rgba(249,115,22,0.45)]' : ''
                    }`}
                  />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Settings & About sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setSheetOpen(false)}
              className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Settings and About"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="relative max-h-[86vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-[#111116] px-4 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fire-400">NeoBattle App</p>
                  <h2 className="text-lg font-bold">Settings &amp; About</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close settings"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {sheetLinks.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSheetOpen(false)}
                    className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-zinc-200 transition-colors active:bg-white/[0.08]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-fire-500/10 text-fire-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    {label}
                  </Link>
                ))}
              </div>

              <div className="mt-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Legal &amp; Policies
                </p>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                  {legalLinks.map((link, index) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setSheetOpen(false)}
                      className={`flex min-h-[48px] items-center justify-between px-4 text-sm text-zinc-300 transition-colors active:bg-white/[0.06] ${
                        index > 0 ? 'border-t border-white/5' : ''
                      }`}
                    >
                      {link.label}
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-zinc-500">
                <span>NeoBattle for Android</span>
                <span className="font-semibold text-zinc-400">v1.0.0</span>
              </div>

              <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
                NeoBattle is a skill-based esports platform. Play responsibly and follow the fair play policy.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
