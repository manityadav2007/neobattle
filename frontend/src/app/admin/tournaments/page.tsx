'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Trophy, AlertCircle, RefreshCw, Loader2, Users, DollarSign, MapPin, Clock,
  Plus, CheckCircle, XCircle, Gift, Save, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { tournamentApi, adminApi, formatCurrency, formatDate, getStatusColor, type Tournament } from '@/lib/services';
import { calculateCommission, type CommissionBreakdown } from '@/lib/commission';
import { getErrorMessage } from '@/lib/api';

interface TournamentEntry {
  id: string;
  userId: string | null;
  user: { id: string; username: string; displayName?: string | null } | null;
  placement: number | null;
  registeredAt: string;
}

export default function AdminTournamentsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [form, setForm] = useState({ title: '', entryFee: 10, maxParticipants: 50, teamSize: '', requiredLevel: 0, format: 'SOLO', platform: 'MOBILE', gameMode: 'FULL_MAP', mapName: '', registrationStart: '', registrationEnd: '', startTime: '', description: '' });
  const [prizes, setPrizes] = useState({ first: 0, second: 0, third: 0 });
  const [prizeCount, setPrizeCount] = useState(3);
  const [breakdown, setBreakdown] = useState<CommissionBreakdown | null>(null);
  const [createErr, setCreateErr] = useState('');
  const [creating, setCreating] = useState(false);

  const [expandedTournament, setExpandedTournament] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, TournamentEntry[]>>({});
  const [entriesLoading, setEntriesLoading] = useState<Record<string, boolean>>({});

  const [matchDetails, setMatchDetails] = useState<Record<string, { roomId: string; roomPassword: string }>>({});
  const [savingMatch, setSavingMatch] = useState<string | null>(null);
  const [matchMsg, setMatchMsg] = useState<Record<string, string>>({});

  const [awardModal, setAwardModal] = useState<{ tournamentId: string; tournamentTitle: string; winnerId: string; winnerName: string } | null>(null);
  const [prizeAmount, setPrizeAmount] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [awardErr, setAwardErr] = useState('');
  const [awardMsg, setAwardMsg] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, authLoading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await tournamentApi.list({ page: 1 });
      setTournaments(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const loadEntries = async (tournamentId: string) => {
    if (entriesLoading[tournamentId]) return;
    setEntriesLoading((prev) => ({ ...prev, [tournamentId]: true }));
    try {
      const res = await tournamentApi.get(tournamentId);
      const data = res.data as any;
      setEntries((prev) => ({ ...prev, [tournamentId]: data.entries || [] }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setEntriesLoading((prev) => ({ ...prev, [tournamentId]: false }));
    }
  };

  const effectiveMaxParticipants = form.gameMode === 'CLASH_SQUAD'
    ? ({ '1v1': 2, '2v2': 4, '4v4': 8, '6v6': 12 }[form.teamSize] || 0)
    : form.maxParticipants;

  // Manual/free mode: explicit toggle OR zero/empty entry fee — no budget validation, no wallet deduction
  const effectiveFree = isFree || !form.entryFee || Number(form.entryFee) <= 0;

  useEffect(() => {
    if (effectiveFree || effectiveMaxParticipants <= 0) { setBreakdown(null); return; }
    const bd = calculateCommission(Number(form.entryFee), effectiveMaxParticipants);
    setBreakdown(bd);
    if (bd.maxPrizePool > 0) {
      distributePrizes(bd.maxPrizePool, prizeCount);
    } else {
      setPrizes({ first: 0, second: 0, third: 0 });
    }
  }, [form.entryFee, effectiveMaxParticipants, prizeCount, effectiveFree]);

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
  const isPrizesBalanced = !effectiveFree && maxPool > 0 && Math.abs(totalPrizes - maxPool) < 0.01;
  const prizeError = !effectiveFree && maxPool > 0 && !isPrizesBalanced
    ? `Prize distribution must equal the Max Prize Pool: ${formatCurrency(maxPool)} (currently ${formatCurrency(totalPrizes)})`
    : '';

  const toggleExpand = (id: string, tournament: Tournament) => {
    if (expandedTournament === id) {
      setExpandedTournament(null);
    } else {
      setExpandedTournament(id);
      if (!entries[id]) loadEntries(id);
      if (!matchDetails[id]) {
        setMatchDetails((prev) => ({ ...prev, [id]: { roomId: tournament.roomId || '', roomPassword: tournament.roomPassword || '' } }));
      }
    }
  };

  const handleSaveMatchDetails = async (id: string) => {
    setSavingMatch(id);
    setMatchMsg((prev) => ({ ...prev, [id]: '' }));
    try {
      await tournamentApi.update(id, { roomId: matchDetails[id]?.roomId, roomPassword: matchDetails[id]?.roomPassword });
      setMatchMsg((prev) => ({ ...prev, [id]: 'Match details saved!' }));
      setTimeout(() => setMatchMsg((prev) => ({ ...prev, [id]: '' })), 3000);
      loadData();
    } catch (err) {
      setMatchMsg((prev) => ({ ...prev, [id]: getErrorMessage(err) }));
    } finally {
      setSavingMatch(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveFree && !isPrizesBalanced) return;
    setCreateErr('');
    setCreating(true);
    try {
      const isClashSquad = form.gameMode === 'CLASH_SQUAD';
      const teamSizeMap: Record<string, number> = { '1v1': 2, '2v2': 4, '4v4': 8, '6v6': 12 };
      const clashFormatMap: Record<string, string> = { '1v1': 'SOLO', '2v2': 'DUO', '4v4': 'SQUAD', '6v6': 'SQUAD' };
      const prizePoolTotal = totalPrizes;
      const payload: any = {
        ...form,
        format: isClashSquad ? (clashFormatMap[form.teamSize] || 'SQUAD') : form.format,
        platform: form.platform,
        gameMode: form.gameMode,
        entryFee: isFree ? 0 : Number(form.entryFee),
        prizePool: prizePoolTotal,
        prizeFirst: prizes.first,
        prizeSecond: prizeCount >= 2 ? prizes.second : null,
        prizeThird: prizeCount >= 3 ? prizes.third : null,
        maxParticipants: isClashSquad ? teamSizeMap[form.teamSize] || 2 : Number(form.maxParticipants),
        registrationStart: new Date(form.registrationStart).toISOString(),
        registrationEnd: new Date(form.registrationEnd).toISOString(),
        startTime: new Date(form.startTime).toISOString(),
        isFree: effectiveFree,
      };
      if (isClashSquad) payload.teamSize = form.teamSize;
      await tournamentApi.create(payload);
      setShowCreate(false);
      setIsFree(false);
      setForm({ title: '', entryFee: 10, maxParticipants: 50, teamSize: '', requiredLevel: 0, format: 'SOLO', platform: 'MOBILE', gameMode: 'FULL_MAP', mapName: '', registrationStart: '', registrationEnd: '', startTime: '', description: '' });
      setPrizes({ first: 0, second: 0, third: 0 });
      setPrizeCount(3);
      setSuccessMsg(effectiveFree ? 'Free tournament created!' : 'Tournament created!');
      await loadData();
    } catch (err) {
      setCreateErr(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleAwardPrize = async () => {
    if (!awardModal || !prizeAmount || Number(prizeAmount) <= 0) return;
    setAwarding(true);
    setAwardErr('');
    setAwardMsg('');
    try {
      const res = await adminApi.awardPrize({
        userId: awardModal.winnerId,
        amount: Number(prizeAmount),
        tournamentId: awardModal.tournamentId,
      });
      setAwardMsg(res.message || 'Prize awarded successfully!');
      setPrizeAmount('');
    } catch (err) {
      setAwardErr(getErrorMessage(err));
    } finally {
      setAwarding(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Trophy className="w-8 h-8 text-fire-400" />
              All Tournaments
            </h1>
            <p className="text-zinc-400 mt-1">View, create, and manage tournaments on the platform</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/20 text-fire-400 text-sm font-medium hover:bg-fire-500/30 transition-colors">
              <Plus className="w-4 h-4" /> {showCreate ? 'Cancel' : 'Create Tournament'}
            </button>
            <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" /> {successMsg}
          </div>
        )}

        {showCreate && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={handleCreate} className="glass-card rounded-2xl p-6 mb-8 space-y-4">
            <h3 className="text-lg font-bold text-white">Create Tournament</h3>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setIsFree(!isFree)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${isFree ? 'bg-green-500' : 'bg-zinc-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isFree ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <div>
                  <span className="text-white text-sm font-medium">Free Tournament</span>
                  <p className="text-zinc-500 text-xs">Entry fee is ₹0; admin awards prize money manually</p>
                </div>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Tournament Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Enter tournament title" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" required />
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
                <select
                  value={form.gameMode}
                  onChange={(e) => {
                    const gm = e.target.value;
                    setForm((f) => ({
                      ...f,
                      gameMode: gm,
                      teamSize: gm === 'CLASH_SQUAD' && !f.teamSize ? '4v4' : f.teamSize,
                    }));
                  }}
                  className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm"
                >
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
              <div className={isFree ? 'opacity-30 pointer-events-none' : ''}>
                <label className="text-xs text-zinc-400 mb-1 block">Entry Fee (₹)</label>
                <input type="number" value={isFree ? 0 : form.entryFee} onChange={(e) => { const v = Number(e.target.value); setForm({ ...form, entryFee: v }); if (v <= 0 && !isFree) setIsFree(true); }} placeholder="Enter entry fee" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" min={0} disabled={isFree} required />
              </div>
              {form.gameMode === 'CLASH_SQUAD' ? (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Squad Size <span className="text-zinc-600">(Clash Squad)</span></label>
                  <select value={form.teamSize} onChange={(e) => setForm({ ...form, teamSize: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm" required>
                    <option value="1v1" className="bg-gray-800 text-white">1v1 (2 players)</option>
                    <option value="2v2" className="bg-gray-800 text-white">2v2 (4 players)</option>
                    <option value="4v4" className="bg-gray-800 text-white">4v4 (8 players)</option>
                    <option value="6v6" className="bg-gray-800 text-white">6v6 (12 players)</option>
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Format</label>
                    <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="input-field w-full px-3 py-2 rounded-lg bg-gray-800 border border-white/10 text-white text-sm" required>
                      <option value="SOLO" className="bg-gray-800 text-white">Solo</option>
                      <option value="DUO" className="bg-gray-800 text-white">Duo</option>
                      <option value="SQUAD" className="bg-gray-800 text-white">Squad</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Max Participants</label>
                    <input type="number" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })} placeholder="Enter max players" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" min={2} required />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Required Level <span className="text-zinc-600">(0 = no restriction)</span></label>
                <input type="number" value={form.requiredLevel} onChange={(e) => setForm({ ...form, requiredLevel: Number(e.target.value) })} placeholder="Enter min game level" className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" min={0} />
              </div>

              <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-zinc-400 block">Prize Distribution{effectiveFree ? ' (Manual)' : ''}</label>
                    {!effectiveFree && maxPool > 0 && (
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

                  {effectiveFree ? (
                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                      <span>No entry fees — winners are paid manually via &quot;Award Prize&quot;. No budget check applied.</span>
                      <span>Total: {formatCurrency(totalPrizes)}</span>
                    </div>
                  ) : maxPool > 0 ? (
                    <div className={`mt-2 flex items-center justify-between text-xs ${isPrizesBalanced ? 'text-green-400' : 'text-red-400'}`}>
                      <span className="flex items-center gap-1">
                        {isPrizesBalanced ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {isPrizesBalanced ? 'Prize distribution is balanced' : prizeError}
                      </span>
                      <span className="text-zinc-500">
                        Total: {formatCurrency(totalPrizes)} / {formatCurrency(maxPool)}
                      </span>
                    </div>
                  ) : null}
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

            {!effectiveFree && breakdown && (
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

            <button type="submit" disabled={creating || (!effectiveFree && !isPrizesBalanced)} className="btn-fire px-6 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
              {creating ? 'Creating...' : effectiveFree ? 'Create Free Tournament' : 'Create Tournament'}
            </button>
          </motion.form>
        )}

        {loading ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : tournaments.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No tournaments found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t, i) => {
              const entryFee = typeof t.entryFee === 'string' ? parseFloat(t.entryFee) : t.entryFee;
              const prizePool = typeof t.prizePool === 'string' ? parseFloat(t.prizePool) : t.prizePool;
              const entryCount = t._count?.entries ?? 0;
              const isFreeTournament = entryFee === 0;

              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card rounded-2xl overflow-hidden group"
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-fire-400 transition-colors">{t.title}</h3>
                        <p className="text-xs text-zinc-500 mt-1">by {t.creator?.username || 'System'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(t.status)}`}>{t.status}</span>
                        {isFreeTournament && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-400">FREE</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="flex items-center gap-1 text-zinc-400"><DollarSign className="w-3 h-3 text-green-400" /> {isFreeTournament && prizePool === 0 ? 'FREE' : formatCurrency(prizePool)}</span>
                      <span className="flex items-center gap-1 text-zinc-400"><Users className="w-3 h-3 text-blue-400" /> {entryCount}/{t.maxParticipants}</span>
                      <span className="flex items-center gap-1 text-zinc-400"><MapPin className="w-3 h-3 text-fire-400" /> {t.mapName || 'TBA'}</span>
                      <span className="flex items-center gap-1 text-zinc-400"><Clock className="w-3 h-3 text-yellow-400" /> {formatDate(t.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500">Fee:</span>
                      <span className="text-fire-400 font-semibold">{isFreeTournament ? 'FREE' : formatCurrency(entryFee)}</span>
                      <span className="text-zinc-500 ml-2">Format:</span>
                      <span className="text-purple-400 font-semibold">{t.format}</span>
                    </div>

                    <button
                      onClick={() => toggleExpand(t.id, t)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-xs font-medium hover:bg-white/10 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {expandedTournament === t.id ? 'Hide Players' : `View Players (${entryCount})`}
                    </button>

                    {expandedTournament === t.id && (
                      <div className="space-y-2">
                        {entriesLoading[t.id] ? (
                          <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 text-fire-400 animate-spin" /></div>
                        ) : entries[t.id] && entries[t.id].length > 0 ? (
                          entries[t.id].map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg bg-white/3 border border-white/5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-white">{entry.user?.username || 'Unknown'}</span>
                                {entry.placement === 1 && <Trophy className="w-4 h-4 text-yellow-400" />}
                              </div>
                              {isFreeTournament && (
                                <button
                                  onClick={() => setAwardModal({
                                    tournamentId: t.id,
                                    tournamentTitle: t.title,
                                    winnerId: entry.user?.id || '',
                                    winnerName: entry.user?.username || 'Unknown',
                                  })}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
                                >
                                  <Gift className="w-3.5 h-3.5" /> Award Prize
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-zinc-500 text-xs py-3">No players registered</p>
                        )}
                      </div>
                    )}

                    {expandedTournament === t.id && (
                      <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <h4 className="text-xs font-bold text-zinc-300 mb-2 uppercase tracking-wider">Match Details</h4>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-zinc-500">Room ID</label>
                            <input
                              value={matchDetails[t.id]?.roomId || ''}
                              onChange={(e) => setMatchDetails((prev) => ({ ...prev, [t.id]: { ...prev[t.id], roomId: e.target.value, roomPassword: prev[t.id]?.roomPassword || '' } }))}
                              placeholder="Enter room ID"
                              className="input-field w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500">Room Password <span className="text-zinc-600">(optional)</span></label>
                            <input
                              value={matchDetails[t.id]?.roomPassword || ''}
                              onChange={(e) => setMatchDetails((prev) => ({ ...prev, [t.id]: { roomId: prev[t.id]?.roomId || '', roomPassword: e.target.value } }))}
                              placeholder="Enter room password"
                              className="input-field w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm mt-1"
                            />
                          </div>
                          <button
                            onClick={() => handleSaveMatchDetails(t.id)}
                            disabled={savingMatch === t.id}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {savingMatch === t.id ? 'Saving...' : 'Save Match Details'}
                          </button>
                          {matchMsg[t.id] && (
                            <p className={`text-xs mt-1 ${matchMsg[t.id].includes('saved') ? 'text-green-400' : 'text-red-400'}`}>{matchMsg[t.id]}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {awardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Award Prize Money</h3>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-sm text-zinc-400">Tournament</p>
                <p className="text-white font-medium">{awardModal.tournamentTitle}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">Winner</p>
                <p className="text-white font-medium">{awardModal.winnerName}</p>
              </div>
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Prize Amount (₹)</label>
                <input
                  type="number"
                  value={prizeAmount}
                  onChange={(e) => setPrizeAmount(e.target.value)}
                  placeholder="Enter prize amount"
                  className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                  min={1}
                  required
                />
              </div>
            </div>

            {awardErr && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-3"><AlertCircle className="w-4 h-4" /> {awardErr}</div>}
            {awardMsg && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-3"><CheckCircle className="w-4 h-4" /> {awardMsg}</div>}

            <div className="flex gap-3">
              <button
                onClick={() => { setAwardModal(null); setPrizeAmount(''); setAwardErr(''); setAwardMsg(''); }}
                className="flex-1 px-4 py-2 rounded-xl bg-white/5 text-zinc-300 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAwardPrize}
                disabled={awarding || !prizeAmount || Number(prizeAmount) <= 0}
                className="flex-1 px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {awarding ? 'Transferring...' : 'Confirm & Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
