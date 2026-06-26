'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Trophy, Users, Radio, Shield, AlertCircle, CheckCircle,
  Upload, Loader2, X, Calendar, Crown, Ban, Clock, MapPin, Smartphone, Monitor, Gamepad2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { esportsApi, uploadApi, gameApi, type EsportsSeason, type EsportsTeam, formatDate } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface UidField {
  uid: string;
  ign: string;
  level: number;
  loading: boolean;
  error: string;
}

function CountdownTimer({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const target = new Date(deadline).getTime();
    const tick = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setRemaining('Ended');
        setExpired(true);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (expired) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-500/20">
      <Clock className="w-3.5 h-3.5" />
      Registration ends in: {remaining}
    </div>
  );
}

function MatchScheduleCard({ season }: { season: EsportsSeason }) {
  return (
    <div className="glass-card rounded-2xl p-6 border border-cyan-500/20">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-cyan-400" />
        Match Schedule
      </h2>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Date & Time</p>
          <p className="text-white font-semibold">{season.matchDate ? formatDate(season.matchDate) : 'TBD'}</p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Map</p>
          <p className="text-white font-semibold flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-cyan-400" />
            {season.matchMap || 'TBD'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Mode</p>
          <p className="text-white font-semibold flex items-center gap-1.5">
            {season.matchMode === 'Clash Squad' ? <Gamepad2 className="w-4 h-4 text-green-400" /> : <Radio className="w-4 h-4 text-fire-400" />}
            {season.matchMode || 'TBD'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function EsportsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const [season, setSeason] = useState<EsportsSeason | null>(null);
  const [myTeam, setMyTeam] = useState<EsportsTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState<UidField[]>([
    { uid: '', ign: '', level: 0, loading: false, error: '' },
    { uid: '', ign: '', level: 0, loading: false, error: '' },
    { uid: '', ign: '', level: 0, loading: false, error: '' },
    { uid: '', ign: '', level: 0, loading: false, error: '' },
  ]);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [teamLogoPreview, setTeamLogoPreview] = useState<string | null>(null);
  const [teamLogoUploading, setTeamLogoUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [registering, setRegistering] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [seasonRes] = await Promise.all([
        esportsApi.season(),
        user ? esportsApi.myTeam().catch(() => null) : Promise.resolve(null),
      ]);
      setSeason(seasonRes.data);
      if (user && seasonRes.data) {
        const my = (await esportsApi.myTeam().catch(() => null))?.data || null;
        setMyTeam(my);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading, loadData]);

  const fetchProfile = async (index: number) => {
    const uid = players[index].uid.trim();
    if (!uid || uid.length < 5) {
      setPlayers((prev) => prev.map((p, i) => i === index ? { ...p, error: 'UID must be at least 5 characters', ign: '', level: 0 } : p));
      return;
    }

    const allUids = players.map((p) => p.uid.trim());
    const duplicateIndex = allUids.findIndex((u, i) => u === uid && i !== index);
    if (duplicateIndex >= 0) {
      setPlayers((prev) => prev.map((p, i) => i === index ? { ...p, error: 'Duplicate UID', ign: '', level: 0 } : p));
      return;
    }

    setPlayers((prev) => prev.map((p, i) => i === index ? { ...p, loading: true, error: '', ign: '', level: 0 } : p));

    try {
      const res = await gameApi.fetchProfile(uid);
      const profile = res.data;
      if (!profile) {
        setPlayers((prev) => prev.map((p, i) => i === index ? { ...p, loading: false, error: 'Profile not found' } : p));
        return;
      }
      if (profile.level < 60) {
        setPlayers((prev) => prev.map((p, i) =>
          i === index ? { ...p, loading: false, ign: profile.ign, level: profile.level, error: `Level ${profile.level} — Minimum 60 required` } : p
        ));
      } else {
        setPlayers((prev) => prev.map((p, i) =>
          i === index ? { ...p, loading: false, ign: profile.ign, level: profile.level, error: '' } : p
        ));
      }
    } catch (err) {
      setPlayers((prev) => prev.map((p, i) =>
        i === index ? { ...p, loading: false, error: getErrorMessage(err) } : p
      ));
    }
  };

  const allValid = players.every((p) => p.uid.trim().length >= 5 && p.ign && p.level >= 60 && !p.error && !p.loading)
    && teamName.trim()
    && screenshotUrl.trim()
    && termsAccepted;

  const handleTeamLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTeamLogoUploading(true);
    setError('');
    try {
      const previewUrl = URL.createObjectURL(file);
      setTeamLogoPreview(previewUrl);
      const res = await uploadApi.teamLogo(file);
      setTeamLogoUrl(res.data.logoUrl);
    } catch (err) {
      setError('Failed to upload team logo: ' + getErrorMessage(err));
      setTeamLogoPreview(null);
    } finally {
      setTeamLogoUploading(false);
    }
  };

  const handleRegister = async () => {
    if (!allValid) return;
    setRegistering(true);
    setError('');
    try {
      const res = await esportsApi.register({
        teamName: teamName.trim(),
        player1Uid: players[0].uid.trim(),
        player2Uid: players[1].uid.trim(),
        player3Uid: players[2].uid.trim(),
        player4Uid: players[3].uid.trim(),
        screenshotUrl: screenshotUrl.trim(),
        ...(teamLogoUrl && { teamLogoUrl }),
      });
      setActionMsg(res.message || 'Team registered!');
      await loadData();
      setTeamName('');
      setPlayers(players.map((p) => ({ uid: '', ign: '', level: 0, loading: false, error: '' })));
      setScreenshotUrl('');
      setTeamLogoUrl('');
      setTeamLogoPreview(null);
      setTermsAccepted(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  };

  const seasonEnded = season && !season.registrationOpen;
  const isRegistered = !!myTeam;

  const deadlinePassed = season?.registrationDeadline
    ? new Date(season.registrationDeadline).getTime() <= Date.now()
    : false;

  const showSchedule = season && (seasonEnded || (deadlinePassed && season.matchDate && season.matchMap));
  const canRegister = !!season && season.registrationOpen && !deadlinePassed;

  if (authLoading) return null;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass-card rounded-2xl p-8 mb-8 border border-yellow-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-yellow-500/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-yellow-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">Pro Esports</span>
              </div>
              <h1 className="text-4xl font-display font-bold text-white mb-2">
                {season ? `Season ${season.seasonNumber}` : 'Esports Arena'}
              </h1>
              <p className="text-zinc-400 mb-4">Powered by <span className="text-fire-400 font-bold">NEOBATTLE</span></p>

              {season && seasonEnded && season.winner && (
                <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-4">
                  <Crown className="w-6 h-6 text-yellow-400" />
                  <div>
                    <p className="text-sm text-zinc-400">Winner Team</p>
                    <p className="text-lg font-bold text-white">{season.winner.teamName}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-4">
                {season ? (
                  <>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      season.registrationOpen
                        ? 'text-green-400 bg-green-400/10 border border-green-500/20'
                        : 'text-red-400 bg-red-400/10 border border-red-500/20'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${season.registrationOpen ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                      {season.registrationOpen ? 'Registration Open' : 'Season Ended'}
                    </span>
                    {season.registrationDeadline && !deadlinePassed && (
                      <CountdownTimer deadline={season.registrationDeadline} />
                    )}
                    {season.nextSeasonDate && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-zinc-400 bg-zinc-400/10 border border-zinc-500/20">
                        <Calendar className="w-3.5 h-3.5" />
                        Season {season.seasonNumber + 1} starts: {formatDate(season.nextSeasonDate)}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">{season.teams.length} team(s) registered</span>
                  </>
                ) : (
                  <p className="text-zinc-500 text-sm">No season has been created yet. Contact the admin.</p>
                )}
              </div>
            </div>
          </div>

          {showSchedule && <MatchScheduleCard season={season} />}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          {actionMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
              <CheckCircle className="w-4 h-4" /> {actionMsg}
            </div>
          )}

          {isRegistered && (
            <div className="glass-card rounded-2xl p-6 mb-8 border border-green-500/20">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <h2 className="text-lg font-bold text-white">Your Team</h2>
              </div>
              <p className="text-white font-semibold mb-3">{myTeam?.teamName}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { uid: myTeam?.player1Uid, ign: myTeam?.player1Ign },
                  { uid: myTeam?.player2Uid, ign: myTeam?.player2Ign },
                  { uid: myTeam?.player3Uid, ign: myTeam?.player3Ign },
                  { uid: myTeam?.player4Uid, ign: myTeam?.player4Ign },
                ].map((p, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-zinc-500 font-mono">{p.uid}</p>
                    <p className="text-sm text-white font-medium">{p.ign}</p>
                  </div>
                ))}
              </div>
              {myTeam?.status === 'DISQUALIFIED' && (
                <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                  <Ban className="w-4 h-4" /> This team has been disqualified.
                </div>
              )}
              {myTeam?.status === 'WINNER' && (
                <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-400 text-sm">
                  <Crown className="w-4 h-4" /> Champion Team!
                </div>
              )}
            </div>
          )}

          {!isRegistered && season && canRegister && (
            <div className="glass-card rounded-2xl p-6 mb-8 border border-yellow-500/10">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Register Your Squad
              </h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">Team Name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter your squad name..."
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                {players.map((player, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Player {i + 1} UID
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={player.uid}
                        onChange={(e) => {
                          setPlayers((prev) => prev.map((p, j) => j === i ? { ...p, uid: e.target.value, ign: '', level: 0, error: '' } : p));
                        }}
                        placeholder="Enter Free Fire UID"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                        disabled={player.loading}
                      />
                      <button
                        type="button"
                        onClick={() => fetchProfile(i)}
                        disabled={player.loading || player.uid.trim().length < 5}
                        className="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 text-xs font-medium hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
                      >
                        {player.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
                      </button>
                    </div>
                    {player.ign && (
                      <p className={`text-xs mt-2 ${player.level >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                        {player.ign} — Level {player.level}
                        {player.level >= 60 && ' ✓'}
                      </p>
                    )}
                    {player.error && <p className="text-xs text-red-400 mt-2">{player.error}</p>}
                  </div>
                ))}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Profile Level Screenshot URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  placeholder="https://example.com/screenshot.png"
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Upload a screenshot showing all 4 players&apos; profile levels and provide the URL.</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">Team Logo (optional)</label>
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/10 transition-colors">
                    <Upload className="h-4 w-4" />
                    {teamLogoUploading ? 'Uploading...' : 'Choose Image'}
                    <input type="file" accept="image/*" onChange={handleTeamLogoUpload} disabled={teamLogoUploading} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </label>
                  {teamLogoPreview && (
                    <div className="flex items-center gap-2">
                      <img src={teamLogoPreview} alt="Team logo preview" className="w-8 h-8 rounded-full object-cover" />
                      <button onClick={() => { setTeamLogoPreview(null); setTeamLogoUrl(''); }} className="text-zinc-500 hover:text-red-400 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">JPG, PNG or WebP. Max 5MB.</p>
              </div>

              <div className="mb-8">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-yellow-500 focus:ring-yellow-500"
                  />
                  <div>
                    <span className="text-sm text-zinc-300 font-medium">I agree to the following terms:</span>
                    <ul className="text-xs text-zinc-500 mt-2 space-y-1 list-disc list-inside">
                      <li>All squad members are Level 60+</li>
                      <li>Use of panels/hacks = Instant Squad Disqualification</li>
                      <li>No refunds on disqualification</li>
                    </ul>
                  </div>
                </label>
              </div>

              <button
                type="button"
                onClick={handleRegister}
                disabled={!allValid || registering}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-500 text-white font-bold text-sm hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                {registering ? 'Registering...' : 'Register Squad'}
              </button>
            </div>
          )}

          {!isRegistered && season && deadlinePassed && season.registrationOpen && (
            <div className="glass-card rounded-2xl p-6 mb-8 border border-zinc-500/20 text-center">
              <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-zinc-400 mb-1">Registration Closed</h2>
              <p className="text-sm text-zinc-500">The registration deadline has passed.</p>
            </div>
          )}

          {season && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-fire-400" />
                Season {season.seasonNumber} Leaderboard
              </h2>
              {season.teams.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">Team</th>
                        <th className="text-left px-4 py-3 font-medium">Players</th>
                        <th className="text-left px-4 py-3 font-medium">Registered</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {season.teams.map((team, i) => {
                        const isWinner = team.id === season.winner?.id;
                        return (
                          <tr key={team.id} className={`border-b border-white/5 transition-colors ${isWinner ? 'bg-yellow-500/5' : 'hover:bg-white/3'}`}>
                            <td className="px-4 py-4 text-zinc-400">
                              {isWinner ? <Crown className="w-4 h-4 text-yellow-400" /> : i + 1}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                {team.teamLogoUrl && (
                                  <img src={team.teamLogoUrl} alt={`${team.teamName} logo`} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                )}
                                <span className={`font-semibold ${isWinner ? 'text-yellow-300' : 'text-white'}`}>
                                  {team.teamName}
                                </span>
                                {isWinner && <span className="text-xs text-yellow-400 ml-2">WINNER</span>}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                {[team.player1Ign, team.player2Ign, team.player3Ign, team.player4Ign].map((name, idx) => (
                                  <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-zinc-300">{name}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-xs text-zinc-500">{formatDate(team.createdAt)}</td>
                            <td className="px-4 py-4">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                team.status === 'WINNER' ? 'text-yellow-400 bg-yellow-400/10' :
                                team.status === 'DISQUALIFIED' ? 'text-red-400 bg-red-400/10' :
                                'text-green-400 bg-green-400/10'
                              }`}>
                                {team.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-8">No teams registered yet.</p>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
