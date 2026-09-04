'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, Users, Shield, ArrowRight, Loader2, CheckCircle, AlertCircle,
  Upload, DollarSign, MapPin, Clock, Plus, Smartphone, Monitor, Gamepad2, Globe,
  ToggleLeft, ToggleRight, Key, KeyRound, X, Image as ImageIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { hostApi, winnerProofApi, uploadApi, formatDate, formatCurrency, getStatusColor, CommissionBreakdown } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import { calculateCommission } from '@/lib/commission';

interface TeamMember {
  id: string;
  role?: string;
  user: {
    id: string;
    username: string;
    ign: string | null;
    freeFireId: string | null;
    gameLevel?: number;
    isVerified?: boolean;
    displayName?: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  tag?: string | null;
  members: TeamMember[];
}

interface Entry {
  id: string;
  userId: string | null;
  user: {
    id: string;
    username: string;
    ign: string | null;
    freeFireId: string | null;
    gameLevel?: number;
    isVerified?: boolean;
    displayName?: string | null;
  } | null;
  teamId?: string | null;
  team?: Team | null;
  placement?: number | null;
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
  roomId?: string | null;
  roomPassword?: string | null;
  delayedCount?: number;
  platformCommission?: number | string;
  hostCommission?: number | string;
  remainingPool?: number | string;
  _count: { entries: number };
  entries: Entry[];
}

const round2 = (val: any) => Math.round(Number(val) || 0);

export default function HostDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, isHost, isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [winnerUid, setWinnerUid] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', entryFee: 10, maxParticipants: 50, teamSize: '' as string, format: 'SOLO' as string, platform: 'MOBILE' as string, gameMode: 'FULL_MAP' as string, mapName: '', registrationStart: '', registrationEnd: '', startTime: '', description: '' });
  const [prizes, setPrizes] = useState({ first: 0, second: 0, third: 0 });
  const [prizeCount, setPrizeCount] = useState(3);
  const [breakdown, setBreakdown] = useState<CommissionBreakdown | null>(null);
  const [createErr, setCreateErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [completeMsg, setCompleteMsg] = useState('');

  // Room ID & Password Modal State
  const [roomModalTournament, setRoomModalTournament] = useState<Tournament | null>(null);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);
  const [roomSuccessMsg, setRoomSuccessMsg] = useState('');
  const [roomErrorMsg, setRoomErrorMsg] = useState('');

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

  const effectiveMaxParticipants = form.gameMode === 'CLASH_SQUAD'
    ? ({ '1v1': 2, '2v2': 4, '4v4': 8, '6v6': 12 }[form.teamSize] || 0)
    : form.maxParticipants;

  // Max Prize Pool is display/validation only — prize fields are 100% manual
  useEffect(() => {
    if (Number(effectiveMaxParticipants) > 0 && Number(form.entryFee) > 0) {
      setBreakdown(calculateCommission(Number(form.entryFee), Number(effectiveMaxParticipants)));
    } else {
      setBreakdown(null);
    }
  }, [form.entryFee, effectiveMaxParticipants]);

  // Clean & Direct Prize Calculation and Validation
  const prize1Num = Number(prizes.first) || 0;
  const prize2Num = prizeCount >= 2 ? (Number(prizes.second) || 0) : 0;
  const prize3Num = prizeCount >= 3 ? (Number(prizes.third) || 0) : 0;

  const totalDistribution = prize1Num + prize2Num + prize3Num;
  const maxPrizePool = Math.round(Number(breakdown?.maxPrizePool) || 0);
  const maxPool = maxPrizePool;
  const totalPrizes = totalDistribution;

  const isPrizesBalanced = Number(totalDistribution) === Number(maxPrizePool);

  const prizeError = (maxPrizePool > 0 && !isPrizesBalanced)
    ? `Prize distribution must equal the Max Prize Pool: ₹${maxPrizePool} (currently ₹${totalDistribution})`
    : '';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (maxPool > 0 && !isPrizesBalanced) return;
    setCreateErr('');
    setCreating(true);
    try {
      const prizePoolTotal = totalPrizes;
      const isClashSquad = form.gameMode === 'CLASH_SQUAD';
      const teamSizeMap: Record<string, number> = { '1v1': 2, '2v2': 4, '4v4': 8, '6v6': 12 };
      const clashFormatMap: Record<string, string> = { '1v1': 'SOLO', '2v2': 'DUO', '4v4': 'SQUAD', '6v6': 'SQUAD' };
      const data: any = {
        ...form,
        format: isClashSquad ? (clashFormatMap[form.teamSize] || 'SQUAD') : form.format,
        platform: form.platform,
        gameMode: form.gameMode,
        entryFee: Number(form.entryFee),
        prizePool: prizePoolTotal,
        prizeFirst: round2(prizes.first),
        prizeSecond: prizeCount >= 2 ? round2(prizes.second) : null,
        prizeThird: prizeCount >= 3 ? round2(prizes.third) : null,
        maxParticipants: isClashSquad ? teamSizeMap[form.teamSize] || 2 : Number(form.maxParticipants),
        registrationStart: new Date(form.registrationStart).toISOString(),
        registrationEnd: new Date(form.registrationEnd).toISOString(),
        startTime: new Date(form.startTime).toISOString(),
      };
      if (isClashSquad) data.teamSize = form.teamSize;

      await hostApi.createTournament(data);
      setShowCreate(false);
      setForm({ title: '', entryFee: 10, maxParticipants: 50, teamSize: '', format: 'SOLO', platform: 'MOBILE', gameMode: 'FULL_MAP', mapName: '', registrationStart: '', registrationEnd: '', startTime: '', description: '' });
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

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(selected.type)) {
      setSubmitErr('Only JPG, PNG, or WebP images are allowed');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setSubmitErr('File size must be under 10MB');
      return;
    }
    setProofFile(selected);
    setProofPreview(URL.createObjectURL(selected));
    setSubmitErr('');
  };

  const handleSubmitWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament) return;
    if (!proofFile && !screenshotUrl) {
      setSubmitErr('Please select a screenshot file to upload as winner proof');
      return;
    }
    setSubmitErr('');
    setSubmitMsg('');
    setSubmitting(true);
    try {
      let finalScreenshotUrl = screenshotUrl;
      if (proofFile) {
        const uploadRes = await uploadApi.verificationScreenshot(proofFile);
        finalScreenshotUrl = uploadRes?.data?.screenshotUrl || uploadRes?.screenshotUrl;
      }
      if (!finalScreenshotUrl) {
        throw new Error('Screenshot upload failed: no URL returned');
      }

      const res = await winnerProofApi.submit({
        tournamentId: selectedTournament.id,
        winnerUid: winnerUid.trim(),
        screenshotUrl: finalScreenshotUrl,
      });
      setSubmitMsg(res.message || 'Winner proof submitted!');
      setWinnerUid('');
      setScreenshotUrl('');
      setProofFile(null);
      setProofPreview(null);
    } catch (err) {
      setSubmitErr(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenRoomModal = (t: Tournament) => {
    setRoomModalTournament(t);
    setRoomIdInput(t.roomId || '');
    setRoomPasswordInput(t.roomPassword || '');
    setRoomSuccessMsg('');
    setRoomErrorMsg('');
  };

  const handleSaveRoomDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomModalTournament) return;
    setSavingRoom(true);
    setRoomSuccessMsg('');
    setRoomErrorMsg('');
    try {
      await hostApi.updateRoomDetails(roomModalTournament.id, {
        roomId: roomIdInput.trim(),
        roomPassword: roomPasswordInput.trim() || undefined,
      });
      setRoomSuccessMsg('Custom Room details saved successfully! Registered players will be able to see credentials 5 minutes prior to match start.');
      // Refresh tournaments list
      const res = await hostApi.getMyTournaments();
      setTournaments(res.data || []);
      // Update current selected tournament if any
      setRoomModalTournament((prev) =>
        prev
          ? {
              ...prev,
              roomId: roomIdInput.trim() || null,
              roomPassword: roomPasswordInput.trim() || null,
            }
          : null
      );
    } catch (err) {
      setRoomErrorMsg(getErrorMessage(err));
    } finally {
      setSavingRoom(false);
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
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/20 text-fire-400 text-sm font-medium hover:bg-fire-500/30">
              <Plus className="w-4 h-4" /> {showCreate ? 'Cancel' : 'Create Tournament'}
            </button>
          </div>
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
                      teamSize: gm === 'CLASH_SQUAD' ? (f.teamSize || '4v4') : f.teamSize,
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
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Entry Fee (₹)</label>
                <input
                  type="number"
                  value={form.entryFee === 0 ? '' : form.entryFee}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/^0+(?=\d)/, '');
                    const v = raw === '' ? 0 : Number(raw);
                    setForm({ ...form, entryFee: isNaN(v) ? 0 : v });
                  }}
                  placeholder="0"
                  className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                  min={0}
                  required
                />
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
                    <input
                      type="number"
                      value={form.maxParticipants === 0 ? '' : form.maxParticipants}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        const v = raw === '' ? 0 : Number(raw);
                        setForm({ ...form, maxParticipants: isNaN(v) ? 0 : v });
                      }}
                      placeholder="0"
                      className="input-field w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                      min={2}
                      required
                    />
                  </div>
                </>
              )}
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
                  {(() => {
                    const isCreatingTeam = form.gameMode === 'CLASH_SQUAD' ? form.teamSize !== '1v1' : form.format !== 'SOLO';
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5 block">
                              {isCreatingTeam ? '1st Winning Team' : '1st Place'}
                            </label>
                            <input
                              type="number"
                              value={prizes.first === 0 ? '' : prizes.first}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/^0+(?=\d)/, '');
                                const num = raw === '' ? 0 : Number(raw);
                                setPrizes((prev) => ({ ...prev, first: isNaN(num) ? 0 : num }));
                              }}
                              placeholder="0"
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
                              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5 block">
                                {isCreatingTeam ? '2nd Winning Team' : '2nd Place'}
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (prizeCount >= 2) {
                                    setPrizes((prev) => ({ ...prev, first: parseFloat((Number(prev.first) + Number(prev.second)).toFixed(2)), second: 0 }));
                                    setPrizeCount(1);
                                  } else {
                                    setPrizeCount(2);
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
                                value={prizes.second === 0 ? '' : prizes.second}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/^0+(?=\d)/, '');
                                  const num = raw === '' ? 0 : Number(raw);
                                  setPrizes((prev) => ({ ...prev, second: isNaN(num) ? 0 : num }));
                                }}
                                placeholder="0"
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
                              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5 block">
                                {isCreatingTeam ? '3rd Winning Team' : '3rd Place'}
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (prizeCount >= 3) {
                                    setPrizes((prev) => ({ ...prev, first: parseFloat((Number(prev.first) + Number(prev.third)).toFixed(2)), second: prizeCount >= 2 ? Number(prev.second) : 0, third: 0 }));
                                    setPrizeCount(2);
                                  } else if (prizeCount === 2) {
                                    setPrizeCount(3);
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
                                value={prizes.third === 0 ? '' : prizes.third}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/^0+(?=\d)/, '');
                                  const num = raw === '' ? 0 : Number(raw);
                                  setPrizes((prev) => ({ ...prev, third: isNaN(num) ? 0 : num }));
                                }}
                                placeholder="0"
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
                      </>
                    );
                  })()}
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

            <button type="submit" disabled={creating || (maxPool > 0 && !isPrizesBalanced)} className="btn-fire px-6 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
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
                    {t.roomId ? (
                      <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded flex items-center gap-1 font-mono">
                        <Key className="w-3 h-3" />
                        Room: {t.roomId}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1">
                        <Key className="w-3 h-3" />
                        No Room ID set
                      </span>
                    )}
                  </div>

                  {t.entries.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-zinc-300">
                          {t.format === 'SOLO' ? 'Registered Players' : 'Registered Teams & Rosters'}
                        </p>
                        <span className="text-xs text-zinc-500">
                          {t.format === 'SOLO' ? `${t.entries.length} players` : `${t.entries.length} teams`}
                        </span>
                      </div>
                      {t.format === 'DUO' || t.format === 'SQUAD' || t.entries.some((e: any) => e.team) ? (
                        <div className="grid sm:grid-cols-2 gap-3">
                          {t.entries.map((entry: any, tIdx: number) => {
                            const team = entry.team;
                            const members = team?.members && team.members.length > 0
                              ? team.members
                              : entry.user ? [{ id: entry.id, role: 'LEADER', user: entry.user }] : [];

                            return (
                              <div
                                key={entry.id}
                                className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all space-y-2.5"
                              >
                                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-6 rounded-lg bg-fire-500/20 text-fire-400 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                                      #{tIdx + 1}
                                    </div>
                                    <span className="font-bold text-white text-sm truncate">
                                      {team?.name || `Team ${entry.user?.username || tIdx + 1}`}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-400">
                                      {members.length} {members.length === 1 ? 'player' : 'players'}
                                    </span>
                                    {entry.placement && (
                                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30">
                                        #{entry.placement}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  {members.map((m: any, mIdx: number) => (
                                    <div
                                      key={m.id || mIdx}
                                      className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${mIdx === 0 || m.role === 'LEADER' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
                                          {mIdx === 0 || m.role === 'LEADER' ? 'C' : `#${mIdx + 1}`}
                                        </span>
                                        <span className="text-white font-medium truncate">{m.user?.username || '—'}</span>
                                        {m.user?.ign && (
                                          <span className="text-fire-400 font-mono text-[11px] truncate">({m.user.ign})</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {m.user?.gameLevel != null && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25 font-mono">
                                            Lv. {m.user.gameLevel}
                                          </span>
                                        )}
                                        <span className="font-mono text-zinc-400 text-[11px]">{m.user?.freeFireId || '—'}</span>
                                        {m.user?.isVerified && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                            Verified
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/5 text-zinc-500 text-xs">
                                <th className="text-left px-3 py-2 font-medium">Username</th>
                                <th className="text-left px-3 py-2 font-medium">IGN</th>
                                <th className="text-left px-3 py-2 font-medium">Free Fire ID</th>
                                <th className="text-left px-3 py-2 font-medium">Level</th>
                                <th className="text-left px-3 py-2 font-medium">Status</th>
                                <th className="text-left px-3 py-2 font-medium">Registered</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.entries.map((e) => (
                                <tr key={e.id} className="border-b border-white/5 last:border-0 text-xs">
                                  <td className="px-3 py-2 text-white font-medium">{e.user?.username || '—'}</td>
                                  <td className="px-3 py-2 text-fire-400 font-mono">{e.user?.ign || '—'}</td>
                                  <td className="px-3 py-2 text-zinc-400 font-mono">{e.user?.freeFireId || '—'}</td>
                                  <td className="px-3 py-2 text-blue-300 font-mono">{e.user?.gameLevel ? `Lv. ${e.user.gameLevel}` : '—'}</td>
                                  <td className="px-3 py-2">
                                    {e.user?.isVerified ? (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px]">Verified</span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">Unverified</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-zinc-500">{formatDate(e.registeredAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {/* Custom Room ID & Password host update button */}
                    <button
                      type="button"
                      onClick={() => handleOpenRoomModal(t)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25 text-sm font-semibold transition-all shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                    >
                      <KeyRound className="w-4 h-4" />
                      {t.roomId ? 'Update Room ID / Password' : 'Set Room ID & Password'}
                    </button>

                    {t._count.entries > 0 && t._count.entries < t.maxParticipants && (t.status === 'REGISTRATION' || t.status === 'DRAFT') && (
                      <button onClick={() => { const tId = t.id; handleDelay(tId); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-sm font-medium hover:bg-yellow-500/20 transition-colors">
                        <Clock className="w-4 h-4" /> Delay
                      </button>
                    )}
                    {t.entries.length > 0 && (t.status === 'ACTIVE' || t.status === 'COMPLETED') && (
                      <button
                        onClick={() => {
                          if (selectedTournament?.id === t.id) {
                            setSelectedTournament(null);
                          } else {
                            setSelectedTournament(t);
                            setWinnerUid('');
                            setScreenshotUrl('');
                            setProofFile(null);
                            setProofPreview(null);
                            setSubmitErr('');
                            setSubmitMsg('');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fire-500/10 text-fire-400 text-sm font-medium hover:bg-fire-500/20 transition-colors"
                      >
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
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">
                          Submit Winner Proof — {t.format === 'SOLO' ? 'Solo Match' : `${t.format} Match`}
                        </p>
                        {t.format !== 'SOLO' && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-medium">
                            Team Split Payout
                          </span>
                        )}
                      </div>
                      {submitMsg && <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> {submitMsg}</div>}
                      {submitErr && <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 text-red-400 text-sm"><AlertCircle className="w-4 h-4" /> {submitErr}</div>}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                          {t.format === 'SOLO' ? '🥇 1st Place Free Fire Winner UID' : '🥇 1st Winning Team — Member/Captain UID'}
                        </label>
                        <input
                          type="text"
                          value={winnerUid}
                          onChange={(e) => setWinnerUid(e.target.value)}
                          placeholder={t.format === 'SOLO' ? 'Winner Free Fire UID (e.g. 123456789)' : 'Enter any winning team member/captain UID'}
                          className="input-field w-full px-3.5 py-2.5 rounded-xl text-white text-sm bg-black/40 border border-white/10 font-mono focus:border-fire-500/50"
                          required
                        />
                        {t.format !== 'SOLO' && (
                          <p className="text-[11px] text-zinc-400 mt-1.5">
                            Enter any verified Free Fire UID belonging to the 1st winning team. When approved by admin, the prize will automatically split equally among all verified teammates directly into their wallets.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Winner Match Screenshot Proof</label>
                        <div className="border-2 border-dashed border-white/15 rounded-xl p-4 text-center hover:border-fire-500/40 transition-colors bg-black/20">
                          {proofPreview ? (
                            <div className="relative inline-block">
                              <Image
                                src={proofPreview}
                                alt="Winner proof preview"
                                width={280}
                                height={160}
                                className="rounded-lg object-cover max-h-44 border border-white/10 shadow-lg"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setProofFile(null);
                                  setProofPreview(null);
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <p className="text-[11px] text-zinc-400 mt-2 truncate max-w-[280px]">{proofFile?.name}</p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full flex flex-col items-center justify-center py-4 gap-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <div className="p-2.5 rounded-full bg-fire-500/10 text-fire-400 border border-fire-500/20">
                                <Upload className="w-5 h-5" />
                              </div>
                              <span className="text-sm font-medium">Click to upload screenshot file</span>
                              <span className="text-xs text-zinc-500">JPG, PNG or WebP (max 10MB) from device storage</span>
                            </button>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/jpg,image/webp"
                            onChange={handleProofFileChange}
                            className="hidden"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting || !winnerUid.trim() || (!proofFile && !screenshotUrl)}
                        className="btn-fire w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-fire-500/20"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Uploading &amp; Submitting...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" /> Submit Proof for Admin Payout
                          </>
                        )}
                      </button>
                    </motion.form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Custom Room ID & Password Modal */}
        {roomModalTournament && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-full max-w-md rounded-2xl bg-zinc-950 border border-white/10 p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Custom Room Details</h3>
                    <p className="text-xs text-zinc-400 line-clamp-1">{roomModalTournament.title}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRoomModalTournament(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Notice */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Room ID &amp; Password saved here will automatically unlock for all registered players on their tournament match screen <strong>5 minutes before match start</strong>.
                </span>
              </div>

              {/* Success / Error alerts */}
              {roomSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{roomSuccessMsg}</span>
                </div>
              )}
              {roomErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{roomErrorMsg}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSaveRoomDetails} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Free Fire Room ID <span className="text-fire-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    placeholder="e.g., 7839201"
                    className="input-field w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono text-sm focus:border-blue-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Room Password <span className="text-zinc-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={roomPasswordInput}
                    onChange={(e) => setRoomPasswordInput(e.target.value)}
                    placeholder="e.g., 1234"
                    className="input-field w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono text-sm focus:border-blue-500/50 transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRoomModalTournament(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingRoom || !roomIdInput.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-[0_0_20px_rgba(37,99,235,0.3)]"
                  >
                    {savingRoom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {savingRoom ? 'Saving...' : 'Save Room Details'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
