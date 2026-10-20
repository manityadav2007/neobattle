'use client';

import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Search, UploadCloud, X, CheckCircle, AlertCircle, AlertTriangle,
  RefreshCw, Trophy, Users, Shield, Plus, Minus, Trash2, Edit3, Crown,
  ExternalLink, Loader2, ArrowLeft, ArrowRight, Check, Eye, HelpCircle,
  Coins, DollarSign, Image as ImageIcon, ZoomIn,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  killCounterApi, formatCurrency, formatDate, getStatusColor,
  type Tournament,
} from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface PlayerCandidate {
  id: string;
  inGameNickname?: string | null;
  ign?: string | null;
  username?: string | null;
  freeFireId?: string | null;
  gameLevel?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  teamTag?: string | null;
}

interface MatchedRow {
  slot: number;
  rawName: string;
  normalizedName: string;
  kills: number;
  greyed: boolean;
  confidence: 'EXACT' | 'FUZZY_HIGH' | 'FUZZY_MEDIUM' | 'UNMATCHED';
  needsManualReview: boolean;
  manualReason?: string;
  matchedPlayer: PlayerCandidate | null;
  ambiguousCandidates?: PlayerCandidate[];
}

interface UsageInfo {
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  estimatedCostInr?: number;
}

function ScreenshotKillCounterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTournamentId = searchParams.get('tournamentId') || '';

  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();

  // Search & Selected Tournament
  const [searchQuery, setSearchQuery] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(initialTournamentId);
  const [tournament, setTournament] = useState<any>(null);
  const [candidates, setCandidates] = useState<PlayerCandidate[]>([]);
  const [isTeamTournament, setIsTeamTournament] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  // Screenshots in Center Column
  const [existingScreenshots, setExistingScreenshots] = useState<Array<{ key: string; url: string }>>([]);
  const [adminAddedFiles, setAdminAddedFiles] = useState<File[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Winner UID State
  const [hostGivenWinnerUid, setHostGivenWinnerUid] = useState<string>('');
  const [confirmedWinnerUid, setConfirmedWinnerUid] = useState<string>('');

  // Scan & Detection Results
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([]);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);

  // Player Search in Left Column
  const [playerFilter, setPlayerFilter] = useState('');

  // Preview Modal for Prize Distribution
  const [previewOpen, setPreviewOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distributeSuccess, setDistributeSuccess] = useState<any>(null);
  const [distributeError, setDistributeError] = useState('');

  // Auth Protection
  useEffect(() => {
    if (!authLoading && (!user || (!isAdmin && !isSuperAdmin))) {
      router.push('/dashboard');
    }
  }, [user, authLoading, isAdmin, isSuperAdmin, router]);

  // Search Tournaments
  const handleSearch = async (query = searchQuery) => {
    setSearching(true);
    try {
      const res = await killCounterApi.searchTournaments(query);
      setTournaments(res.data || []);
    } catch (err) {
      console.error('Failed to search tournaments:', err);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (user && (isAdmin || isSuperAdmin) && !initialTournamentId) {
      handleSearch('');
    }
  }, [user, isAdmin, isSuperAdmin, initialTournamentId]);

  // Load Tournament Screenshot Data
  const loadTournamentData = async (id: string) => {
    setLoadingData(true);
    setDataError('');
    setScanError('');
    setMatchedRows([]);
    setUsageInfo(null);
    setDistributeSuccess(null);

    try {
      const res = await killCounterApi.getScreenshotData(id);
      const data = res.data;
      if (!data) throw new Error(res.message || 'Failed to load tournament screenshot data');
      setTournament(data.tournament);
      setCandidates(data.candidates || []);
      setIsTeamTournament(Boolean(data.isTeamTournament));
      setExistingScreenshots(data.existingScreenshots || []);
      setAdminAddedFiles([]);
      setActiveImageIndex(0);

      const hostUid = data.pendingSubmission?.firstUid || '';
      setHostGivenWinnerUid(hostUid);
      setConfirmedWinnerUid(hostUid);

      // Prepopulate finalKillList if it was already saved
      if (data.finalKillList && Array.isArray(data.finalKillList)) {
        // Map back to rows if applicable
      }
    } catch (err: any) {
      setDataError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (selectedTournamentId) {
      loadTournamentData(selectedTournamentId);
    }
  }, [selectedTournamentId]);

  // Combine image preview list (existing URLs + new File object URLs)
  const allImages = useMemo(() => {
    const list: Array<{ id: string; url: string; isFile: boolean; file?: File; key?: string }> = [];
    existingScreenshots.forEach((item, idx) => {
      list.push({ id: `existing-${idx}`, url: item.url, isFile: false, key: item.key });
    });
    adminAddedFiles.forEach((file, idx) => {
      list.push({ id: `new-${idx}`, url: URL.createObjectURL(file), isFile: true, file });
    });
    return list;
  }, [existingScreenshots, adminAddedFiles]);

  const handleAddAdminFiles = (files: FileList | File[]) => {
    const added: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 5 * 1024 * 1024) {
        added.push(f);
      }
    }
    setAdminAddedFiles((prev) => [...prev, ...added]);
  };

  const handleRemoveImage = (index: number) => {
    if (index < existingScreenshots.length) {
      setExistingScreenshots((prev) => prev.filter((_, i) => i !== index));
    } else {
      const fileIdx = index - existingScreenshots.length;
      setAdminAddedFiles((prev) => prev.filter((_, i) => i !== fileIdx));
    }
    if (activeImageIndex >= allImages.length - 1) {
      setActiveImageIndex(Math.max(0, allImages.length - 2));
    }
  };

  // Perform Gemini AI Scan
  const handleScanScreenshots = async () => {
    if (!tournament) return;
    if (allImages.length === 0) {
      setScanError('Please ensure at least one screenshot is uploaded to scan.');
      return;
    }

    setScanning(true);
    setScanError('');
    try {
      const fd = new FormData();
      fd.append('tournamentId', tournament.id);

      // Append existing keys
      existingScreenshots.forEach((item) => {
        if (item.key) fd.append('storageKeys', item.key);
      });

      // Append newly uploaded admin files
      adminAddedFiles.forEach((file) => {
        fd.append('screenshots', file);
      });

      const res = await killCounterApi.scanScreenshots(fd);
      if (res.data) {
        setMatchedRows(res.data.matchedRows || []);
        setUsageInfo(res.data.usage || null);
      }
    } catch (err: any) {
      setScanError(getErrorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  // Update a row's matched player manually
  const handleAssignPlayerToRow = (rowIndex: number, playerId: string) => {
    const player = candidates.find((c) => c.id === playerId) || null;
    setMatchedRows((prev) => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        matchedPlayer: player,
        needsManualReview: false,
        confidence: player ? 'EXACT' : 'UNMATCHED',
        manualReason: player ? undefined : updated[rowIndex].manualReason,
      };
      return updated;
    });
  };

  // Update a row's kill count
  const handleUpdateRowKills = (rowIndex: number, delta: number) => {
    setMatchedRows((prev) => {
      const updated = [...prev];
      const cur = updated[rowIndex].kills || 0;
      updated[rowIndex] = { ...updated[rowIndex], kills: Math.max(0, cur + delta) };
      return updated;
    });
  };

  // Set explicit kill count
  const handleSetRowKills = (rowIndex: number, kills: number) => {
    setMatchedRows((prev) => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], kills: Math.max(0, kills) };
      return updated;
    });
  };

  // Delete / Remove row
  const handleDeleteRow = (rowIndex: number) => {
    setMatchedRows((prev) => prev.filter((_, i) => i !== rowIndex));
  };

  // Compute aggregated kills per candidate
  const candidateKillCounts = useMemo(() => {
    const map = new Map<string, number>();
    candidates.forEach((c) => map.set(c.id, 0));
    matchedRows.forEach((r) => {
      if (r.matchedPlayer?.id) {
        const cur = map.get(r.matchedPlayer.id) || 0;
        map.set(r.matchedPlayer.id, cur + (r.kills || 0));
      }
    });
    return map;
  }, [candidates, matchedRows]);

  // Missing registered players (0 kills or not matched in any row)
  const missingCandidates = useMemo(() => {
    return candidates.filter((c) => (candidateKillCounts.get(c.id) || 0) === 0);
  }, [candidates, candidateKillCounts]);

  // Filtered Candidate List for Left Column
  const filteredCandidates = useMemo(() => {
    if (!playerFilter.trim()) return candidates;
    const q = playerFilter.toLowerCase().trim();
    return candidates.filter((c) =>
      (c.ign && c.ign.toLowerCase().includes(q)) ||
      (c.username && c.username.toLowerCase().includes(q)) ||
      (c.freeFireId && c.freeFireId.toLowerCase().includes(q)) ||
      (c.teamName && c.teamName.toLowerCase().includes(q))
    );
  }, [candidates, playerFilter]);

  // Payout Breakdown Calculations
  const payoutCalculation = useMemo(() => {
    if (!tournament) return null;
    const perKillRate = Number(tournament.perKillRate) || 0;
    const booyahPrize = Number(tournament.booyahPrize) || 0;

    let totalKills = 0;
    const playerPayouts: Array<{
      player: PlayerCandidate;
      kills: number;
      killPrize: number;
      isWinner: boolean;
      booyahPrize: number;
      totalPrize: number;
    }> = [];

    candidates.forEach((cand) => {
      const kills = candidateKillCounts.get(cand.id) || 0;
      totalKills += kills;
      const isWinner =
        Boolean(confirmedWinnerUid) &&
        ((cand.freeFireId && cand.freeFireId.trim() === confirmedWinnerUid.trim()) ||
          cand.username?.toLowerCase() === confirmedWinnerUid.toLowerCase() ||
          cand.id === confirmedWinnerUid);

      const killPrize = kills * perKillRate;
      const winnerBonus = isWinner ? booyahPrize : 0;
      const total = killPrize + winnerBonus;

      if (kills > 0 || isWinner) {
        playerPayouts.push({
          player: cand,
          kills,
          killPrize,
          isWinner,
          booyahPrize: winnerBonus,
          totalPrize: total,
        });
      }
    });

    const totalPlayerPrize = playerPayouts.reduce((sum, p) => sum + p.totalPrize, 0);
    const hostAmount = Math.round(Number(tournament.hostCommission) || 0);
    const entryFee = Number(tournament.entryFee) || 0;
    const totalCollection = (tournament._count?.entries || tournament.entries?.length || 0) * entryFee;

    const platformAmount =
      totalCollection > 0
        ? Math.max(0, totalCollection - hostAmount - totalPlayerPrize)
        : Math.round(Number(tournament.platformCommission) || 0);

    return {
      playerPayouts,
      totalKills,
      totalPlayerPrize,
      hostAmount,
      platformAmount,
      totalCollection,
    };
  }, [tournament, candidates, candidateKillCounts, confirmedWinnerUid]);

  // Execute Distribution
  const handleExecuteDistribution = async () => {
    if (!tournament || !confirmedWinnerUid.trim()) return;

    setDistributing(true);
    setDistributeError('');
    try {
      const killsMap: Record<string, number> = {};
      candidateKillCounts.forEach((kills, playerId) => {
        killsMap[playerId] = kills;
      });

      const res = await killCounterApi.distributePerKill({
        tournamentId: tournament.id,
        confirmedWinnerUid: confirmedWinnerUid.trim(),
        kills: killsMap,
      });

      if (res.data) {
        setDistributeSuccess(res.data);
      }
      setPreviewOpen(false);
      // Reload tournament data to reflect PAID status
      await loadTournamentData(tournament.id);
    } catch (err: any) {
      setDistributeError(getErrorMessage(err));
    } finally {
      setDistributing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 overflow-x-hidden">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Admin Panel
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-300 font-medium">Screenshot AI Kill Counter</span>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fire-500/10 border border-fire-500/20 flex items-center justify-center text-fire-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                Screenshot AI Kill Counter
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-fire-500/15 text-fire-300 border border-fire-500/30 font-bold uppercase tracking-wider">
                Admin Multimodal Tool
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Scoreboard screenshot OCR for Per-Kill tournaments • Automatic IGN fuzzy matching with manual review safeguards
            </p>
          </div>
        </div>

        {/* Tournament Switcher / Status */}
        <div className="flex items-center gap-3 shrink-0">
          {tournament && (
            <div className="text-right">
              <span className="text-xs font-mono text-zinc-400 block">UID: {tournament.uid}</span>
              <span className="text-xs font-bold text-amber-300">
                ₹{Number(tournament.perKillRate) || 0} / kill • ₹{Number(tournament.booyahPrize) || 0} Booyah
              </span>
            </div>
          )}
          <button
            onClick={() => {
              setSelectedTournamentId('');
              setTournament(null);
              handleSearch('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Select Tournament
          </button>
        </div>
      </div>

      {/* Tournament Selection Modal / View if none selected */}
      {!tournament && (
        <div className="max-w-3xl mx-auto space-y-4 py-8">
          <div className="glass-card rounded-2xl p-4 sm:p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Select a PER-KILL Tournament to Scan
            </h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                placeholder="Search tournaments by title or UID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm focus:outline-none focus:border-fire-500 font-mono"
              />
            </div>

            {searching ? (
              <div className="py-12 text-center text-zinc-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
                Loading tournaments...
              </div>
            ) : tournaments.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-sm">
                No active or completed PER-KILL tournaments found.
              </div>
            ) : (
              <div className="grid gap-2.5 max-h-96 overflow-y-auto pr-1">
                {tournaments.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTournamentId(t.id)}
                    className="p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/10 hover:border-amber-500/40 text-left transition-all flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white text-sm truncate">{t.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">
                        UID: <span className="font-mono text-zinc-300">{t.uid}</span> • Format: {t.format} • Status: {t.status}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-amber-300 block">
                        ₹{Number(t.perKillRate) || 0} / kill
                      </span>
                      <span className="text-[10px] text-zinc-500">Prize Pool: ₹{Number(t.prizePool)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main 3-Column Studio Layout */}
      {tournament && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ========================================================= */}
          {/* LEFT COLUMN: Registered Players & Teams (3 Cols) */}
          {/* ========================================================= */}
          <div className="lg:col-span-3 glass-card rounded-2xl p-4 sm:p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  Roster ({candidates.length})
                </h2>
                <p className="text-[11px] text-zinc-400">Registered tournament participants</p>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {isTeamTournament ? 'Team' : 'Solo'}
              </span>
            </div>

            {/* Candidate Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                value={playerFilter}
                onChange={(e) => setPlayerFilter(e.target.value)}
                placeholder="Filter player or team..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Candidate List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredCandidates.map((cand) => {
                const kills = candidateKillCounts.get(cand.id) || 0;
                const isWinner =
                  Boolean(confirmedWinnerUid) &&
                  ((cand.freeFireId && cand.freeFireId.trim() === confirmedWinnerUid.trim()) ||
                    cand.username?.toLowerCase() === confirmedWinnerUid.toLowerCase() ||
                    cand.id === confirmedWinnerUid);

                return (
                  <div
                    key={cand.id}
                    className={`p-2.5 rounded-xl border transition-all text-xs ${
                      isWinner
                        ? 'bg-yellow-500/10 border-yellow-500/40 shadow-[0_0_12px_rgba(234,179,8,0.15)]'
                        : kills > 0
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : 'bg-white/[0.02] border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate" title={cand.ign || cand.username || ''}>
                            {cand.ign || cand.username}
                          </span>
                          {isWinner && (
                            <span title="Booyah Winner">
                              <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-0.5">
                          <span>UID: {cand.freeFireId || 'No UID'}</span>
                          {cand.teamName && (
                            <span className="px-1 rounded bg-purple-500/20 text-purple-300">
                              {cand.teamName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Kill count pill */}
                      <div className="text-right shrink-0">
                        <span
                          className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                            kills > 0
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-white/5 text-zinc-500'
                          }`}
                        >
                          {kills} {kills === 1 ? 'kill' : 'kills'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================= */}
          {/* MIDDLE COLUMN: Screenshots Viewer & Scan Trigger (5 Cols) */}
          {/* ========================================================= */}
          <div className="lg:col-span-5 glass-card rounded-2xl p-4 sm:p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  Scoreboard Screenshots ({allImages.length})
                </h2>
                <p className="text-[11px] text-zinc-400">Host screenshots loaded. Admin can upload additional images.</p>
              </div>

              {/* Upload Additional Button */}
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 transition-all cursor-pointer">
                <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                Add Image
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files) handleAddAdminFiles(e.target.files);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {/* Active Large Screenshot Viewer */}
            {allImages.length > 0 ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden glass-card border border-white/10 aspect-[16/10] flex items-center justify-center group shadow-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={allImages[activeImageIndex]?.url}
                    alt={`Active Screenshot ${activeImageIndex + 1}`}
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-mono text-zinc-300 border border-white/10">
                    Image {activeImageIndex + 1} of {allImages.length}
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <a
                      href={allImages[activeImageIndex]?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-zinc-300 hover:text-white transition-all border border-white/10"
                      title="Open full image in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(activeImageIndex)}
                      className="p-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-600 text-white transition-all shadow-md cursor-pointer"
                      title="Remove this screenshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Thumbnails Row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {allImages.map((img, idx) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative shrink-0 w-16 h-12 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                        activeImageIndex === idx
                          ? 'border-amber-400 ring-2 ring-amber-400/30'
                          : 'border-white/15 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold text-white bg-black/70 px-1 rounded">
                        #{idx + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-white/15 rounded-2xl bg-white/[0.02] space-y-2">
                <ImageIcon className="w-8 h-8 text-zinc-500 mx-auto" />
                <p className="text-sm font-semibold text-zinc-300">No screenshots uploaded yet</p>
                <p className="text-xs text-zinc-500">Upload at least one Free Fire match scoreboard screenshot to begin.</p>
              </div>
            )}

            {/* Host-Given Winner UID Card */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  Booyah Winner UID
                </span>
                {confirmedWinnerUid && (
                  (() => {
                    const matched = candidates.find(
                      (c) => (c.freeFireId && c.freeFireId.trim() === confirmedWinnerUid.trim()) || c.username?.toLowerCase() === confirmedWinnerUid.toLowerCase() || c.id === confirmedWinnerUid
                    );
                    return matched ? (
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> {matched.ign} (@{matched.username})
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Unknown UID
                      </span>
                    );
                  })()
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  value={confirmedWinnerUid}
                  onChange={(e) => setConfirmedWinnerUid(e.target.value)}
                  placeholder="Free Fire UID of match winner..."
                  className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                />
                {hostGivenWinnerUid && confirmedWinnerUid !== hostGivenWinnerUid && (
                  <button
                    type="button"
                    onClick={() => setConfirmedWinnerUid(hostGivenWinnerUid)}
                    className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-zinc-300 border border-white/10 cursor-pointer shrink-0"
                    title="Reset to Host-provided UID"
                  >
                    Reset ({hostGivenWinnerUid})
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {scanError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {/* Confirm and Scan Button */}
            <button
              type="button"
              onClick={handleScanScreenshots}
              disabled={scanning || allImages.length === 0}
              className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-[0_0_25px_rgba(245,158,11,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Gemini Vision OCR Multimodal Scan...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Confirm and Scan Screenshots with Gemini AI
                </>
              )}
            </button>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: Detected Kills & Distribution (4 Cols) */}
          {/* ========================================================= */}
          <div className="lg:col-span-4 glass-card rounded-2xl p-4 sm:p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Detected Kills ({matchedRows.length} Rows)
                </h2>
                <p className="text-[11px] text-zinc-400">Scoreboard slots mapped to registered players</p>
              </div>

              {matchedRows.length > 0 && (
                <span className="text-xs font-mono font-bold text-amber-300 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/25">
                  Total Kills: {matchedRows.reduce((s, r) => s + (r.kills || 0), 0)}
                </span>
              )}
            </div>

            {/* Token Usage & Cost Card */}
            {usageInfo && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-200 space-y-1">
                <div className="flex items-center justify-between font-mono">
                  <span>Tokens: <strong>{usageInfo.totalTokens || 0}</strong> ({usageInfo.promptTokens || 0} in / {usageInfo.candidatesTokens || 0} out)</span>
                  <span className="text-emerald-400 font-bold">
                    Est. ₹{(usageInfo.estimatedCostInr || 0).toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            {/* Missing Registered Players Warning */}
            {matchedRows.length > 0 && missingCandidates.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Missing Players ({missingCandidates.length} registered players have 0 kills)
                </div>
                <p className="text-[10px] text-amber-200/80">
                  {missingCandidates.slice(0, 5).map((c) => c.ign || c.username).join(', ')}
                  {missingCandidates.length > 5 && ` and ${missingCandidates.length - 5} more...`}
                </p>
              </div>
            )}

            {/* Detected Rows Table */}
            {matchedRows.length > 0 ? (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {matchedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                      row.needsManualReview
                        ? 'bg-amber-500/15 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/50'
                        : row.confidence === 'EXACT'
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : 'bg-white/[0.02] border-white/10'
                    }`}
                  >
                    {/* Top Row: Slot #, Raw OCR name, Confidence badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-zinc-300 font-bold shrink-0">
                          #{row.slot}
                        </span>
                        <span className="font-mono text-zinc-300 truncate" title={row.rawName}>
                          {row.rawName}
                        </span>
                      </div>

                      {/* Confidence badge */}
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase shrink-0 ${
                          row.confidence === 'EXACT'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : row.confidence === 'FUZZY_HIGH'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {row.confidence === 'EXACT'
                          ? 'Exact'
                          : row.confidence === 'FUZZY_HIGH'
                          ? 'Fuzzy'
                          : 'Review'}
                      </span>
                    </div>

                    {/* Needs Manual Review Alert */}
                    {row.needsManualReview && row.manualReason && (
                      <div className="p-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] text-amber-200 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{row.manualReason}</span>
                      </div>
                    )}

                    {/* Assigned Player Selector Dropdown */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <select
                        value={row.matchedPlayer?.id || ''}
                        onChange={(e) => handleAssignPlayerToRow(idx, e.target.value)}
                        className={`flex-1 min-w-[140px] px-2.5 py-1.5 rounded-lg text-xs font-semibold focus:outline-none ${
                          row.needsManualReview
                            ? 'bg-amber-950/80 border border-amber-400 text-amber-100'
                            : 'bg-white/[0.04] border border-white/10 text-white'
                        }`}
                      >
                        <option value="" className="bg-slate-900 text-white">-- Unassigned / Spectator --</option>
                        {candidates.map((cand) => (
                          <option key={cand.id} value={cand.id} className="bg-slate-900 text-white">
                            {cand.ign || cand.username} {cand.freeFireId ? `(${cand.freeFireId})` : ''} {cand.teamName ? `[${cand.teamName}]` : ''}
                          </option>
                        ))}
                      </select>

                      {/* Kill Stepper Controls */}
                      <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateRowKills(idx, -1)}
                          className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 font-bold"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={row.kills}
                          onChange={(e) => handleSetRowKills(idx, parseInt(e.target.value, 10) || 0)}
                          className="w-7 text-center bg-transparent font-mono font-bold text-amber-300 text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateRowKills(idx, 1)}
                          className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 font-bold"
                        >
                          +
                        </button>
                      </div>

                      {/* Remove Row Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(idx)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 text-xs space-y-1">
                <Sparkles className="w-6 h-6 mx-auto text-zinc-600 mb-2" />
                <p>Click &quot;Confirm and Scan&quot; to run Gemini OCR.</p>
                <p>Detected slots and kill counts will appear here.</p>
              </div>
            )}

            {/* Action Button: Distribute Prizes Preview */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                disabled={matchedRows.length === 0 || !confirmedWinnerUid.trim()}
                className="btn-fire w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all cursor-pointer"
              >
                <Coins className="w-4 h-4" />
                Preview &amp; Distribute Prizes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PREVIEW & DISTRIBUTION CONFIRMATION MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {previewOpen && payoutCalculation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto glass-card rounded-2xl p-6 border border-amber-500/40 shadow-2xl space-y-5"
            >
              <button
                onClick={() => setPreviewOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-400" />
                  Prize Distribution Preview
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Review the exact single-credit wallet allocations for &quot;{tournament.title}&quot;.
                </p>
              </div>

              {distributeError && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{distributeError}</span>
                </div>
              )}

              {/* Commission & Total Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono">
                <div>
                  <span className="text-zinc-500 block">Total Kills</span>
                  <strong className="text-amber-300 text-sm">{payoutCalculation.totalKills}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">Player Prizes</span>
                  <strong className="text-emerald-400 text-sm">{formatCurrency(payoutCalculation.totalPlayerPrize)}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">Host Commission</span>
                  <strong className="text-purple-400 text-sm">{formatCurrency(payoutCalculation.hostAmount)}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">Platform Commission</span>
                  <strong className="text-blue-400 text-sm">{formatCurrency(payoutCalculation.platformAmount)}</strong>
                </div>
              </div>

              {/* Player Payout Breakdown Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Player Payouts ({payoutCalculation.playerPayouts.length} Recipients)
                </h4>
                <div className="max-h-60 overflow-y-auto divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
                  {payoutCalculation.playerPayouts.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-white/[0.02]">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{item.player.ign || item.player.username}</span>
                          {item.isWinner && (
                            <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[10px] font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3" /> Booyah Champion
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          UID: {item.player.freeFireId || 'N/A'} • {item.kills} kills × ₹{Number(tournament.perKillRate) || 0}
                          {item.isWinner ? ` + ₹${Number(tournament.booyahPrize) || 0} Booyah` : ''}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {formatCurrency(item.totalPrize)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm Distribution Trigger */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Back to Studio
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDistribution}
                  disabled={distributing}
                  className="btn-fire px-6 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer disabled:opacity-50"
                >
                  {distributing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Executing Atomic Distribution...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm &amp; Credit Wallets Now
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Notification Modal */}
      {distributeSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-card rounded-2xl p-6 border border-emerald-500/40 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Prizes Distributed Successfully!</h3>
            <p className="text-xs text-zinc-300">
              All winner and kill prizes have been credited to player wallets in a single atomic transaction. Host and platform commissions have been settled.
            </p>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono text-zinc-300 space-y-1">
              <div>Total Prize: <strong className="text-emerald-400">{formatCurrency(distributeSuccess.totalPrize)}</strong></div>
              <div>Host Commission: <strong className="text-purple-400">{formatCurrency(distributeSuccess.hostCommission)}</strong></div>
              <div>Platform Commission: <strong className="text-blue-400">{formatCurrency(distributeSuccess.platformCommission)}</strong></div>
            </div>
            <button
              onClick={() => router.push('/admin/pending-results')}
              className="btn-fire w-full py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
            >
              Return to Pending Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminScreenshotKillCounterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-fire-400 mr-2" />
          Loading Screenshot Kill Counter Studio...
        </div>
      }
    >
      <ScreenshotKillCounterContent />
    </Suspense>
  );
}
