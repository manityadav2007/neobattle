'use client';

import { useEffect, use, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, Users, MapPin, Clock, ArrowLeft, IndianRupee,
  CheckCircle, AlertCircle, Loader2, Gamepad2, Copy, ClipboardCheck, Smartphone,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTournament } from '@/hooks/useTournaments';
import TournamentTags, { tagColorMap, tagIcons } from '@/components/TournamentTags';
import { tournamentApi, gameApi, userApi, formatCurrency, formatDate, getMapTheme, type UserStats } from '@/lib/services';
import UpiPayment from '@/components/RazorpayCheckout';
import { getErrorMessage } from '@/lib/api';
import LeagueBadge from '@/components/LeagueBadge';

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isSuperAdmin } = useAuth();
  const { tournament, loading, error } = useTournament(id);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [registerError, setRegisterError] = useState('');

  const [myStats, setMyStats] = useState<UserStats | null>(null);
  const [squadUids, setSquadUids] = useState<string[]>(['', '', '', '']);
  const [squadIgns, setSquadIgns] = useState<(string | null)[]>([null, null, null, null]);
  const [fetchingIgn, setFetchingIgn] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [endingTournament, setEndingTournament] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);

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

  const handleRegister = async () => {
    if (!user) { router.push('/login'); return; }
    setRegistering(true);
    setRegisterError('');
    setMessage('');
    try {
      if (tournament?.format === 'SQUAD') {
        await tournamentApi.register(id, undefined, squadUids);
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

  const handleFetchIgn = async (index: number) => {
    const uid = squadUids[index];
    if (!uid || uid.length < 5) return;
    setFetchingIgn(index);
    try {
      const res = await gameApi.fetchProfile(uid);
      const newIgns = [...squadIgns];
      newIgns[index] = res.data?.ign || null;
      setSquadIgns(newIgns);
    } catch {
      const newIgns = [...squadIgns];
      newIgns[index] = null;
      setSquadIgns(newIgns);
    } finally {
      setFetchingIgn(null);
    }
  };

  const updateSquadUid = (index: number, value: string) => {
    const newUids = [...squadUids];
    newUids[index] = value;
    setSquadUids(newUids);
    setSquadIgns(prev => { const n = [...prev]; n[index] = null; return n; });
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

  const entryFee = typeof tournament.entryFee === 'string' ? parseFloat(tournament.entryFee) : tournament.entryFee;
  const walletBalance = user?.wallet?.balance ?? 0;
  const hasSufficientBalance = entryFee === 0 || walletBalance >= entryFee;
  const prizePool = typeof tournament.prizePool === 'string' ? parseFloat(tournament.prizePool) : tournament.prizePool;
  const entryCount = tournament._count?.entries ?? 0;
  const isSquad = tournament.format === 'SQUAD';
  const allIgnsFetched = isSquad ? squadIgns.every((i) => i !== null) : true;
  const mapTheme = getMapTheme(tournament.mapName);
  const isEnded = tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED';

  console.log('[TournamentView] status:', tournament.status, 'isRegistered:', tournament.isRegistered, 'isEnded:', isEnded, 'entryFee:', entryFee, 'user:', user?.id);

  const rawFirst = tournament.prizeFirst != null ? Number(tournament.prizeFirst) : 0;
  const rawSecond = tournament.prizeSecond != null ? Number(tournament.prizeSecond) : 0;
  const rawThird = tournament.prizeThird != null ? Number(tournament.prizeThird) : 0;

  const hasStoredBreakdown = rawFirst > 0;

  const firstPlace = hasStoredBreakdown ? rawFirst : Math.round(prizePool * 0.5);
  const secondPlace = rawSecond > 0 ? rawSecond : (hasStoredBreakdown ? 0 : Math.round(prizePool * 0.3));
  const thirdPlace = rawThird > 0 ? rawThird : (hasStoredBreakdown ? 0 : Math.round(prizePool * 0.2));

  const prizes = [
    { place: '1st', label: '1st Place', value: firstPlace, color: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-yellow-500/10' },
    ...(secondPlace > 0 ? [{ place: '2nd', label: '2nd Place', value: secondPlace, color: 'text-zinc-300', bg: 'bg-zinc-500/5', border: 'border-zinc-500/10' }] : []),
    ...(thirdPlace > 0 ? [{ place: '3rd', label: '3rd Place', value: thirdPlace, color: 'text-amber-500', bg: 'bg-amber-500/5', border: 'border-amber-500/10' }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/tournaments" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Tournaments
        </Link>

        <div className="glass-card rounded-2xl overflow-hidden fire-glow">
          <div className="relative h-48 overflow-hidden">
            {mapTheme.image && (
              <Image src={mapTheme.image} alt={mapTheme.label} fill className="object-cover" priority />
            )}
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(59,130,246,0.35), rgba(249,115,22,0.2), rgba(10,10,15,0.7))` }} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(249,115,22,0.15),transparent_70%)]" />

            <div className="absolute top-4 left-4 right-4">
              <TournamentTags
                items={[
                  { label: tournament.status, color: tagColorMap.status[tournament.status as keyof typeof tagColorMap.status] || 'bg-zinc-500/20 text-zinc-400', icon: tagIcons.status },
                  { label: tournament.format, color: tagColorMap.format[tournament.format as keyof typeof tagColorMap.format], icon: tagIcons.format },
                  { label: tournament.platform === 'MOBILE' ? 'Mobile' : 'PC', color: tagColorMap.platform[tournament.platform as keyof typeof tagColorMap.platform], icon: tagIcons.platform },
                  { label: tournament.gameMode === 'FULL_MAP' ? 'Full Map' : 'Clash Squad', color: tagColorMap.gameMode[tournament.gameMode as keyof typeof tagColorMap.gameMode], icon: tagIcons.gameMode },
                ]}
                className="justify-center sm:justify-start"
              />
            </div>

            <div className="absolute bottom-6 left-6 right-6">
              <h1 className="text-3xl font-display font-black text-white drop-shadow-lg">{tournament.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-xs text-zinc-300">
                <button
                  onClick={() => navigator.clipboard.writeText(tournament.uid)}
                  className="flex items-center gap-1 hover:text-fire-400 transition-colors font-mono drop-shadow"
                  title="Copy UID"
                >
                  {tournament.uid} <Copy className="w-3 h-3" />
                </button>
                <span>Host: <span className="text-zinc-200">{tournament.creator?.username || tournament.creatorId}</span></span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {tournament.description && <p className="text-zinc-400 leading-relaxed">{tournament.description}</p>}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 grid sm:grid-cols-3 gap-4">
                {prizes.map((p) => (
                  <div key={p.place} className={`flex items-center gap-3 p-4 rounded-xl ${p.bg} border ${p.border}`}>
                    <Trophy className={`w-5 h-5 ${p.color} shrink-0`} />
                    <div><p className="text-xs text-zinc-500">{p.label}</p><p className="text-base font-bold text-white">{formatCurrency(p.value)}</p></div>
                  </div>
                ))}
              </div>
              {[
                { icon: IndianRupee, label: 'Entry Fee', value: entryFee === 0 ? 'FREE' : formatCurrency(entryFee), color: 'text-fire-400' },
                { icon: Users, label: tournament.teamSize ? 'Team Size' : 'Participants', value: tournament.teamSize ? tournament.teamSize : `${entryCount}/${tournament.maxParticipants}`, color: 'text-blue-400' },
                { icon: MapPin, label: 'Map', value: tournament.mapName || 'TBA', color: 'text-purple-400' },
                { icon: Clock, label: 'Start Time', value: formatDate(tournament.startTime), color: 'text-yellow-400' },
                { icon: Clock, label: 'Registration Ends', value: formatDate(tournament.registrationEnd), color: 'text-orange-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 p-4 rounded-xl bg-white/3">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                  <div><p className="text-xs text-zinc-500">{item.label}</p><p className="text-sm font-semibold text-white">{item.value}</p></div>
                </div>
              ))}
            </div>

            {isSquad && tournament.status === 'REGISTRATION' && !tournament.isRegistered && (
              <div className="p-4 rounded-xl bg-white/5 space-y-3">
                <p className="text-sm font-bold text-white flex items-center gap-2"><Gamepad2 className="w-4 h-4 text-fire-400" /> Squad Registration — Enter 4 UIDs</p>
                {squadUids.map((uid, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-6">#{i + 1}</span>
                    <input
                      type="text"
                      value={uid}
                      onChange={(e) => updateSquadUid(i, e.target.value)}
                      placeholder={`Player ${i + 1} UID`}
                      className="input-field flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleFetchIgn(i)}
                      disabled={fetchingIgn === i || uid.length < 5}
                      className="px-3 py-2 rounded-lg bg-fire-500/10 text-fire-400 text-xs font-medium hover:bg-fire-500/20 disabled:opacity-50"
                    >
                      {fetchingIgn === i ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Fetch'}
                    </button>
                    {squadIgns[i] && <span className="text-xs text-green-400 w-24 truncate">{squadIgns[i]}</span>}
                  </div>
                ))}
              </div>
            )}

            {tournament.rules && (
              <div className="p-4 rounded-xl bg-white/3">
                <h3 className="text-sm font-bold text-white mb-2">Rules</h3>
                <p className="text-sm text-zinc-400 whitespace-pre-wrap">{tournament.rules}</p>
              </div>
            )}

            {message && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> {message}</div>}
            {registerError && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm"><AlertCircle className="w-4 h-4" /> {registerError}</div>}

            {tournament.status === 'COMPLETED' ? (
              <div className="w-full py-3 rounded-xl text-sm font-bold text-white text-center bg-blue-500/20 border border-blue-500/30">
                <CheckCircle className="w-4 h-4 inline mr-1" /> Tournament Completed
              </div>
            ) : isSuperAdmin && tournament.status !== 'CANCELLED' && (
              <button
                onClick={handleEndTournament}
                disabled={endingTournament}
                className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 transition-all disabled:opacity-50"
              >
                {endingTournament ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                {endingTournament ? 'Ending...' : 'End Tournament'}
              </button>
            )}

            {tournament.isRegistered ? (
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-green-500/10">
                <div className="flex items-center gap-2 text-green-400 font-semibold">
                  <CheckCircle className="w-5 h-5" /> You are registered for this tournament
                </div>
                {tournament.canSeeRoom && tournament.roomId ? (
                  <div className="w-full mt-2 p-3 rounded-lg bg-white/5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Room ID:</span>
                      <span className="text-white font-mono font-bold">{tournament.roomId}</span>
                    </div>
                    {tournament.roomPassword && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-zinc-400">Password:</span>
                        <span className="text-white font-mono font-bold">{tournament.roomPassword}</span>
                      </div>
                    )}
                    <button
                      onClick={handleCopyRoomDetails}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 hover:text-white transition-colors"
                    >
                      {copied ? <><ClipboardCheck className="w-3.5 h-3.5 text-green-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Room Details</>}
                    </button>
                  </div>
                ) : (
                  <div className="w-full mt-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs text-center">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Room details will be available 5 minutes before the match starts.
                  </div>
                )}
                {myStats && <LeagueBadge wins={myStats.totalWins} size="md" />}
              </div>
            ) : !user ? (
              <button
                onClick={() => router.push('/login')}
                className="w-full py-4 rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-500 hover:to-orange-400 transition-all shadow-lg"
              >
                <Trophy className="w-5 h-5" /> Login to Register
              </button>
            ) : tournament.requiredLevel > 0 && !user.isVerified ? (
              <button
                disabled
                className="w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2 bg-gray-600 cursor-not-allowed opacity-50"
              >
                <AlertCircle className="w-5 h-5" /> Please verify your Free Fire ID first
              </button>
            ) : tournament.requiredLevel > 0 && user.gameLevel < tournament.requiredLevel ? (
              <button
                disabled
                className="w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2 bg-gray-600 cursor-not-allowed opacity-50"
              >
                <AlertCircle className="w-5 h-5" /> Level too low (req: {tournament.requiredLevel}, yours: {user.gameLevel})
              </button>
            ) : entryFee > 0 && !hasSufficientBalance ? (
              <div className="space-y-2">
                <button
                  disabled
                  className="w-full py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2 bg-gray-600 cursor-not-allowed opacity-50"
                >
                  <AlertCircle className="w-5 h-5" /> Insufficient Balance
                </button>
                <button
                  onClick={() => setShowUpiModal(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 transition-all"
                >
                  <Smartphone className="w-4 h-4" /> Pay ₹{entryFee} via UPI
                </button>
              </div>
            ) : entryFee > 0 ? (
              <div className="space-y-2">
                <button
                  onClick={handleRegister}
                  disabled={registering || (isSquad && !allIgnsFetched)}
                  className="w-full py-4 rounded-xl text-base font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-500 hover:to-orange-400 transition-all shadow-lg"
                >
                  {registering ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Registering...</>
                  ) : (
                    <><Trophy className="w-5 h-5" /> Register with Wallet (₹{entryFee})</>
                  )}
                </button>
                <button
                  onClick={() => setShowUpiModal(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 transition-all"
                >
                  <Smartphone className="w-4 h-4" /> Pay via UPI
                </button>
              </div>
            ) : (
              <button
                onClick={handleRegister}
                disabled={registering || (isSquad && !allIgnsFetched)}
                className="w-full py-4 rounded-xl text-base font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-500 hover:to-orange-400 transition-all shadow-lg"
              >
                {registering ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Registering...</>
                ) : (
                  <><Trophy className="w-5 h-5" /> Register {entryFee > 0 ? `(${formatCurrency(entryFee)}${isSquad ? ' each' : ''})` : '(Free)'}</>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {showUpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowUpiModal(false)}>
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-400" /> Pay via UPI
            </h3>
            <UpiPayment amount={entryFee} tournamentId={id} onSuccess={() => { setShowUpiModal(false); setMessage('Payment submitted! Admin will verify shortly.'); }} />
          </div>
        </div>
      )}
    </div>
  );
}