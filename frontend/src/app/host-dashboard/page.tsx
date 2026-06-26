'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, Users, Shield, ArrowRight, Loader2, CheckCircle, AlertCircle,
  Upload, DollarSign, MapPin, Clock, Plus, Smartphone, Monitor, Gamepad2, Globe,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { hostApi, winnerProofApi, formatDate, formatCurrency, getStatusColor, CommissionBreakdown } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import { calculateCommission } from '@/lib/commission';

interface Entry {
  id: string;
  userId: string | null;
  user: { id: string; username: string; ign: string | null; freeFireId: string | null; displayName: string | null } | null;
  registeredAt: string;
}

interface Tournament {
  id: string;
  title: string;
  status: string;
  format: string;
  platform?: 'MOBILE' | 'PC';
  gameMode?: 'FULL_MAP' | 'CLASH_SQUAD';
  entryFee: number | string;
  prizePool: number | string;
  maxParticipants: number;
  startTime: string;
  mapName: string | null;
  delayedCount?: number;
  platformCommission?: number | string;
  hostCommission?: number | string;
  remainingPool?: number | string;
  _count: { entries: number };
  entries: Entry[];
}

export default function HostDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, isHost, isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [winnerUid, setWinnerUid] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', entryFee: 10, maxParticipants: 50, format: 'SOLO' as string, platform: 'MOBILE' as string, gameMode: 'FULL_MAP' as string, mapName: '', registrationStart: '', registrationEnd: '', startTime: '', description: '' });
  const [prizes, setPrizes] = useState({ first: 0, second: 0, third: 0 });
  const [prizeCount, setPrizeCount] = useState(3);
  const [breakdown, setBreakdown] = useState<CommissionBreakdown | null>(null);
  const [createErr, setCreateErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [completeMsg, setCompleteMsg] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && (isHost || isAdmin)) {
      hostApi.getMyTournaments()
        .then((res: any) => setTournaments(res.data || []))
        .catch((err) => setError(getErrorMessage(err)))
        .finally(() => setLoading(false));
    } else if (user) {
      setLoading(false);
    }
  }, [user, isHost, isAdmin]);

  useEffect(() => {
    if (form.maxParticipants > 0) {
      const bd = calculateCommission(form.entryFee, form.maxParticipants);
      setBreakdown(bd);
      if (bd.maxPrizePool > 0) {
        distributePrizes(bd.maxPrizePool, prizeCount);
      } else {
        setPrizes({ first: 0, second: 0, third: 0 });
      }
    } else {
      setBreakdown(null);
    }
  }, [form.entryFee, form.maxParticipants, prizeCount]);

  function distributePrizes(total: number, count: number) {
    if (count === 1) {
      setPrizes({ first: total, second: 0, third: 0 });
    } else if (count === 2) {
      const first = Math.round(total * 0.7 * 100) / 100;
      setPrizes({ first, second: Math.round((total - first) * 100) / 100, third: 0 });
    } else {
      const first = Math.round(total * 0.5 * 100) / 100;
      const second = Math.round(total * 0.3 * 100) / 100;
      setPrizes({ first, second, third: Math.round((total - first - second) * 100) / 100 });
    }
  }

  const totalPrizes = prizes.first + (prizeCount >= 2 ? prizes.second : 0) + (prizeCount >= 3 ? prizes.third : 0);
  const maxPool = breakdown?.maxPrizePool || 0;
  const isPrizesBalanced = maxPool > 0 && Math.abs(totalPrizes - maxPool) < 0.01;
  const prizeError = maxPool > 0 && !isPrizesBalanced
    ? `Prize distribution must equal the Max Prize Pool: ${formatCurrency(maxPool)} (currently ${formatCurrency(totalPrizes)})`
    : '';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrizesBalanced) return;
    setCreateErr('');
    setCreating(true);
    try {
      const prizePoolTotal = totalPrizes;
      const data = {
        ...form,
        format: form.format,
        platform: form.platform,
        gameMode: form.gameMode,
        entryFee: Number(form.entryFee),
        prizePool: prizePoolTotal,
        prizeFirst: prizes.first,
        prizeSecond: prizeCount >= 2 ? prizes.second : null,
        prizeThird: prizeCount >= 3 ? prizes.third : null,
        maxParticipants: Number(form.maxParticipants),
        registrationStart: new Date(form.registrationStart).toISOString(),
        registrationEnd: new Date(form.registrationEnd).toISOString(),
        startTime: new Date(form.startTime).toISOString(),
      };

      await hostApi.createTournament(data);
      setShowCreate(false);
      setForm({ title: '', entryFee: 10, maxParticipants: 50, format: 'SOLO', platform: 'MOBILE', gameMode: 'FULL_MAP', mapName: '', registrationStart: '', registrationEnd: '', startTime: '', description: '' });
      setPrizes({ first: 0, second: 0, third: 0 });
      setPrizeCount(3);
      const res = await hostApi.getMyTournaments();
      setTournaments(res.data || []);
    } catch (err) {
      setCreateErr(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelay = async (tournamentId: string) => {
    const newTime = prompt('Enter new start time (YYYY-MM-DDTHH:MM):');
    if (!newTime) return;
    try {
      await hostApi.updateStatus(tournamentId, 'delay');
      await hostApi.delayTournament(tournamentId, new Date(newTime).toISOString());
      const res = await hostApi.getMyTournaments();
      setTournaments(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSubmitWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament) return;
    setSubmitErr('');
    setSubmitMsg('');
    setSubmitting(true);
    try {
      const res = await winnerProofApi.submit({ tournamentId: selectedTournament.id, winnerUid, screenshotUrl });
      setSubmitMsg(res.message || 'Winner proof submitted!');
      setWinnerUid('');
      setScreenshotUrl('');
    } catch (err) {
      setSubmitErr(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return <div className="max-w-7xl mx-auto px-4 py-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>;
  }

  if (!user) return null;
  if (!isHost && !isAdmin) {
    return <div className="max-w-7xl mx-auto px-4 py-20 text-center"><Shield className="w-12 h-12 text-zinc-600 mx-auto mb-4" /><p className="text-zinc-400">You do not have host access.</p></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Shield className="w-8 h-8 text-fire-400" />
              My Tournaments
            </h1>
            <p className="text-zinc-400 mt-2">Create and manage your tournaments, view entries, and complete matches.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/20 text-fire-400 text-sm font-medium hover:bg-fire-500/30">
            <Plus className="w-4 h-4" /> {showCreate ? 'Cancel' : 'Create Tournament'}
          </button>
        </div>

        {error && <div className="glass-card rounded-xl p-4 mb-6 text-red-400 text-sm">{error}</div>}

        {showCreate && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={handleCreate} className="glass-card rounded-2xl p-6 mb-8 space-y-4">
            <h3 className="text-lg font-bold text-white">Create Tournament</h3>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Tournament Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Enter tournament title" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" required />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Format</label>
                <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm">
                  <option value="SOLO" className="bg-gray-800 text-white">Solo</option>
                  <option value="DUO" className="bg-gray-800 text-white">Duo</option>
                  <option value="SQUAD" className="bg-gray-800 text-white">Squad</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Platform</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm">
                  <option value="MOBILE" className="bg-gray-800 text-white">Mobile</option>
                  <option value="PC" className="bg-gray-800 text-white">PC</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Game Mode</label>
                <select value={form.gameMode} onChange={(e) => setForm({ ...form, gameMode: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm">
                  <option value="FULL_MAP" className="bg-gray-800 text-white">Full Map</option>
                  <option value="CLASH_SQUAD" className="bg-gray-800 text-white">Clash Squad</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Map</label>
                <select value={form.mapName} onChange={(e) => setForm({ ...form, mapName: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm" required>
                  <option value="" disabled className="bg-gray-800 text-zinc-400">Select Map</option>
                  <option value="Bermuda" className="bg-gray-800 text-white">Bermuda</option>
                  <option value="Purgatory" className="bg-gray-800 text-white">Purgatory</option>
                  <option value="Kalahari" className="bg-gray-800 text-white">Kalahari</option>
                  <option value="Nexterra" className="bg-gray-800 text-white">Nexterra</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Entry Fee (₹)</label>
                <input type="number" value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: Number(e.target.value) })} placeholder="Enter entry fee" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" min={0} required />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Max Participants</label>
                <input type="number" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })} placeholder="Enter max players" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" min={2} required />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-400 block">Prize Distribution</label>
                  {maxPool > 0 && (
                    <span className="text-xs text-zinc-500">
                      Max Prize Pool: <span className="text-yellow-400 font-semibold">{formatCurrency(maxPool)}</span>
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5 block">1st Place</label>
                      <input
                        type="number"
                        value={prizes.first}
                        onChange={(e) => setPrizes({ ...prizes, first: Number(e.target.value) })}
                        placeholder="1st place prize"
                        className="input-field w-full px-3 py-2 rounded-lg bg-fire-500/10 border border-fire-500/30 text-fire-400 text-sm font-bold"
                        min={0}
                        required
                      />
                    </div>
                    <div className="pt-5">
                      <span className="text-fire-400 text-lg">🥇</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5 block">2nd Place</label>
                        <button
                          type="button"
                          onClick={() => {
                            if (prizeCount >= 2) {
                              setPrizes({ ...prizes, first: prizes.first + prizes.second, second: 0 });
                              setPrizeCount(1);
                            } else {
                              setPrizeCount(2);
                              const total = maxPool || prizes.first;
                              const first = Math.round(total * 0.7 * 100) / 100;
                              setPrizes({ first, second: Math.round((total - first) * 100) / 100, third: 0 });
                            }
                          }}
                          className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {prizeCount >= 2 ? <ToggleRight className="w-3.5 h-3.5 text-green-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-zinc-600" />}
                          {prizeCount >= 2 ? 'On' : 'Off'}
                        </button>
                      </div>
                      {prizeCount >= 2 ? (
                        <input
                          type="number"
                          value={prizes.second}
                          onChange={(e) => setPrizes({ ...prizes, second: Number(e.target.value) })}
                          placeholder="2nd place prize"
                          className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                          min={0}
                        />
                      ) : (
                        <div className="w-full px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-zinc-600 text-sm italic">Not offered</div>
                      )}
                    </div>
                    <div className="pt-5">
                      <span className="text-zinc-500 text-lg">🥈</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5 block">3rd Place</label>
                        <button
                          type="button"
                          onClick={() => {
                            if (prizeCount >= 3) {
                              setPrizes({ ...prizes, first: prizes.first + prizes.third, second: prizeCount >= 2 ? prizes.second : 0, third: 0 });
                              setPrizeCount(2);
                            } else if (prizeCount === 2) {
                              setPrizeCount(3);
                              const first = Math.round(prizes.first * 0.6 * 100) / 100;
                              const second = Math.round(prizes.second * 0.6 * 100) / 100;
                              const total = prizes.first + prizes.second;
                              setPrizes({ first: Math.round(total * 0.5 * 100) / 100, second: Math.round(total * 0.3 * 100) / 100, third: Math.round(total * 0.2 * 100) / 100 });
                            }
                          }}
                          className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {prizeCount >= 3 ? <ToggleRight className="w-3.5 h-3.5 text-green-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-zinc-600" />}
                          {prizeCount >= 3 ? 'On' : 'Off'}
                        </button>
                      </div>
                      {prizeCount >= 3 ? (
                        <input
                          type="number"
                          value={prizes.third}
                          onChange={(e) => setPrizes({ ...prizes, third: Number(e.target.value) })}
                          placeholder="3rd place prize"
                          className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                          min={0}
                        />
                      ) : (
                        <div className="w-full px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-zinc-600 text-sm italic">Not offered</div>
                      )}
                    </div>
                    <div className="pt-5">
                      <span className="text-zinc-500 text-lg">🥉</span>
                    </div>
                  </div>
                </div>

                {maxPool > 0 && (
                  <div className={`mt-2 flex items-center justify-between text-xs ${isPrizesBalanced ? 'text-green-400' : 'text-red-400'}`}>
                    <span className="flex items-center gap-1">
                      {isPrizesBalanced ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {isPrizesBalanced ? 'Prize distribution is balanced' : prizeError}
                    </span>
                    <span className="text-zinc-500">
                      Total: {formatCurrency(totalPrizes)} / {formatCurrency(maxPool)}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Registration Start</label>
                <input type="datetime-local" value={form.registrationStart} onChange={(e) => setForm({ ...form, registrationStart: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" required />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Registration End</label>
                <input type="datetime-local" value={form.registrationEnd} onChange={(e) => setForm({ ...form, registrationEnd: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" required />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Tournament Start Date/Time</label>
                <input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" required />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Description <span className="text-zinc-600">(optional)</span></label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tournament rules, prize distribution, schedule notes, or any additional info for participants" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" rows={3} />
              </div>
            </div>

            {breakdown && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-sm font-semibold text-white mb-3">Commission Breakdown</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-zinc-500">Total Collection</p>
                    <p className="text-white font-bold">{formatCurrency(breakdown.totalCollection)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Platform (28%)</p>
                    <p className="text-fire-400 font-bold">{formatCurrency(breakdown.platformCommission)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Host (20%)</p>
                    <p className="text-green-400 font-bold">{formatCurrency(breakdown.hostCommission)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Max Prize Pool</p>
                    <p className="font-bold text-yellow-400">{formatCurrency(breakdown.maxPrizePool)}</p>
                  </div>
                </div>
              </div>
            )}

            {createErr && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm"><AlertCircle className="w-4 h-4" /> {createErr}</div>}

            <button type="submit" disabled={creating || (breakdown ? !isPrizesBalanced : true)} className="btn-fire px-6 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Tournament'}
            </button>
          </motion.form>
        )}

        {tournaments.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No tournaments yet. Create one above.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {tournaments.map((t) => (
              <div key={t.id} className="glass-card rounded-2xl overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white">{t.title}</h3>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(t.status)}`}>{t.status}</span>
                      </div>
                      <p className="text-sm text-zinc-400">
                        {t.format}{t.platform ? ` | ${t.platform === 'MOBILE' ? 'Mobile' : 'PC'}` : ''}{t.gameMode ? ` | ${t.gameMode === 'FULL_MAP' ? 'Full Map' : 'Clash Squad'}` : ''} — {t.mapName || 'TBD'} — {formatCurrency(typeof t.entryFee === 'string' ? parseFloat(t.entryFee) : t.entryFee)} entry
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-xs text-zinc-500 bg-white/5 px-2 py-1 rounded">
                      <Users className="w-3 h-3 inline mr-1" />
                      {t._count.entries}/{t.maxParticipants} registered
                    </span>
                    <span className="text-xs text-zinc-500 bg-white/5 px-2 py-1 rounded">
                      <DollarSign className="w-3 h-3 inline mr-1" />
                      Prize: {formatCurrency(typeof t.prizePool === 'string' ? parseFloat(t.prizePool) : t.prizePool)}
                    </span>
                    <span className="text-xs text-zinc-500 bg-white/5 px-2 py-1 rounded">
                      <MapPin className="w-3 h-3 inline mr-1" />
                      {formatDate(t.startTime)}
                    </span>
                    {t.delayedCount !== undefined && t.delayedCount > 0 && (
                      <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Delayed {t.delayedCount}x
                      </span>
                    )}
                  </div>

                  {t.entries.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-zinc-300 mb-2">Registered Players</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5 text-zinc-500 text-xs">
                              <th className="text-left px-3 py-2 font-medium">Username</th>
                              <th className="text-left px-3 py-2 font-medium">IGN</th>
                              <th className="text-left px-3 py-2 font-medium">Free Fire ID</th>
                              <th className="text-left px-3 py-2 font-medium">Registered</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.entries.map((e) => (
                              <tr key={e.id} className="border-b border-white/5 last:border-0">
                                <td className="px-3 py-2 text-white">{e.user?.username || '—'}</td>
                                <td className="px-3 py-2 text-fire-400 font-mono">{e.user?.ign || '—'}</td>
                                <td className="px-3 py-2 text-zinc-400 font-mono">{e.user?.freeFireId || '—'}</td>
                                <td className="px-3 py-2 text-zinc-500">{formatDate(e.registeredAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {t._count.entries > 0 && t._count.entries < t.maxParticipants && (t.status === 'REGISTRATION' || t.status === 'DRAFT') && (
                      <button onClick={() => { const tId = t.id; handleDelay(tId); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-sm font-medium hover:bg-yellow-500/20 transition-colors">
                        <Clock className="w-4 h-4" /> Delay
                      </button>
                    )}
                    {t.entries.length > 0 && (t.status === 'ACTIVE' || t.status === 'COMPLETED') && (
                      <button onClick={() => setSelectedTournament(selectedTournament?.id === t.id ? null : t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fire-500/10 text-fire-400 text-sm font-medium hover:bg-fire-500/20 transition-colors">
                        <Upload className="w-4 h-4" /> {selectedTournament?.id === t.id ? 'Cancel' : 'Submit Winner'}
                      </button>
                    )}
                    {t.status === 'ACTIVE' && t.entries.some((e: Entry) => e.user?.username) && (
                      <button
                        type="button"
                        onClick={async () => {
                          setCompleting(t.id);
                          setCompleteMsg('');
                          try {
                            const res = await hostApi.completeTournament(t.id);
                            setCompleteMsg(res.message || 'Tournament completed!');
                            const updated = await hostApi.getMyTournaments();
                            setTournaments(updated.data || []);
                          } catch (err) {
                            setError(getErrorMessage(err));
                          } finally {
                            setCompleting(null);
                          }
                        }}
                        disabled={completing === t.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                      >
                        <Trophy className="w-4 h-4" /> {completing === t.id ? 'Completing...' : 'Complete & Payout'}
                      </button>
                    )}
                    <Link href={`/tournaments/${t.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-sm font-medium hover:bg-white/10 transition-colors">
                      View <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  {completeMsg && <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> {completeMsg}</div>}

                  {selectedTournament?.id === t.id && (
                    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={handleSubmitWinner} className="mt-4 p-4 rounded-xl bg-white/5 space-y-3">
                      <p className="text-sm font-semibold text-white">Submit Winner Proof</p>
                      {submitMsg && <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> {submitMsg}</div>}
                      {submitErr && <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 text-red-400 text-sm"><AlertCircle className="w-4 h-4" /> {submitErr}</div>}
                      <input type="text" value={winnerUid} onChange={(e) => setWinnerUid(e.target.value)} placeholder="Winner UID" className="input-field w-full px-3 py-2 rounded-lg text-white text-sm bg-white/5 border border-white/10" required />
                      <input type="url" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} placeholder="Screenshot URL (proof)" className="input-field w-full px-3 py-2 rounded-lg text-white text-sm bg-white/5 border border-white/10" required />
                      <button type="submit" disabled={submitting} className="btn-fire px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50">
                        {submitting ? 'Submitting...' : 'Submit for Payout'}
                      </button>
                    </motion.form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
