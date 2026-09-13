'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crosshair, Search, Upload, Play, Pause, Video, CheckCircle, AlertCircle,
  RefreshCw, Trophy, Users, Shield, ArrowLeft, Plus, Minus, Trash2,
  Edit3, UserCheck, HelpCircle, ExternalLink, Loader2, Sparkles, Check,
  ChevronRight, AlertTriangle, Film, Target, ArrowRight, CornerDownRight, Save,
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

interface TeamGroup {
  id: string;
  name: string;
  tag?: string | null;
  members: Array<{
    id: string;
    role?: string;
    user: {
      id: string;
      username: string;
      ign?: string | null;
      inGameNickname?: string | null;
      freeFireId?: string | null;
      gameLevel?: number | null;
      isVerified?: boolean;
    };
  }>;
}

interface MatchedKillItem {
  playerId: string;
  player: PlayerCandidate;
  kills: number;
  detections: Array<{
    eliminated: string;
    timestamp: number;
    confidence: string;
    score: number;
  }>;
}

interface UnmatchedDetection {
  id: string;
  eliminator: string;
  eliminated: string;
  timestamp: number;
  bestCandidate?: PlayerCandidate | null;
  score: number;
}

export default function AdminKillCounterPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();

  // Step 1: Search & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [confirmedTournament, setConfirmedTournament] = useState<Tournament | null>(null);

  // Step 2: Roster & Tournament Data State
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [candidates, setCandidates] = useState<PlayerCandidate[]>([]);
  const [teams, setTeams] = useState<TeamGroup[]>([]);
  const [soloPlayers, setSoloPlayers] = useState<any[]>([]);
  const [isTeamTournament, setIsTeamTournament] = useState(false);

  // Step 3: Center Column Video State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Step 4: AI Analysis & Progress State
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'ready' | 'processing' | 'completed' | 'failed'>('idle');
  const [progressInfo, setProgressInfo] = useState({
    currentBatch: 0,
    totalBatches: 0,
    percent: 0,
    statusText: '',
  });
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Step 5: Right Column Kills & Manual Adjustments State
  const [matchedKills, setMatchedKills] = useState<Record<string, MatchedKillItem>>({});
  const [unmatchedDetections, setUnmatchedDetections] = useState<UnmatchedDetection[]>([]);
  const [manualAddPlayerId, setManualAddPlayerId] = useState('');

  // Step 6: Finalize / Submit State
  const [finalizing, setFinalizing] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Player search inside Left Column
  const [rosterSearch, setRosterSearch] = useState('');

  // Protect Admin Access
  useEffect(() => {
    if (!authLoading && (!user || (!isSuperAdmin && !isAdmin))) {
      router.push('/dashboard');
    }
  }, [user, authLoading, isSuperAdmin, isAdmin, router]);

  // Initial load of PER_KILL tournaments
  const handleSearchTournaments = async (query = '') => {
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
    if (isAdmin || isSuperAdmin) {
      handleSearchTournaments();
    }
  }, [isAdmin, isSuperAdmin]);

  // Load roster when confirmed
  const loadRosterForTournament = async (t: Tournament) => {
    setLoadingRoster(true);
    setRosterError('');
    try {
      const res = await killCounterApi.getTournamentRoster(t.id);
      const data = res.data;
      if (!data) return;

      setIsTeamTournament(data.isTeamTournament);
      setCandidates(data.candidates || []);

      if (data.isTeamTournament) {
        // Build team groups from entries
        const teamMap = new Map<string, TeamGroup>();
        for (const entry of data.entries) {
          if (entry.team) {
            teamMap.set(entry.team.id, entry.team);
          }
        }
        setTeams(Array.from(teamMap.values()));
        setSoloPlayers([]);
      } else {
        setSoloPlayers(data.entries || []);
        setTeams([]);
      }

      // Initialize matched kills map with 0 for all players
      const initialMap: Record<string, MatchedKillItem> = {};
      for (const cand of data.candidates || []) {
        // If tournament already has saved finalKillList, load existing kills
        const existingKillItem = data.finalKillList?.kills?.find(
          (k: any) => k.playerId === cand.id || k.freeFireId === cand.freeFireId
        );
        const existingKills = existingKillItem ? Number(existingKillItem.kills) || 0 : 0;

        initialMap[cand.id] = {
          playerId: cand.id,
          player: cand,
          kills: existingKills,
          detections: [],
        };
      }
      setMatchedKills(initialMap);
    } catch (err) {
      setRosterError(getErrorMessage(err));
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleSelectTournament = (t: Tournament) => {
    setSelectedTournament(t);
  };

  const handleConfirmTournament = async () => {
    if (!selectedTournament) return;
    setConfirmedTournament(selectedTournament);
    await loadRosterForTournament(selectedTournament);
  };

  const handleResetTournament = () => {
    if (analyzing) {
      if (!confirm('Analysis is currently in progress. Are you sure you want to switch tournaments?')) {
        return;
      }
    }
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setConfirmedTournament(null);
    setSelectedTournament(null);
    setVideoFile(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setActiveJobId(null);
    setAnalysisStatus('idle');
    setMatchedKills({});
    setUnmatchedDetections([]);
    setAnalysisError(null);
    setSubmitSuccessMsg('');
  };

  // Video File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke previous URL if any
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);

    setVideoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(objectUrl);
    setAnalysisStatus('ready');
    setAnalysisError(null);
    setActiveJobId(null);
  };

  // Start AI Video Analysis
  const handleStartAnalysis = async () => {
    if (!confirmedTournament || !videoFile) return;

    setUploading(true);
    setUploadProgress(0);
    setAnalysisError(null);
    setSubmitSuccessMsg('');

    try {
      // 1. Upload video file to server
      const uploadRes = await killCounterApi.uploadVideo(
        confirmedTournament.id,
        videoFile,
        (percent) => setUploadProgress(percent)
      );
      if (!uploadRes.data?.jobId) {
        throw new Error(uploadRes.message || 'Upload succeeded but no job ID was returned');
      }

      const jobId = uploadRes.data.jobId;
      setActiveJobId(jobId);
      setUploading(false);

      // 2. Trigger background analysis
      setAnalyzing(true);
      setAnalysisStatus('processing');
      setProgressInfo({
        currentBatch: 0,
        totalBatches: 0,
        percent: 0,
        statusText: 'Extracting video frames (1 frame every 4s)...',
      });

      await killCounterApi.startAnalysis(jobId);

      // 3. Start Polling for Live Progress
      startPolling(jobId);
    } catch (err: any) {
      setUploading(false);
      setAnalyzing(false);
      setAnalysisStatus('failed');
      setAnalysisError(getErrorMessage(err));
    }
  };

  const startPolling = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await killCounterApi.getJobStatus(jobId);
        const data = res.data;
        if (!data) return;

        setProgressInfo(data.progress || { currentBatch: 0, totalBatches: 0, percent: 0, statusText: '' });

        // Update matched kills from live server state while preserving manual adjustments
        if (data.matchedKills) {
          setMatchedKills((prev) => {
            const next = { ...prev };
            for (const [pId, serverData] of Object.entries(data.matchedKills)) {
              if (next[pId]) {
                next[pId] = {
                  ...next[pId],
                  kills: serverData.kills,
                  detections: serverData.detections || [],
                };
              } else {
                next[pId] = serverData as MatchedKillItem;
              }
            }
            return next;
          });
        }

        if (data.unmatchedDetections) {
          setUnmatchedDetections(data.unmatchedDetections);
        }

        if (data.status === 'completed') {
          setAnalyzing(false);
          setAnalysisStatus('completed');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        } else if (data.status === 'failed') {
          setAnalyzing(false);
          setAnalysisStatus('failed');
          setAnalysisError(data.error || 'Video analysis encountered an error');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }
    }, 2000);
  };

  // Clean up poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  // Manual Adjustments: Increment kill count
  const handleIncrementKill = (playerId: string) => {
    setMatchedKills((prev) => {
      const cur = prev[playerId];
      if (!cur) return prev;
      return {
        ...prev,
        [playerId]: {
          ...cur,
          kills: cur.kills + 1,
        },
      };
    });
  };

  // Manual Adjustments: Decrement kill count
  const handleDecrementKill = (playerId: string) => {
    setMatchedKills((prev) => {
      const cur = prev[playerId];
      if (!cur || cur.kills <= 0) return prev;
      return {
        ...prev,
        [playerId]: {
          ...cur,
          kills: cur.kills - 1,
        },
      };
    });
  };

  // Manual Adjustments: Assign unmatched detection to a player
  const handleAssignUnmatched = (unmatchedItem: UnmatchedDetection, targetPlayerId: string) => {
    if (!targetPlayerId) return;

    // Remove from unmatched
    setUnmatchedDetections((prev) => prev.filter((item) => item.id !== unmatchedItem.id));

    // Add +1 kill to target player
    setMatchedKills((prev) => {
      const cur = prev[targetPlayerId];
      if (!cur) return prev;
      return {
        ...prev,
        [targetPlayerId]: {
          ...cur,
          kills: cur.kills + 1,
          detections: [
            ...cur.detections,
            {
              eliminated: unmatchedItem.eliminated,
              timestamp: unmatchedItem.timestamp,
              confidence: 'MANUAL',
              score: 1.0,
            },
          ],
        },
      };
    });
  };

  // Manual Adjustments: Dismiss unmatched detection
  const handleDismissUnmatched = (id: string) => {
    setUnmatchedDetections((prev) => prev.filter((item) => item.id !== id));
  };

  // Submit Final Kill List
  const handleFinalizeKills = async () => {
    if (!confirmedTournament) return;

    setFinalizing(true);
    setSubmitSuccessMsg('');

    try {
      const finalKillsPayload = Object.values(matchedKills).map((item) => ({
        playerId: item.playerId,
        freeFireId: item.player.freeFireId,
        ign: item.player.inGameNickname || item.player.ign || item.player.username,
        kills: item.kills,
        teamId: item.player.teamId || null,
        teamName: item.player.teamName || null,
      }));

      const res = await killCounterApi.finalizeKills(
        confirmedTournament.id,
        finalKillsPayload,
        unmatchedDetections.length
      );

      setSubmitSuccessMsg(res.message || 'Final kill list submitted successfully!');
      setShowConfirmModal(false);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setFinalizing(false);
    }
  };

  // Computed summary metrics
  const totalRecordedKills = Object.values(matchedKills).reduce((sum, item) => sum + item.kills, 0);
  const perKillRateNum = Number(confirmedTournament?.perKillRate) || 0;
  const booyahPrizeNum = Number(confirmedTournament?.booyahPrize) || 0;
  const totalKillPrizeCalculated = totalRecordedKills * perKillRateNum;

  // Filtered roster for left column search
  const filteredCandidates = candidates.filter((c) => {
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    return (
      (c.inGameNickname && c.inGameNickname.toLowerCase().includes(q)) ||
      (c.ign && c.ign.toLowerCase().includes(q)) ||
      (c.username && c.username.toLowerCase().includes(q)) ||
      (c.freeFireId && c.freeFireId.toLowerCase().includes(q)) ||
      (c.teamName && c.teamName.toLowerCase().includes(q)) ||
      (c.teamTag && c.teamTag.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
            </Link>
          </div>
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-fire-500/20 text-fire-400 border border-fire-500/30">
              <Crosshair className="w-6 h-6" />
            </span>
            AI Kill Counter
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Multimodal AI video detection &amp; kill feed verification engine for Per-Kill tournaments.
          </p>
        </div>

        {confirmedTournament && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetTournament}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 border border-white/10 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Switch Tournament
            </button>
          </div>
        )}
      </div>

      {submitSuccessMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm mb-6 flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <span>{submitSuccessMsg}</span>
          </div>
          <button
            onClick={() => setSubmitSuccessMsg('')}
            className="text-xs text-green-300 underline hover:text-white"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* STEP 1: TOURNAMENT SEARCH & CONFIRMATION */}
      {!confirmedTournament ? (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Search className="w-5 h-5 text-fire-400" />
              1. Select a Per-Kill Tournament
            </h2>
            <p className="text-xs text-zinc-400 mb-4">
              Search by tournament name or UID (e.g. <span className="text-fire-400 font-mono">T-9014</span>). Only tournaments configured with <span className="text-yellow-400 font-semibold">Per Kill format</span> are eligible.
            </p>

            <div className="relative max-w-xl">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearchTournaments(e.target.value);
                }}
                placeholder="Search by Title or UID (e.g., T-9014)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-fire-500/50"
              />
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
              {searching && (
                <Loader2 className="w-4 h-4 text-fire-400 animate-spin absolute right-3.5 top-3.5" />
              )}
            </div>

            {/* Tournament List */}
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tournaments.length === 0 ? (
                <div className="sm:col-span-3 p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 text-zinc-500 text-sm">
                  {searching ? 'Searching...' : 'No Per-Kill tournaments found. Ensure tournaments are created with "Per Kill" format.'}
                </div>
              ) : (
                tournaments.map((t) => {
                  const isSelected = selectedTournament?.id === t.id;
                  const perKillRate = Number(t.perKillRate) || 0;
                  const booyahPrize = Number(t.booyahPrize) || 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTournament(t)}
                      className={`cursor-pointer p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
                        isSelected
                          ? 'bg-fire-500/10 border-fire-500 shadow-lg shadow-fire-500/10'
                          : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-fire-500/20 text-fire-400 border border-fire-500/30">
                            {t.uid || t.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusColor(t.status)}`}>
                            {t.status}
                          </span>
                        </div>

                        <h3 className="font-bold text-white text-sm line-clamp-1 mb-1">{t.title}</h3>
                        <p className="text-xs text-zinc-400 mb-3">
                          {t.format} • {t.gameMode === 'FULL_MAP' ? 'Battle Royale' : 'Clash Squad'} • {t.mapName || 'Bermuda'}
                        </p>

                        <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-black/40 text-[11px] mb-2 border border-white/5">
                          <div>
                            <span className="text-zinc-500 block">Per Kill Rate:</span>
                            <span className="text-yellow-400 font-bold">₹{perKillRate} / kill</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Booyah Prize:</span>
                            <span className="text-fire-400 font-bold">{formatCurrency(booyahPrize)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          {t._count?.entries || 0}/{t.maxParticipants} players
                        </span>
                        {t.finalKillList && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                            ✓ Kills Saved
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Confirmation Card */}
          {selectedTournament && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl p-6 border-fire-500/30 bg-gradient-to-br from-fire-500/10 via-zinc-900 to-black"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-fire-400">
                      {selectedTournament.uid || selectedTournament.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-zinc-400">• Ready to scan gameplay video</span>
                  </div>
                  <h3 className="text-xl font-bold text-white">{selectedTournament.title}</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Format: <span className="text-white font-semibold">{selectedTournament.format}</span> •
                    Participants: <span className="text-white font-semibold">{selectedTournament.maxParticipants} slots</span> •
                    Per Kill Rate: <span className="text-yellow-400 font-bold">₹{Number(selectedTournament.perKillRate) || 0}</span> •
                    Booyah: <span className="text-fire-400 font-bold">{formatCurrency(Number(selectedTournament.booyahPrize) || 0)}</span>
                  </p>
                </div>

                <button
                  onClick={handleConfirmTournament}
                  disabled={loadingRoster}
                  className="btn-fire px-6 py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 shadow-lg shadow-fire-500/20 shrink-0"
                >
                  {loadingRoster ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading Roster...
                    </>
                  ) : (
                    <>
                      Confirm / Open Tool <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        /* STEP 3: MAIN 3-COLUMN INTERFACE */
        <div className="space-y-6">
          {/* Tournament Quick Bar */}
          <div className="glass-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold px-2.5 py-1 rounded bg-fire-500/20 text-fire-400 border border-fire-500/30">
                {confirmedTournament.uid || confirmedTournament.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="font-bold text-white text-sm">{confirmedTournament.title}</span>
              <span className="text-zinc-500">|</span>
              <span className="text-zinc-400">
                Format: <strong className="text-white">{confirmedTournament.format}</strong>
              </span>
              <span className="text-zinc-500">|</span>
              <span className="text-zinc-400">
                Rate: <strong className="text-yellow-400">₹{perKillRateNum}/kill</strong>
              </span>
              <span className="text-zinc-500">|</span>
              <span className="text-zinc-400">
                Booyah: <strong className="text-fire-400">{formatCurrency(booyahPrizeNum)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfirmModal(true)}
                className="btn-fire px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-fire-500/20"
              >
                <Save className="w-3.5 h-3.5" /> Submit Final Kill List
              </button>
            </div>
          </div>

          {/* 3-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* COLUMN 1: REGISTERED PLAYERS & TEAMS (3 COLS) */}
            <div className="lg:col-span-3 glass-card rounded-2xl p-4 flex flex-col h-[750px]">
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  Registered Players ({candidates.length})
                </h3>
              </div>

              {/* Roster search filter */}
              <div className="relative mb-3">
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Filter player or UID..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-fire-500/40"
                />
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              </div>

              {/* Player list scrollable */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {isTeamTournament ? (
                  // Team Grouping
                  teams.map((team) => (
                    <div
                      key={team.id}
                      className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-fire-500/20 text-fire-400 border border-fire-500/30">
                            {team.tag || 'TEAM'}
                          </span>
                          <span className="font-semibold text-white text-xs truncate" title={team.name}>
                            {team.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{team.members.length} players</span>
                      </div>

                      <div className="space-y-1.5">
                        {team.members.map((m, mIdx) => {
                          const ign = m.user?.inGameNickname || m.user?.ign || m.user?.username || '—';
                          const uid = m.user?.freeFireId || '—';
                          const level = m.user?.gameLevel;
                          const kills = matchedKills[m.user.id]?.kills || 0;

                          return (
                            <div
                              key={m.id || mIdx}
                              className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-white font-medium truncate text-xs" title={ign}>
                                    {ign}
                                  </span>
                                  {level != null && (
                                    <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-300 font-mono">
                                      L{level}
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[10px] text-zinc-500 truncate">
                                  UID: {uid}
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-1 ml-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  kills > 0 ? 'bg-fire-500/20 text-fire-400 border border-fire-500/30' : 'bg-white/5 text-zinc-500'
                                }`}>
                                  {kills} 💀
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  // Solo Players
                  <div className="space-y-2">
                    {filteredCandidates.map((cand) => {
                      const ign = cand.inGameNickname || cand.ign || cand.username || '—';
                      const uid = cand.freeFireId || '—';
                      const level = cand.gameLevel;
                      const kills = matchedKills[cand.id]?.kills || 0;

                      return (
                        <div
                          key={cand.id}
                          className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs hover:border-white/10 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-medium truncate text-xs" title={ign}>
                                {ign}
                              </span>
                              {level != null && (
                                <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-300 font-mono">
                                  L{level}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-zinc-500 truncate">
                              UID: {uid}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1 ml-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              kills > 0 ? 'bg-fire-500/20 text-fire-400 border border-fire-500/30' : 'bg-white/5 text-zinc-500'
                            }`}>
                              {kills} 💀
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 2: VIDEO UPLOAD & PLAYBACK (5 COLS) */}
            <div className="lg:col-span-5 glass-card rounded-2xl p-5 flex flex-col h-[750px]">
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Film className="w-4 h-4 text-fire-400" />
                  Gameplay Video
                </h3>
                {videoFile && (
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                )}
              </div>

              {/* Video Player or Upload Zone */}
              <div className="flex-1 flex flex-col justify-center">
                {videoPreviewUrl ? (
                  <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 flex flex-col items-center justify-center aspect-video w-full">
                    <video
                      ref={videoPlayerRef}
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain max-h-[360px]"
                    />
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-white/15 rounded-2xl p-8 text-center hover:border-fire-500/50 hover:bg-fire-500/[0.02] transition-all cursor-pointer flex flex-col items-center justify-center h-full min-h-[300px]">
                    <input
                      type="file"
                      accept="video/*,.mp4,.mkv,.mov,.webm,.avi"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-16 h-16 rounded-2xl bg-fire-500/10 text-fire-400 border border-fire-500/20 flex items-center justify-center mb-4">
                      <Upload className="w-8 h-8" />
                    </div>
                    <span className="text-white font-bold text-base mb-1">Click or Drag Gameplay Video</span>
                    <p className="text-xs text-zinc-400 max-w-xs mb-3">
                      Upload the recorded match video (.mp4, .mkv, .mov, up to 500MB) to scan kill feed banners.
                    </p>
                    <span className="text-[11px] px-3 py-1 rounded-full bg-white/5 text-zinc-400 border border-white/10 font-mono">
                      1 frame sampled every 4s
                    </span>
                  </label>
                )}

                {/* Video controls / file actions */}
                {videoPreviewUrl && (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-zinc-400 truncate max-w-[220px]" title={videoFile?.name}>
                      {videoFile?.name}
                    </span>
                    <label className="text-fire-400 hover:text-fire-300 cursor-pointer font-medium">
                      Change Video
                      <input
                        type="file"
                        accept="video/*,.mp4,.mkv,.mov,.webm,.avi"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* AI Processing Engine Controls */}
              <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                {uploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Uploading video to analysis engine...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-fire-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {analyzing && (
                  <div className="space-y-2 p-3 rounded-xl bg-fire-500/10 border border-fire-500/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-fire-400 font-bold flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        AI Analysis In Progress
                      </span>
                      <span className="font-mono text-zinc-400">
                        Batch {progressInfo.currentBatch} of {progressInfo.totalBatches} ({progressInfo.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-fire-500 to-yellow-400 transition-all duration-500"
                        style={{ width: `${Math.max(5, progressInfo.percent)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {progressInfo.statusText || 'Gemini 2.5 Flash analyzing sequential screenshots...'}
                    </p>
                  </div>
                )}

                {analysisStatus === 'completed' && (
                  <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{progressInfo.statusText || 'AI video detection complete! Review and adjust kills on the right.'}</span>
                  </div>
                )}

                {analysisError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Analysis Interrupted</span>
                      <span>{analysisError}</span>
                      <p className="mt-1 text-[10px] text-zinc-400">
                        Any kills detected so far have been preserved. You can review them on the right or manually enter kills.
                      </p>
                    </div>
                  </div>
                )}

                {/* Primary Trigger Button */}
                <button
                  onClick={handleStartAnalysis}
                  disabled={!videoFile || analyzing || uploading}
                  className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    analyzing || uploading || !videoFile
                      ? 'bg-white/5 text-zinc-500 cursor-not-allowed border border-white/5'
                      : 'btn-fire text-white shadow-lg shadow-fire-500/25 hover:scale-[1.01]'
                  }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading Video ({uploadProgress}%)...
                    </>
                  ) : analyzing ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin text-yellow-300" /> Scanning Free Fire Kill Feeds...
                    </>
                  ) : (
                    <>
                      <Crosshair className="w-4 h-4" /> Start AI Analysis
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* COLUMN 3: DETECTED KILLS & MANUAL ADJUSTMENTS (4 COLS) */}
            <div className="lg:col-span-4 glass-card rounded-2xl p-4 flex flex-col h-[750px]">
              {/* Header & Metrics */}
              <div className="pb-3 border-b border-white/5 mb-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-yellow-400" />
                    Detected Kills
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-mono font-bold text-xs border border-yellow-500/30">
                    {totalRecordedKills} Kills (₹{totalKillPrizeCalculated})
                  </span>
                </div>
              </div>

              {/* Scrollable Kill List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {Object.values(matchedKills).length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs">
                    No players registered.
                  </div>
                ) : (
                  Object.values(matchedKills).map((item) => {
                    const p = item.player;
                    const ign = p.inGameNickname || p.ign || p.username || '—';
                    const uid = p.freeFireId || '—';

                    return (
                      <div
                        key={item.playerId}
                        className={`p-2.5 rounded-xl border transition-colors ${
                          item.kills > 0
                            ? 'bg-fire-500/[0.07] border-fire-500/30'
                            : 'bg-white/[0.02] border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-bold text-xs truncate" title={ign}>
                                {ign}
                              </span>
                              {p.teamTag && (
                                <span className="font-mono text-[9px] px-1 rounded bg-white/5 text-zinc-400">
                                  {p.teamTag}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-zinc-500 block truncate">
                              UID: {uid}
                            </span>
                          </div>

                          {/* Quick Increment/Decrement Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleDecrementKill(item.playerId)}
                              disabled={item.kills <= 0}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xs font-bold transition-colors"
                              title="Decrease 1 kill"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <span className={`w-8 text-center font-mono font-bold text-sm ${
                              item.kills > 0 ? 'text-fire-400' : 'text-zinc-500'
                            }`}>
                              {item.kills}
                            </span>

                            <button
                              onClick={() => handleIncrementKill(item.playerId)}
                              className="w-7 h-7 rounded-lg bg-fire-500/20 hover:bg-fire-500/30 text-fire-300 flex items-center justify-center text-xs font-bold transition-colors"
                              title="Increase 1 kill"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Recent OCR Detections Tag */}
                        {item.detections.length > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-white/5 text-[10px] text-zinc-400 flex flex-wrap gap-1">
                            <span className="text-zinc-500">Killed:</span>
                            {item.detections.map((det, dIdx) => (
                              <span
                                key={dIdx}
                                className="px-1.5 py-0.5 rounded bg-black/40 text-zinc-300 border border-white/5"
                                title={`At ~${det.timestamp}s (Confidence: ${det.confidence})`}
                              >
                                {det.eliminated}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* UNMATCHED / LOW CONFIDENCE SECTION */}
                {unmatchedDetections.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Unmatched / Low Confidence ({unmatchedDetections.length})
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mb-2">
                      Names spotted by AI OCR that did not meet the auto-match confidence threshold:
                    </p>

                    <div className="space-y-2">
                      {unmatchedDetections.map((unm) => (
                        <div
                          key={unm.id}
                          className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/25 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-yellow-300">{unm.eliminator}</span>
                              <span className="text-zinc-500 mx-1">→</span>
                              <span className="text-zinc-400">{unm.eliminated}</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-500">
                              ~{unm.timestamp}s
                            </span>
                          </div>

                          {/* Quick Assign Dropdown */}
                          <div className="flex items-center gap-1.5">
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleAssignUnmatched(unm, e.target.value);
                                }
                              }}
                              defaultValue=""
                              className="flex-1 px-2 py-1 rounded bg-black/60 border border-white/10 text-white text-[11px] focus:outline-none focus:border-yellow-500/50"
                            >
                              <option value="" disabled>
                                Assign kill to player...
                              </option>
                              {candidates.map((cand) => (
                                <option key={cand.id} value={cand.id}>
                                  {cand.inGameNickname || cand.ign || cand.username} ({cand.freeFireId})
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={() => handleDismissUnmatched(unm.id)}
                              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-[11px] transition-colors"
                              title="Dismiss this detection"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Submit Action */}
              <div className="mt-3 pt-3 border-t border-white/5">
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="btn-fire w-full py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-fire-500/20"
                >
                  <Save className="w-4 h-4" /> Submit Final Kill List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FINAL KILL CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && confirmedTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card max-w-lg w-full rounded-2xl p-6 border-white/20 bg-zinc-950 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Submit Final Kill List
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Please review the finalized kill counts for <span className="text-white font-semibold">{confirmedTournament.title}</span>:
              </p>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 mb-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total Kills Recorded:</span>
                  <span className="font-bold text-white">{totalRecordedKills} kills</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Per Kill Rate:</span>
                  <span className="font-bold text-yellow-400">₹{perKillRateNum}</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1.5">
                  <span className="text-zinc-400">Total Kill Payout:</span>
                  <span className="font-bold text-green-400">{formatCurrency(totalKillPrizeCalculated)}</span>
                </div>
              </div>

              {/* Scrollable list of players with kills > 0 */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 mb-6 custom-scrollbar text-xs">
                {Object.values(matchedKills).filter((item) => item.kills > 0).length === 0 ? (
                  <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-300 text-xs">
                    ⚠️ All players currently have 0 kills assigned. You can still save this, or adjust counts before submitting.
                  </div>
                ) : (
                  Object.values(matchedKills)
                    .filter((item) => item.kills > 0)
                    .map((item) => (
                      <div
                        key={item.playerId}
                        className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5"
                      >
                        <span className="text-white font-medium">
                          {item.player.inGameNickname || item.player.ign || item.player.username}
                        </span>
                        <span className="font-mono font-bold text-fire-400">
                          {item.kills} kills (₹{item.kills * perKillRateNum})
                        </span>
                      </div>
                    ))
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={finalizing}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>

                <button
                  onClick={handleFinalizeKills}
                  disabled={finalizing}
                  className="btn-fire px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg shadow-fire-500/20"
                >
                  {finalizing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving Kills...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" /> Confirm &amp; Save
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
