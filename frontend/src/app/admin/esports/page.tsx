'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Trophy, AlertCircle, CheckCircle, Calendar,
  RefreshCw, Loader2, Crown, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { esportsApi, type EsportsSeason, formatDate } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminEsportsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const [season, setSeason] = useState<EsportsSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const [newSeasonNumber, setNewSeasonNumber] = useState('');
  const [regDeadline, setRegDeadline] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchMap, setMatchMap] = useState('');
  const [matchMode, setMatchMode] = useState('');
  const [regOpen, setRegOpen] = useState(false);
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, authLoading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await esportsApi.season();
      const s = res.data;
      setSeason(s);
      if (s) {
        setRegOpen(s.registrationOpen);
        setRegDeadline(s.registrationDeadline ? new Date(s.registrationDeadline).toISOString().slice(0, 16) : '');
        setMatchDate(s.matchDate ? new Date(s.matchDate).toISOString().slice(0, 16) : '');
        setMatchMap(s.matchMap || '');
        setMatchMode(s.matchMode || '');
        setNewSeasonNumber(String((s.seasonNumber || 0) + 1));
        setNextDate(s.nextSeasonDate ? new Date(s.nextSeasonDate).toISOString().slice(0, 16) : '');
      } else {
        setNewSeasonNumber('1');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleUpdateConfig = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await esportsApi.updateSeasonConfig({
        registrationOpen: regOpen,
        registrationDeadline: regDeadline ? new Date(regDeadline).toISOString() : null,
        matchDate: matchDate ? new Date(matchDate).toISOString() : null,
        matchMap: matchMap || null,
        matchMode: matchMode || null,
        ...(nextDate ? { nextSeasonDate: new Date(nextDate).toISOString() } : { nextSeasonDate: null }),
      });
      setActionMsg(res.message || 'Season config updated');
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSeason = async () => {
    if (!newSeasonNumber) return;
    setSaving(true);
    setError('');
    try {
      const num = parseInt(newSeasonNumber);
      const res = await esportsApi.createSeason(num);
      setActionMsg(res.message || `Season ${num} created`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEndSeason = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await esportsApi.endSeason(winnerTeamId || undefined);
      setActionMsg(res.message || 'Season ended');
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Admin Panel
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-yellow-400" />
              Esports Config
            </h1>
            <p className="text-zinc-400 mt-1">Manage pro esports seasons, registration, and lifecycle</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

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

        {loading ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            {!season && (
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Create Season 1</h2>
                <p className="text-zinc-400 text-sm mb-4">No season exists yet. Create the first esports season.</p>
                <button
                  type="button"
                  onClick={handleCreateSeason}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-500 text-white font-semibold text-sm hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                  Create Season 1
                </button>
              </div>
            )}

            {season && (
              <>
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    Season {season.seasonNumber} — Configuration
                  </h2>

                  <div className="space-y-5">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <div>
                        <p className="text-sm font-medium text-white">Registration Status</p>
                        <p className="text-xs text-zinc-500">{regOpen ? 'Open — players can register' : 'Closed — registration disabled'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRegOpen(!regOpen)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          regOpen ? 'bg-green-500/20 text-green-400' : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {regOpen ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        {regOpen ? 'Open' : 'Closed'}
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Registration Deadline</label>
                      <input
                        type="datetime-local"
                        value={regDeadline}
                        onChange={(e) => setRegDeadline(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                      />
                      <p className="text-xs text-zinc-500 mt-1">After this time, the register button will auto-disable and the match schedule will appear.</p>
                    </div>

                    <div className="border-t border-white/5 pt-5">
                      <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-cyan-400" />
                        Schedule & Maps
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">Match Date & Time</label>
                          <input
                            type="datetime-local"
                            value={matchDate}
                            onChange={(e) => setMatchDate(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">Map Selection</label>
                          <select
                            value={matchMap}
                            onChange={(e) => setMatchMap(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                          >
                            <option value="">Select map...</option>
                            <option value="Bermuda">Bermuda</option>
                            <option value="Purgatory">Purgatory</option>
                            <option value="Alpine">Alpine</option>
                            <option value="Kalahari">Kalahari</option>
                            <option value="NeXTerra">NeXTerra</option>
                            <option value="Bermuda Remastered">Bermuda Remastered</option>
                            <option value="Purgatory Remastered">Purgatory Remastered</option>
                            <option value="Kalahari Remastered">Kalahari Remastered</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">Mode</label>
                          <select
                            value={matchMode}
                            onChange={(e) => setMatchMode(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                          >
                            <option value="">Select mode...</option>
                            <option value="Full Map">Full Map</option>
                            <option value="Clash Squad">Clash Squad</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Next Season Start Date</label>
                      <input
                        type="datetime-local"
                        value={nextDate}
                        onChange={(e) => setNextDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleUpdateConfig}
                        disabled={saving}
                        className="px-6 py-2.5 rounded-lg bg-yellow-500/20 text-yellow-400 font-semibold text-sm hover:bg-yellow-500/30 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                        Save Config
                      </button>
                    </div>
                  </div>
                </div>

                {season.registrationOpen && (
                  <div className="glass-card rounded-2xl p-6 border border-red-500/10">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 text-red-400">
                      <Crown className="w-5 h-5" />
                      End Season
                    </h2>
                    <p className="text-zinc-400 text-sm mb-4">Select the winning team and end this season.</p>
                    {season.teams.filter((t) => t.status !== 'DISQUALIFIED').length > 0 && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Winner Team</label>
                        <select
                          value={winnerTeamId}
                          onChange={(e) => setWinnerTeamId(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-red-500/50 focus:outline-none"
                        >
                          <option value="">Select winner team...</option>
                          {season.teams.filter((t) => t.status !== 'DISQUALIFIED').map((t) => (
                            <option key={t.id} value={t.id}>{t.teamName}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleEndSeason}
                      disabled={saving}
                      className="px-6 py-2.5 rounded-lg bg-red-500/20 text-red-400 font-semibold text-sm hover:bg-red-500/30 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                      End Season
                    </button>
                  </div>
                )}

                {!season.registrationOpen && (
                  <div className="glass-card rounded-2xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Create Next Season</h2>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        value={newSeasonNumber}
                        onChange={(e) => setNewSeasonNumber(e.target.value)}
                        min="1"
                        className="w-32 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateSeason}
                        disabled={saving}
                        className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-500 text-white font-semibold text-sm hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                        Create Season {newSeasonNumber}
                      </button>
                    </div>
                  </div>
                )}

                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4">Registered Teams ({season.teams.length})</h2>
                  {season.teams.length > 0 ? (
                    <div className="space-y-3">
                      {season.teams.map((team) => (
                        <div key={team.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-sm font-semibold text-white">{team.teamName}</p>
                              <p className="text-xs text-zinc-500">by {team.registeredBy.username}</p>
                            </div>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              team.status === 'WINNER' ? 'text-yellow-400 bg-yellow-400/10' :
                              team.status === 'DISQUALIFIED' ? 'text-red-400 bg-red-400/10' :
                              'text-green-400 bg-green-400/10'
                            }`}>
                              {team.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                            {[
                              { uid: team.player1Uid, ign: team.player1Ign },
                              { uid: team.player2Uid, ign: team.player2Ign },
                              { uid: team.player3Uid, ign: team.player3Ign },
                              { uid: team.player4Uid, ign: team.player4Ign },
                            ].map((p, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-zinc-500 font-mono">{p.uid}</span>
                                <span className="text-zinc-300 ml-1">{p.ign}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-sm text-center py-8">No teams registered yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
