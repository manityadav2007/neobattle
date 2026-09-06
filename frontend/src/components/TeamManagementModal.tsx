'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, Plus, LogIn, Loader2, CheckCircle, AlertCircle,
  UserPlus, DoorOpen, Crown, Shield, Copy, Check, Send, BadgeCheck,
} from 'lucide-react';
import { teamApi, Team, TeamJoinRequest, resolveAssetUrl } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import Avatar from '@/components/Avatar';

interface Props {
  open: boolean;
  onClose: () => void;
  myTeam: Team | null;
  userId: string;
  onTeamChange: (updatedTeam?: Team | null) => void;
}

export default function TeamManagementModal({ open, onClose, myTeam, userId, onTeamChange }: Props) {
  const isLeader = myTeam?.leader?.id === userId;

  // Non-team member state
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [teamCode, setTeamCode] = useState('');

  // Leader active subtab: 'members' | 'requests'
  const [leaderTab, setLeaderTab] = useState<'members' | 'requests'>('members');
  const [pendingRequests, setPendingRequests] = useState<TeamJoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch pending requests for the team leader
  const fetchRequests = async (teamId: string) => {
    setLoadingRequests(true);
    try {
      const res = await teamApi.getRequests(teamId);
      if (res.success && res.data) {
        setPendingRequests(res.data);
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError('');
      setSuccess('');
      onTeamChange();
      if (myTeam && isLeader) {
        fetchRequests(myTeam.id);
      }
    }
  }, [open]);

  const resetForm = () => {
    setName('');
    setTag('');
    setTeamCode('');
    setError('');
    setSuccess('');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    if (!name.trim() || !tag.trim()) {
      setError('Team name and tag are required');
      return;
    }
    if (tag.length > 6) {
      setError('Tag must be 6 characters or less');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await teamApi.create({ name: name.trim(), tag: tag.trim() });
      setSuccess(`Team "${name.trim()}" created successfully!`);
      if (res.data) {
        onTeamChange(res.data);
      } else {
        onTeamChange();
      }
      setTimeout(() => {
        onClose();
        resetForm();
      }, 600);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendJoinRequest = async () => {
    const code = teamCode.trim();
    if (!code) {
      setError('Please enter a Team ID or Team Tag');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await teamApi.requestJoin(code);
      setSuccess(res.message || 'Join request sent successfully! Waiting for leader approval.');
      setTimeout(() => {
        resetForm();
      }, 2500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReviewRequest = async (requestId: string, action: 'ACCEPT' | 'REJECT') => {
    setReviewingId(requestId);
    setError('');
    try {
      const res = await teamApi.reviewRequest(requestId, action);
      setSuccess(res.message || (action === 'ACCEPT' ? 'Player accepted!' : 'Request rejected.'));
      if (myTeam) {
        await fetchRequests(myTeam.id);
      }
      onTeamChange();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setReviewingId(null);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this team?')) return;
    setLoading(true);
    setError('');
    try {
      await teamApi.leave();
      setSuccess('Left team successfully');
      onTeamChange(null);
      setTimeout(() => {
        onClose();
        resetForm();
      }, 400);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDisband = async () => {
    if (!confirm('Are you sure you want to permanently disband this team? All members will be removed.')) return;
    setLoading(true);
    setError('');
    try {
      await teamApi.disband(myTeam!.id);
      setSuccess('Team disbanded successfully');
      onTeamChange(null);
      setTimeout(() => {
        onClose();
        resetForm();
      }, 400);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-lg glass-card rounded-2xl p-6 z-10 max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-fire-400" />
                Manage Team
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {myTeam ? (
              <div className="space-y-4">
                {/* Team Info Banner */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3">
                    {myTeam.logoUrl && (
                      <img
                        src={resolveAssetUrl(myTeam.logoUrl)}
                        alt={myTeam.name}
                        className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-bold text-lg truncate">{myTeam.name}</p>
                        <span className="px-2 py-0.5 rounded bg-fire-500/20 text-fire-400 font-mono text-xs font-bold">
                          [{myTeam.tag}]
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-400 font-mono">ID: {myTeam.id.slice(0, 10)}...</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(myTeam.tag)}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                          title="Copy Team Tag"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copied ? 'Copied' : 'Copy Tag'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Leader Subtabs */}
                {isLeader && (
                  <div className="flex gap-2 p-1 rounded-xl bg-black/40 border border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setLeaderTab('members');
                        setError('');
                      }}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        leaderTab === 'members'
                          ? 'bg-fire-500 text-white shadow-md'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Members ({myTeam.members?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLeaderTab('requests');
                        setError('');
                        fetchRequests(myTeam.id);
                      }}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all relative ${
                        leaderTab === 'requests'
                          ? 'bg-fire-500 text-white shadow-md'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Join Requests
                      {pendingRequests.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                          {pendingRequests.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                {/* Subtab Content */}
                {(!isLeader || leaderTab === 'members') && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Roster ({myTeam.members?.length || 0} / 4)
                      </p>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {myTeam.members?.map((m: any) => (
                        <div
                          key={m.user.id}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all"
                        >
                          <Avatar src={resolveAssetUrl(m.user.avatarUrl)} alt={m.user.username} size={36} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-white truncate">{m.user.displayName || m.user.username}</span>
                              {m.user.displayName && m.user.displayName !== m.user.username && (
                                <span className="text-[11px] text-zinc-400 font-normal truncate">(@{m.user.username})</span>
                              )}
                              {m.user.isVerified && (
                                <span title="Verified">
                                  <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                              {m.user.freeFireId ? (
                                <span className="font-mono text-zinc-300">UID: <strong className="text-fire-400 font-bold">{m.user.freeFireId}</strong></span>
                              ) : (
                                <span className="text-zinc-500">No UID</span>
                              )}
                              <span>•</span>
                              <span className="text-zinc-300">Lvl <strong className="text-neo-400 font-bold">{m.user.gameLevel ?? 0}</strong></span>
                              {m.user.ign && (
                                <>
                                  <span>•</span>
                                  <span className="text-zinc-400 truncate max-w-[100px]" title={`IGN: ${m.user.ign}`}>IGN: {m.user.ign}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {m.role === 'LEADER' && (
                            <span className="text-[11px] font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                              <Crown className="w-3 h-3" /> Leader
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leader: Join Requests View */}
                {isLeader && leaderTab === 'requests' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Pending Join Requests ({pendingRequests.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => fetchRequests(myTeam.id)}
                        disabled={loadingRequests}
                        className="text-[11px] text-zinc-400 hover:text-white transition-colors"
                      >
                        {loadingRequests ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>

                    {loadingRequests && pendingRequests.length === 0 ? (
                      <div className="py-8 flex justify-center text-zinc-400">
                        <Loader2 className="w-6 h-6 animate-spin text-fire-400" />
                      </div>
                    ) : pendingRequests.length === 0 ? (
                      <div className="p-6 text-center rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-xs">
                        <UserPlus className="w-8 h-8 mx-auto mb-2 text-zinc-500 opacity-60" />
                        No pending join requests at this time.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {pendingRequests.map((req) => (
                          <div
                            key={req.id}
                            className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2.5"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar src={resolveAssetUrl(req.user.avatarUrl)} alt={req.user.username} size={36} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold text-white truncate">{req.user.username}</span>
                                  {req.user.isVerified ? (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                                      Verified
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-semibold">
                                      Unverified
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                                  <span className="font-mono">UID: {req.user.freeFireId || 'None'}</span>
                                  <span>•</span>
                                  <span className="font-semibold text-zinc-300">Level {req.user.gameLevel}</span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-1 border-t border-white/5">
                              <button
                                type="button"
                                onClick={() => handleReviewRequest(req.id, 'ACCEPT')}
                                disabled={reviewingId === req.id}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all disabled:opacity-50"
                              >
                                {reviewingId === req.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewRequest(req.id, 'REJECT')}
                                disabled={reviewingId === req.id}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-all disabled:opacity-50"
                              >
                                {reviewingId === req.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <X className="w-3.5 h-3.5" />
                                )}
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-xs text-red-400 flex items-center gap-1 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}
                {success && (
                  <p className="text-xs text-green-400 flex items-center gap-1 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{success}</span>
                  </p>
                )}

                {/* Team Controls */}
                <div className="flex gap-3 pt-2">
                  {isLeader ? (
                    <button
                      onClick={handleDisband}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      Disband Team
                    </button>
                  ) : (
                    <button
                      onClick={handleLeave}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />}
                      Leave Team
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* User has NO team */
              <div className="space-y-4">
                <div className="flex gap-2 p-1 rounded-xl bg-black/40 border border-white/10">
                  <button
                    onClick={() => {
                      setTab('create');
                      setError('');
                      setSuccess('');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      tab === 'create'
                        ? 'bg-fire-500 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4" /> Create Team
                  </button>
                  <button
                    onClick={() => {
                      setTab('join');
                      setError('');
                      setSuccess('');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      tab === 'join'
                        ? 'bg-fire-500 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Send className="w-4 h-4" /> Join Team
                  </button>
                </div>

                {tab === 'create' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Team Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Neo Dragons"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-fire-500/50 focus:outline-none transition-all"
                        maxLength={30}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Team Tag (2 - 6 uppercase characters)</label>
                      <input
                        type="text"
                        value={tag}
                        onChange={(e) => setTag(e.target.value.toUpperCase())}
                        placeholder="e.g. NEO"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono focus:border-fire-500/50 focus:outline-none uppercase transition-all"
                        maxLength={6}
                      />
                    </div>
                    <button
                      onClick={handleCreate}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-fire-500 text-white text-sm font-bold hover:bg-fire-400 transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Create Team
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Team ID or Team Tag</label>
                      <input
                        type="text"
                        value={teamCode}
                        onChange={(e) => setTeamCode(e.target.value)}
                        placeholder="Enter Team Tag (e.g. NEO) or full Team ID"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono focus:border-fire-500/50 focus:outline-none transition-all"
                      />
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Entering a Team Tag or ID will send a join request to the team leader for approval.
                      </p>
                    </div>
                    <button
                      onClick={handleSendJoinRequest}
                      disabled={loading || !teamCode.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-fire-500 text-white text-sm font-bold hover:bg-fire-400 transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Send Join Request
                    </button>
                  </div>
                )}

                {error && (
                  <p className="text-xs text-red-400 flex items-center gap-1 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}
                {success && (
                  <p className="text-xs text-green-400 flex items-center gap-1 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{success}</span>
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
