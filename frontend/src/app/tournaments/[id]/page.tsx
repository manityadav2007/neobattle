'use client';

import { useEffect, use, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, Users, MapPin, Clock, IndianRupee,
  CheckCircle, AlertCircle, Loader2, Gamepad2, Copy, ClipboardCheck, Shield, Wallet, Trash2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTournament } from '@/hooks/useTournaments';
import TournamentTags, { tagColorMap, tagIcons } from '@/components/TournamentTags';
import { tournamentApi, gameApi, userApi, adminApi, uploadApi, resultApi, formatCurrency, formatDate, getMapTheme, getEffectiveStatus, getStatusColor, TOURNAMENT_PLAY_GRACE_MS, type UserStats, type ResultSubmission } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import LeagueBadge from '@/components/LeagueBadge';

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const { tournament, loading, error } = useTournament(id);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [registerError, setRegisterError] = useState('');

  const [myStats, setMyStats] = useState<UserStats | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teammateUids, setTeammateUids] = useState<string[]>(['', '', '']);
  const [teammateStatus, setTeammateStatus] = useState<Record<number, { loading?: boolean; valid?: boolean; info?: any; error?: string }>>({});
  const [copied, setCopied] = useState(false);
  const [endingTournament, setEndingTournament] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [deletingTournament, setDeletingTournament] = useState(false);

  // Host result submission
  const [mySubmission, setMySubmission] = useState<ResultSubmission | null>(null);
  const [resUids, setResUids] = useState({ first: '', second: '', third: '' });
  const [resFile, setResFile] = useState<File | null>(null);
  const [submittingResult, setSubmittingResult] = useState(false);

  useEffect(() => {
    if (!user || !tournament || user.id !== tournament.creatorId) return;
    resultApi.mine()
      .then((res) => {
        const mine = (res.data || []).find((s: ResultSubmission) => s.tournamentId === tournament.id);
        setMySubmission(mine || null);
      })
      .catch(() => {});
  }, [user, tournament]);

  const handleResultScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    setResFile(e.target.files?.[0] || null);
  };

  const handleSubmitResult = async () => {
    if (!tournament) return;
    if (!resUids.first.trim()) { setRegisterError('1st place UID is required'); return; }
    if (!resFile && !mySubmission?.screenshotUrl) { setRegisterError('Upload the winning proof screenshot'); return; }
    setSubmittingResult(true);
    setRegisterError('');
    try {
      let screenshotUrl = mySubmission?.screenshotUrl || '';
      if (resFile) {
        const up = await uploadApi.verificationScreenshot(resFile);
        screenshotUrl = up.data.screenshotUrl;
      }
      await resultApi.submit(tournament.id, {
        firstUid: resUids.first.trim(),
        secondUid: resUids.second.trim() || undefined,
        thirdUid: resUids.third.trim() || undefined,
        screenshotUrl,
      });
      setMessage('Results submitted! Awaiting admin approval & payout.');
      window.location.reload();
    } catch (err) {
      setRegisterError(getErrorMessage(err));
    } finally {
      setSubmittingResult(false);
    }
  };

  const isHostCreator = user?.id === tournament?.creatorId;
  const isAdminUser = Boolean(isAdmin || isSuperAdmin);
  const canDeleteTournament = tournament != null && user != null && (isHostCreator || isAdminUser);

  const handleDeleteTournament = async () => {
    if (!tournament) return;
    const isConfirmed = confirm(
      `Are you sure you want to permanently delete "${tournament.title}"?\n\n` +
      `• Any held player entry fees will be automatically refunded to their wallets.\n` +
      `• This tournament will be permanently removed from the database.\n\n` +
      `This action cannot be undone.`
    );
    if (!isConfirmed) return;

    setDeletingTournament(true);
    setRegisterError('');
    setMessage('');
    try {
      await tournamentApi.delete(tournament.id);
      alert('Tournament deleted successfully.');
      router.push(isAdmin ? '/admin/tournaments' : '/tournaments');
    } catch (err) {
      setRegisterError(getErrorMessage(err));
      setDeletingTournament(false);
    }
  };

  const canSubmitResults =
    isHostCreator &&
    tournament != null &&
    (tournament.status === 'COMPLETED' || tournament.status === 'ACTIVE') &&
    mySubmission?.status !== 'PENDING' &&
    mySubmission?.status !== 'APPROVED';

  const handleDistributePrizes = async () => {
    if (!tournament) return;
    const lines = [
      firstPlace > 0 && `1st: ${formatCurrency(firstPlace)}`,
      secondPlace > 0 && `2nd: ${formatCurrency(secondPlace)}`,
      thirdPlace > 0 && `3rd: ${formatCurrency(thirdPlace)}`,
      Number(tournament.hostCommission) > 0 && `Host commission: ${formatCurrency(Number(tournament.hostCommission))}`,
    ].filter(Boolean);
    if (!confirm(`Approve & distribute prizes for "${tournament.title}"?\n\n${lines.join('\n')}\n\nThis credits winners' and the host's wallets instantly and cannot be undone.`)) return;
    setDistributing(true);
    setRegisterError('');
    setMessage('');
    try {
      const res = await adminApi.distributePrizes(tournament.id);
      setMessage(res.message || 'Prizes distributed!');
      window.location.reload();
    } catch (err) {
      setRegisterError(getErrorMessage(err));
    } finally {
      setDistributing(false);
    }
  };

  const handleEndTournament = async () => {
    if (!confirm('Mark this tournament as COMPLETED? This cannot be undone.')) return;
    setEndingTournament(true);
    setRegisterError('');
    setMessage('');
    try {
      await tournamentApi.complete(tournament!.id);
      setMessage('Tournament marked as completed!');
      window.location.reload();
    } catch (err) {
      setRegisterError(getErrorMessage(err));
    } finally {
      setEndingTournament(false);
    }
  };

  const handleCopyRoomDetails = async () => {
    if (!tournament?.roomId) return;
    const text = `Room ID: ${tournament.roomId}${tournament.roomPassword ? `\nPassword: ${tournament.roomPassword}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const checkTeammateUid = async (index: number, uid: string) => {
    const trimmed = uid.trim();
    if (!trimmed || trimmed.length < 3) {
      setTeammateStatus((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }
    if (trimmed === user?.freeFireId) {
      setTeammateStatus((prev) => ({
        ...prev,
        [index]: { loading: false, valid: false, error: 'You are already Captain in Slot #1.' },
      }));
      return;
    }
    // Check if duplicate with other slots
    const otherSlots = teammateUids.filter((_, i) => i !== index).map((u) => u.trim());
    if (otherSlots.includes(trimmed)) {
      setTeammateStatus((prev) => ({
        ...prev,
        [index]: { loading: false, valid: false, error: 'This Free Fire ID is already entered in another slot.' },
      }));
      return;
    }

    setTeammateStatus((prev) => ({ ...prev, [index]: { loading: true } }));
    try {
      const res = await tournamentApi.checkPlayer(trimmed, tournament?.requiredLevel || tournament?.minLevel || 0);
      if (res.success && res.data) {
        setTeammateStatus((prev) => ({
          ...prev,
          [index]: { loading: false, valid: true, info: res.data },
        }));
      } else {
        setTeammateStatus((prev) => ({
          ...prev,
          [index]: { loading: false, valid: false, error: res.message || 'Verification failed' },
        }));
      }
    } catch (err) {
      setTeammateStatus((prev) => ({
        ...prev,
        [index]: { loading: false, valid: false, error: getErrorMessage(err) },
      }));
    }
  };

  const updateTeammateUid = (index: number, val: string) => {
    const next = [...teammateUids];
    next[index] = val;
    setTeammateUids(next);
  };

  const handleRegister = async () => {
    if (!user) { router.push('/login'); return; }
    setRegistering(true);
    setRegisterError('');
    setMessage('');
    try {
      const isDuoFormat = tournament?.format === 'DUO';
      const isSquadFormat = tournament?.format === 'SQUAD';
      const isTeam = isDuoFormat || isSquadFormat;
      const slots = isDuoFormat ? 1 : (isSquadFormat ? 3 : 0);

      if (isTeam) {
        const activeTeammates = teammateUids.slice(0, slots).map((u) => u.trim());
        if (activeTeammates.some((u) => !u)) {
          setRegisterError(`Please enter Free Fire IDs for all ${slots} teammate slot(s).`);
          setRegistering(false);
          return;
        }
        for (let i = 0; i < slots; i++) {
          const st = teammateStatus[i];
          if (!st?.valid) {
            setRegisterError(`Slot #${i + 2} (${activeTeammates[i]}) is not verified or does not meet requirements.`);
            setRegistering(false);
            return;
          }
        }
        const teamUids = [user.freeFireId || '', ...activeTeammates];
        await tournamentApi.register(id, undefined, teamUids, teamName.trim() || undefined);
      } else {
        await tournamentApi.register(id);
      }
      setMessage('Successfully registered!');
      window.location.reload();
    } catch (err) {
      setRegisterError(getErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    if (user) {
      userApi.stats().then((res) => setMyStats(res.data || null)).catch(() => {});
    }
  }, [user]);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>;
  }

  if (error || !tournament) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-zinc-400">{error || 'Tournament not found'}</p>
        <Link href="/tournaments" className="text-fire-400 mt-4 inline-block">Back to tournaments</Link>
      </div>
    );
  }

  const isDuo = tournament.format === 'DUO';
  const isSquad = tournament.format === 'SQUAD';
  const isTeam = isDuo || isSquad;
  const teammateCount = isDuo ? 1 : (isSquad ? 3 : 0);
  const teamMultiplier = isTeam ? (isDuo ? 2 : 4) : 1;

  const entryFee = typeof tournament.entryFee === 'string' ? parseFloat(tournament.entryFee) : tournament.entryFee;
  const totalTeamEntryFee = entryFee * teamMultiplier;
  const walletBalance = user?.wallet?.balance ?? 0;
  const hasSufficientBalance = totalTeamEntryFee === 0 || walletBalance >= totalTeamEntryFee;
  const prizePool = typeof tournament.prizePool === 'string' ? parseFloat(tournament.prizePool) : tournament.prizePool;
  const entryCount = tournament._count?.entries ?? 0;
  const isSlotsFull = tournament.maxParticipants > 0 && entryCount >= tournament.maxParticipants;
  const allTeammatesValid = !isTeam || (
    teammateUids.slice(0, teammateCount).every((u, idx) => u.trim().length >= 3 && teammateStatus[idx]?.valid === true)
  );
  const mapTheme = getMapTheme(tournament.mapName);
  const isEnded = tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED' || tournament.status === 'PAID';
  const effectiveStatus = getEffectiveStatus(tournament);
  const now = Date.now();
  const startTimeMs = tournament.startTime ? new Date(tournament.startTime).getTime() : 0;
  const registrationEndMs = tournament.registrationEnd ? new Date(tournament.registrationEnd).getTime() : 0;
  const startTimeReached = startTimeMs > 0 && startTimeMs <= now;
  const registrationEndReached = registrationEndMs > 0 && registrationEndMs <= now;
  const oneHourPastStart = startTimeMs > 0 && now >= startTimeMs + TOURNAMENT_PLAY_GRACE_MS;
  const isCompletedState = isEnded || effectiveStatus === 'Ended' || oneHourPastStart;
  const isLiveAndPlaying = !isCompletedState && (tournament.status === 'ACTIVE' || effectiveStatus === 'Playing' || effectiveStatus === 'Live' || startTimeReached);
  const isRegistrationClosed = !isCompletedState && !isLiveAndPlaying && (isSlotsFull || registrationEndReached || tournament.status !== 'REGISTRATION');
  const canEndTournament = !isEnded && startTimeReached && (isSuperAdmin || isAdmin || user?.id === tournament.creatorId);

  console.log('[TournamentView] status:', tournament.status, 'effectiveStatus:', effectiveStatus, 'isSlotsFull:', isSlotsFull, 'isCompletedState:', isCompletedState, 'isLiveAndPlaying:', isLiveAndPlaying, 'isRegistrationClosed:', isRegistrationClosed);

  const rawFirst = tournament.prizeFirst != null ? Number(tournament.prizeFirst) : 0;
  const rawSecond = tournament.prizeSecond != null ? Number(tournament.prizeSecond) : 0;
  const rawThird = tournament.prizeThird != null ? Number(tournament.prizeThird) : 0;

  const hasStoredBreakdown = rawFirst > 0;

  const firstPlace = hasStoredBreakdown ? rawFirst : Math.round(prizePool * 0.5);
  const secondPlace = rawSecond > 0 ? rawSecond : (hasStoredBreakdown ? 0 : Math.round(prizePool * 0.3));
  const thirdPlace = rawThird > 0 ? rawThird : (hasStoredBreakdown ? 0 : Math.round(prizePool * 0.2));

  const prizes = [
    { place: '1st', label: isTeam ? '1st Winning Team' : '1st Place', value: firstPlace, color: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-yellow-500/10' },
    ...(secondPlace > 0 ? [{ place: '2nd', label: isTeam ? '2nd Winning Team' : '2nd Place', value: secondPlace, color: 'text-zinc-300', bg: 'bg-zinc-500/5', border: 'border-zinc-500/10' }] : []),
    ...(thirdPlace > 0 ? [{ place: '3rd', label: isTeam ? '3rd Winning Team' : '3rd Place', value: thirdPlace, color: 'text-amber-500', bg: 'bg-amber-500/5', border: 'border-amber-500/10' }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Main Tournament Hero Card */}
        <div className="rounded-3xl overflow-hidden bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.6)] fire-glow relative">
          
          {/* Banner Media & Map Backdrop */}
          <div className="relative h-52 sm:h-60 overflow-hidden">
            {mapTheme.image && (
              <Image
                src={mapTheme.image}
                alt={mapTheme.label}
                fill
                className="object-cover scale-105 transition-transform duration-700 hover:scale-100"
                priority
              />
            )}
            {/* Multi-stage dark glass scrim with subtle ambient gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-black/40 backdrop-blur-[1px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/60" />

            {/* Top Status & Mode Tags */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-2 flex-wrap">
              <TournamentTags
                items={[
                  { label: effectiveStatus, color: getStatusColor(effectiveStatus), icon: tagIcons.status },
                  { label: tournament.format, color: tagColorMap.format[tournament.format as keyof typeof tagColorMap.format], icon: tagIcons.format },
                  { label: tournament.platform === 'MOBILE' ? 'Mobile' : 'PC', color: tagColorMap.platform[tournament.platform as keyof typeof tagColorMap.platform], icon: tagIcons.platform },
                  { label: tournament.gameMode === 'FULL_MAP' ? 'Full Map' : 'Clash Squad', color: tagColorMap.gameMode[tournament.gameMode as keyof typeof tagColorMap.gameMode], icon: tagIcons.gameMode },
                ]}
                className="justify-start drop-shadow-md"
              />

              {/* Pulsing indicator if LIVE */}
              {isLiveAndPlaying && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/50 backdrop-blur-md shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="absolute -inset-1 rounded-full bg-red-500/50 blur-xs animate-pulse" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_8px_#ef4444]" />
                  </span>
                  <span className="text-[11px] font-black tracking-wider uppercase text-red-400">
                    {effectiveStatus === 'Playing' ? 'Playing Now' : 'Live Match'}
                  </span>
                </div>
              )}
            </div>

            {/* Title & Host Meta */}
            <div className="absolute bottom-5 left-5 right-5 z-10">
              <h1 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
                {tournament.title}
              </h1>
              <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs text-zinc-300 flex-wrap">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tournament.uid);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md transition-all font-mono text-zinc-200 hover:text-white"
                  title="Copy UID"
                >
                  <span className="text-fire-400 font-bold">UID:</span> {tournament.uid}
                  {copied ? <ClipboardCheck className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                </button>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                  <span className="text-zinc-400">Host:</span>
                  <span className="text-white font-semibold">{tournament.creator?.username || tournament.creatorId}</span>
                </div>
                {canDeleteTournament && (
                  <button
                    onClick={handleDeleteTournament}
                    disabled={deletingTournament}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 hover:text-white backdrop-blur-md transition-all text-xs font-semibold disabled:opacity-50 ml-auto"
                    title="Delete Tournament"
                  >
                    {deletingTournament ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                    <span>{deletingTournament ? 'Deleting...' : 'Delete Tournament'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-7 bg-zinc-950/60">
            {tournament.description && (
              <div className="p-4 rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/5">
                <p className="text-zinc-300 text-sm leading-relaxed">{tournament.description}</p>
              </div>
            )}

            {/* Prize Pool Glassmorphism Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-yellow-400" /> Prize Distribution
                </h2>
                <span className="text-xs font-medium text-zinc-500">
                  Total Pool: <span className="font-bold text-zinc-300">{formatCurrency(prizePool)}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {prizes.map((p) => {
                  const is1st = p.place === '1st';
                  const is2nd = p.place === '2nd';
                  return (
                    <div
                      key={p.place}
                      className={`relative overflow-hidden rounded-2xl p-4 backdrop-blur-xl border transition-all duration-300 hover:scale-[1.02] ${
                        is1st
                          ? 'bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-zinc-950/60 border-yellow-500/30 shadow-[0_0_25px_rgba(234,179,8,0.12)]'
                          : is2nd
                          ? 'bg-gradient-to-br from-zinc-300/10 via-slate-400/5 to-zinc-950/60 border-zinc-400/25 shadow-[0_0_20px_rgba(200,200,200,0.08)]'
                          : 'bg-gradient-to-br from-amber-600/10 via-orange-600/5 to-zinc-950/60 border-amber-600/25 shadow-[0_0_20px_rgba(217,119,6,0.08)]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`p-2.5 rounded-xl shrink-0 backdrop-blur-md ${
                            is1st
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shadow-[0_0_12px_rgba(234,179,8,0.25)]'
                              : is2nd
                              ? 'bg-zinc-400/15 text-zinc-200 border border-zinc-400/25'
                              : 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                          }`}
                        >
                          <Trophy className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{p.label}</p>
                          <p
                            className={`text-lg sm:text-xl font-black tracking-tight ${
                              is1st
                                ? 'bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(234,179,8,0.3)]'
                                : is2nd
                                ? 'bg-gradient-to-r from-zinc-100 via-slate-200 to-zinc-400 bg-clip-text text-transparent'
                                : 'bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent'
                            }`}
                          >
                            {formatCurrency(p.value)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Info Cards Grid — Floating Glassmorphic Cards with Gradient Typography */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Match Overview</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {[
                  {
                    icon: IndianRupee,
                    label: 'Entry Fee',
                    value: entryFee === 0 ? 'FREE' : formatCurrency(entryFee),
                    iconBg: entryFee === 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-fire-500/10 text-fire-400 border-fire-500/20',
                    gradientClass: entryFee === 0
                      ? 'bg-gradient-to-r from-emerald-300 via-teal-300 to-green-400 bg-clip-text text-transparent font-black text-base'
                      : 'bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-400 bg-clip-text text-transparent font-black text-base',
                  },
                  {
                    icon: Users,
                    label: tournament.teamSize ? 'Team Size' : 'Participants',
                    value: tournament.teamSize ? tournament.teamSize : isSlotsFull ? `${entryCount}/${tournament.maxParticipants} (Full)` : `${entryCount}/${tournament.maxParticipants}`,
                    iconBg: isSlotsFull ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                    gradientClass: isSlotsFull
                      ? 'bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent font-black text-base'
                      : 'bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-300 bg-clip-text text-transparent font-black text-base',
                  },
                  {
                    icon: MapPin,
                    label: 'Map Arena',
                    value: tournament.mapName || 'TBA',
                    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                    gradientClass: 'bg-gradient-to-r from-purple-300 via-fuchsia-300 to-pink-400 bg-clip-text text-transparent font-bold text-base',
                  },
                  {
                    icon: Clock,
                    label: 'Start Time',
                    value: formatDate(tournament.startTime),
                    iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    gradientClass: 'bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent font-semibold text-sm',
                  },
                  {
                    icon: Clock,
                    label: 'Registration Deadline',
                    value: formatDate(tournament.registrationEnd),
                    iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                    gradientClass: 'bg-gradient-to-r from-rose-300 via-orange-300 to-amber-400 bg-clip-text text-transparent font-semibold text-sm',
                  },
                  {
                    icon: Shield,
                    label: 'Min Level Required',
                    value: Number(tournament.requiredLevel || tournament.minLevel) > 0 ? `Level ${tournament.requiredLevel || tournament.minLevel}+` : 'No Restriction',
                    iconBg: Number(tournament.requiredLevel || tournament.minLevel) > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
                    gradientClass: Number(tournament.requiredLevel || tournament.minLevel) > 0
                      ? 'bg-gradient-to-r from-emerald-300 via-teal-300 to-green-400 bg-clip-text text-transparent font-black text-base'
                      : 'text-zinc-400 font-semibold text-sm',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="group relative overflow-hidden rounded-2xl p-4 bg-zinc-900/50 hover:bg-zinc-900/80 backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-[0_8px_25px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 flex items-center gap-3.5"
                  >
                    <div className={`p-2.5 rounded-xl border backdrop-blur-md shrink-0 transition-transform duration-300 group-hover:scale-110 ${item.iconBg}`}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 truncate">{item.label}</p>
                      <p className={`truncate mt-0.5 ${item.gradientClass}`}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Registration Box for DUO & SQUAD */}
            {isTeam && tournament.status === 'REGISTRATION' && !isRegistrationClosed && !isCompletedState && !isLiveAndPlaying && !tournament.isRegistered && (
              <div className="p-6 rounded-2xl bg-zinc-900/70 backdrop-blur-xl border border-blue-500/30 shadow-[0_0_25px_rgba(59,130,246,0.12)] space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-fire-400" />
                    <span>{isDuo ? 'Duo' : 'Squad'} Team Registration</span>
                    <span className="text-xs font-normal text-zinc-400">({isDuo ? '2 Players' : '4 Players'})</span>
                  </h3>
                  {Number(tournament.requiredLevel) > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                      Min Level: {tournament.requiredLevel}+
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400">
                  Enter pre-verified Free Fire IDs for your teammates. All teammates must be registered on Neobattle, verified, and meet the tournament&apos;s level requirement.
                </p>

                {/* Team Name Input */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Team Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder={`e.g., ${user?.username}'s Team`}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:border-fire-500/50 transition-all"
                  />
                </div>

                <div className="space-y-3">
                  {/* Slot #1: Captain (You) */}
                  <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                        Captain
                      </span>
                      <span className="text-sm font-semibold text-white truncate">{user?.username}</span>
                      {user?.ign && (
                        <span className="text-xs font-mono text-zinc-400 truncate">({user.ign})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">
                        UID: {user?.freeFireId || '—'}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-semibold">Lvl {user?.gameLevel ?? 0}</span>
                    </div>
                  </div>

                  {/* Teammate Slots */}
                  {Array.from({ length: teammateCount }).map((_, i) => {
                    const status = teammateStatus[i];
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-zinc-500 w-16 shrink-0">Slot #{i + 2}</span>
                          <input
                            type="text"
                            value={teammateUids[i]}
                            onChange={(e) => updateTeammateUid(i, e.target.value)}
                            onBlur={() => checkTeammateUid(i, teammateUids[i])}
                            placeholder={`Teammate ${i + 1} Free Fire ID`}
                            className={`flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border text-white text-sm font-mono focus:outline-none transition-all ${
                              status?.valid === true
                                ? 'border-emerald-500/50 focus:border-emerald-400'
                                : status?.valid === false
                                ? 'border-rose-500/50 focus:border-rose-400'
                                : 'border-white/10 focus:border-fire-500/50'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => checkTeammateUid(i, teammateUids[i])}
                            disabled={status?.loading || !teammateUids[i]?.trim()}
                            className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 disabled:opacity-40 transition-all shrink-0"
                          >
                            {status?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
                          </button>
                        </div>

                        {/* Status Feedback */}
                        {status?.valid === true && status.info && (
                          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-semibold">{status.info.username}</span>
                            {status.info.ign && <span className="font-mono text-zinc-400">({status.info.ign})</span>}
                            <span className="ml-auto font-semibold text-emerald-300">Level {status.info.gameLevel}</span>
                          </div>
                        )}
                        {status?.valid === false && status.error && (
                          <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{status.error}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rules Box */}
            {tournament.rules && (
              <div className="p-5 rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Tournament Rules</h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{tournament.rules}</p>
              </div>
            )}

            {/* Registered Teams / Participants Section */}
            {tournament.entries && tournament.entries.length > 0 && (
              <div className="p-6 rounded-2xl bg-zinc-900/50 backdrop-blur-xl border border-white/10 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-fire-400" />
                  <span>{isTeam ? 'Registered Teams' : 'Registered Participants'} ({tournament.entries.length})</span>
                </h3>

                {isTeam ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {tournament.entries.map((entry: any) => {
                      const tName = entry.team?.name || `${entry.user?.username || 'Player'}'s Team`;
                      const members = entry.team?.members || [];
                      return (
                        <div key={entry.id} className="p-4 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all">
                          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/5">
                            <span className="font-bold text-white text-sm truncate">{tName}</span>
                            {entry.placement && (
                              <span className="px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400 text-xs font-bold font-mono">
                                #{entry.placement}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {members.length > 0 ? (
                              members.map((m: any, idx: number) => (
                                <div key={m.id || idx} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-zinc-500 font-mono">#{idx + 1}</span>
                                    <span className="text-zinc-200 font-medium truncate">{m.user?.username}</span>
                                    {m.user?.ign && <span className="text-zinc-500 font-mono truncate">({m.user.ign})</span>}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-zinc-400 text-[11px]">{m.user?.freeFireId}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-emerald-400 font-semibold">Lvl {m.user?.gameLevel || 0}</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-300">{entry.user?.username}</span>
                                <span className="font-mono text-zinc-500">{entry.user?.freeFireId}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {tournament.entries.map((entry: any) => (
                      <div key={entry.id} className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-white font-medium truncate">{entry.user?.username}</span>
                          {entry.user?.ign && <span className="text-zinc-500 truncate">({entry.user.ign})</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-zinc-400">{entry.user?.freeFireId}</span>
                          {entry.placement && <span className="text-yellow-400 font-bold">#{entry.placement}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {message && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm backdrop-blur-md">
                <CheckCircle className="w-4 h-4 shrink-0" /> {message}
              </div>
            )}
            {registerError && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-sm backdrop-blur-md">
                <AlertCircle className="w-4 h-4 shrink-0" /> {registerError}
              </div>
            )}

            {/* Admin / Host Action Controls */}
            {isEnded ? (
              <div className="w-full py-3.5 rounded-xl text-sm font-bold text-zinc-300 text-center bg-blue-500/10 border border-blue-500/25 backdrop-blur-md">
                <CheckCircle className="w-4 h-4 inline mr-1 text-blue-400" /> Tournament Completed
              </div>
            ) : canEndTournament && tournament.status !== 'CANCELLED' && (
              <button
                onClick={handleEndTournament}
                disabled={endingTournament}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 backdrop-blur-md transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
              >
                {endingTournament ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                {endingTournament ? 'Ending Tournament...' : 'End Tournament'}
              </button>
            )}

            {isSuperAdmin && tournament.status === 'COMPLETED' && (
              <button
                onClick={handleDistributePrizes}
                disabled={distributing}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 backdrop-blur-md transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
              >
                {distributing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
                {distributing ? 'Distributing Prizes...' : 'Approve & Distribute Prizes'}
              </button>
            )}

            {canDeleteTournament && (
              <button
                onClick={handleDeleteTournament}
                disabled={deletingTournament}
                className="w-full py-3 rounded-xl text-sm font-bold text-rose-300 hover:text-white flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 backdrop-blur-md transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(244,63,94,0.1)]"
              >
                {deletingTournament ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-rose-400" />}
                {deletingTournament ? 'Deleting Tournament...' : 'Delete Tournament'}
              </button>
            )}

            {/* Host Result Submission Glass Card */}
            {isHostCreator && mySubmission?.status === 'PENDING' && (
              <div className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300 flex items-center gap-2 backdrop-blur-md">
                <Clock className="w-4 h-4 shrink-0" /> Results submitted — awaiting admin approval &amp; payout.
              </div>
            )}
            {isHostCreator && mySubmission?.status === 'APPROVED' && (
              <div className="w-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-300 flex items-center gap-2 backdrop-blur-md">
                <CheckCircle className="w-4 h-4 shrink-0" /> Results approved — prizes have been distributed.
              </div>
            )}
            {isHostCreator && mySubmission?.status === 'REJECTED' && (
              <div className="w-full p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-sm text-rose-300 backdrop-blur-md mb-1">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Results rejected{mySubmission.rejectionReason ? `: ${mySubmission.rejectionReason}` : ''} — edit below and resubmit.
              </div>
            )}
            {canSubmitResults && (
              <div className="p-6 rounded-2xl bg-zinc-900/70 backdrop-blur-xl border border-white/10 space-y-4 shadow-xl">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" /> Submit Tournament Results
                </h3>
                <p className="text-xs text-zinc-400">Enter the Free Fire UIDs of your winners. Each UID must belong to a registered Neobattle participant.</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  {([
                    [isTeam ? '1st Winning Team' : '1st Place', 'first', '🥇'],
                    [isTeam ? '2nd Winning Team (optional)' : '2nd Place (optional)', 'second', '🥈'],
                    [isTeam ? '3rd Winning Team (optional)' : '3rd Place (optional)', 'third', '🥉']
                  ] as const).map(([label, key, medal]) => (
                    <div key={key}>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">{medal} {label}</label>
                      <input
                        type="text"
                        value={resUids[key]}
                        onChange={(e) => setResUids((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={isTeam ? "Winner Team/Player UID" : "Winner UID"}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm font-mono focus:border-fire-500/50 focus:outline-none transition-all"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Winning Proof Screenshot</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleResultScreenshot}
                    className="block w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:bg-fire-500/20 file:text-fire-400 file:text-xs file:font-semibold hover:file:bg-fire-500/30 transition-all cursor-pointer"
                  />
                </div>
                <button
                  onClick={handleSubmitResult}
                  disabled={submittingResult || !resUids.first.trim() || (!resFile && !mySubmission?.screenshotUrl)}
                  className="btn-fire w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-50 shadow-[0_0_25px_rgba(59,130,246,0.3)] transition-all"
                >
                  {submittingResult ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <CheckCircle className="w-4 h-4 inline mr-2" />}
                  {submittingResult ? 'Submit Results for Review' : 'Submit Results for Review'}
                </button>
              </div>
            )}

            {/* Registration / Active / Live Status Section */}
            {isCompletedState ? (
              <div className="w-full p-5 rounded-2xl bg-blue-950/30 border border-blue-500/25 backdrop-blur-xl text-center text-sm text-blue-300">
                <CheckCircle className="w-4 h-4 inline mr-1 text-blue-400" />
                This tournament has ended
                {tournament.status === 'PAID' ? ' and prizes have been distributed' : ''}. Registration is closed.
              </div>
            ) : isLiveAndPlaying && !tournament.isRegistered ? (
              /* Pulsing Neon Live & Playing Banner for Unregistered Users */
              <div className="w-full p-6 rounded-2xl bg-gradient-to-r from-red-950/40 via-red-900/25 to-red-950/40 border border-red-500/40 backdrop-blur-xl shadow-[0_0_30px_rgba(239,68,68,0.2)] text-center relative overflow-hidden">
                <div className="flex items-center justify-center gap-3">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="absolute -inset-1 rounded-full bg-red-500/50 blur-sm animate-pulse" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 shadow-[0_0_12px_#ef4444]" />
                  </span>
                  <span className="text-lg font-black tracking-wider uppercase bg-gradient-to-r from-red-400 via-rose-300 to-red-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]">
                    Live &amp; Playing
                  </span>
                </div>
                <p className="text-zinc-400 text-xs mt-1.5 font-medium">This tournament has already commenced. Registration is closed.</p>
              </div>
            ) : tournament.isRegistered ? (
              /* Registered User Glassmorphic Status Box */
              <div className="flex flex-col items-center gap-3.5 p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-emerald-900/15 to-zinc-950/70 border border-emerald-500/30 backdrop-blur-xl shadow-[0_0_25px_rgba(16,185,129,0.12)]">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                  <CheckCircle className="w-5 h-5" /> You are registered for this tournament
                </div>

                {isLiveAndPlaying && (
                  <div className="w-full flex items-center justify-center gap-2.5 p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 backdrop-blur-md shadow-[0_0_15px_rgba(239,68,68,0.2)] text-red-300 text-xs font-black uppercase tracking-wider">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="absolute -inset-1 rounded-full bg-red-500/60 blur-xs animate-pulse" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_8px_#ef4444]" />
                    </span>
                    Tournament is Live &amp; Playing
                  </div>
                )}

                {tournament.canSeeRoom && tournament.roomId ? (
                  <div className="w-full mt-2 p-4 rounded-xl bg-black/50 border border-white/10 backdrop-blur-md space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400 font-semibold uppercase">Room ID:</span>
                      <span className="text-white font-mono font-bold text-sm tracking-wider px-2 py-0.5 rounded bg-white/10">{tournament.roomId}</span>
                    </div>
                    {tournament.roomPassword && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400 font-semibold uppercase">Password:</span>
                        <span className="text-white font-mono font-bold text-sm tracking-wider px-2 py-0.5 rounded bg-white/10">{tournament.roomPassword}</span>
                      </div>
                    )}
                    <button
                      onClick={handleCopyRoomDetails}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition-all shadow-sm"
                    >
                      {copied ? <><ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied Room Credentials!</> : <><Copy className="w-3.5 h-3.5" /> Copy Room Details</>}
                    </button>
                  </div>
                ) : (
                  <div className="w-full mt-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center backdrop-blur-sm">
                    <Clock className="w-4 h-4 inline mr-1.5" />
                    Room details will be unlocked 5 minutes prior to match start.
                  </div>
                )}
                {myStats && <LeagueBadge wins={myStats.totalWins} size="md" />}
              </div>
            ) : isRegistrationClosed ? (
              /* Slots Full or Registration Closed Banner */
              <div className="w-full p-5 rounded-2xl bg-zinc-900/60 border border-zinc-700/40 backdrop-blur-xl text-center text-sm text-zinc-300">
                {isSlotsFull ? (
                  <>
                    <Users className="w-4 h-4 inline mr-1.5 text-amber-400" />
                    <span className="font-bold text-amber-400">Slots Full:</span> All {tournament.maxParticipants} participant slots for this tournament have been filled. Registration is now closed.
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 inline mr-1.5 text-amber-400" />
                    Registration has closed for this tournament. Match will begin shortly.
                  </>
                )}
              </div>
            ) : !user ? (
              <button
                onClick={() => router.push('/login')}
                className="w-full py-4 rounded-2xl text-base font-black text-white flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-neo-500 to-orange-500 hover:from-blue-500 hover:to-orange-400 transition-all shadow-[0_0_30px_rgba(59,130,246,0.35)] hover:scale-[1.01]"
              >
                <Trophy className="w-5 h-5 text-yellow-300" /> Login to Register
              </button>
            ) : (Number(tournament.requiredLevel || tournament.minLevel) > 0) && !user.isVerified ? (
              <button
                disabled
                className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 bg-zinc-800/80 border border-white/5 text-zinc-400 cursor-not-allowed opacity-60 backdrop-blur-md"
              >
                <AlertCircle className="w-5 h-5 text-rose-400" /> Please verify your Free Fire ID first
              </button>
            ) : (Number(tournament.requiredLevel || tournament.minLevel) > 0) && user.gameLevel < Number(tournament.requiredLevel || tournament.minLevel) ? (
              <button
                disabled
                className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 bg-zinc-800/80 border border-white/5 text-zinc-400 cursor-not-allowed opacity-60 backdrop-blur-md"
              >
                <AlertCircle className="w-5 h-5 text-rose-400" /> Level too low (Required: Level {tournament.requiredLevel || tournament.minLevel}, Yours: Level {user.gameLevel})
              </button>
            ) : totalTeamEntryFee > 0 && !hasSufficientBalance ? (
              <div className="space-y-3">
                <button
                  disabled
                  className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 bg-zinc-800/80 border border-white/5 text-zinc-400 cursor-not-allowed opacity-60 backdrop-blur-md"
                >
                  <AlertCircle className="w-5 h-5 text-amber-400" /> Insufficient Wallet Balance
                </button>
                <Link
                  href="/wallet"
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 backdrop-blur-md transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                >
                  <Wallet className="w-4 h-4 text-emerald-400" /> Top-Up Wallet ({formatCurrency(totalTeamEntryFee)})
                </Link>
              </div>
            ) : totalTeamEntryFee > 0 ? (
              <button
                onClick={handleRegister}
                disabled={registering || (isTeam && !allTeammatesValid)}
                className="w-full py-4 rounded-2xl text-base font-black text-white disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-neo-500 to-orange-500 hover:from-blue-500 hover:to-orange-400 transition-all shadow-[0_0_30px_rgba(59,130,246,0.35)] hover:scale-[1.01]"
              >
                {registering ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Registering Team...</>
                ) : (
                  <><Trophy className="w-5 h-5 text-yellow-300" /> Register with Wallet ({formatCurrency(totalTeamEntryFee)})</>
                )}
              </button>
            ) : (
              <button
                onClick={handleRegister}
                disabled={registering || (isTeam && !allTeammatesValid)}
                className="w-full py-4 rounded-2xl text-base font-black text-white disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-neo-500 to-orange-500 hover:from-blue-500 hover:to-orange-400 transition-all shadow-[0_0_30px_rgba(59,130,246,0.35)] hover:scale-[1.01]"
              >
                {registering ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Registering...</>
                ) : (
                  <><Trophy className="w-5 h-5 text-yellow-300" /> Register for Free Match</>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}