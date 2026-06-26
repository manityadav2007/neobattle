'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, Plus, LogIn, Loader2, CheckCircle, AlertCircle,
  UserPlus, DoorOpen, Crown, Shield,
} from 'lucide-react';
import { teamApi, Team, resolveAssetUrl } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import Avatar from '@/components/Avatar';

interface Props {
  open: boolean;
  onClose: () => void;
  myTeam: Team | null;
  userId: string;
  onTeamChange: () => void;
}

export default function TeamManagementModal({ open, onClose, myTeam, userId, onTeamChange }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const resetForm = () => {
    setName('');
    setTag('');
    setTeamId('');
    setError('');
    setSuccess('');
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
      await teamApi.create({ name: name.trim(), tag: tag.trim() });
      setSuccess(`Team "${name.trim()}" created successfully!`);
      setTimeout(() => { onTeamChange(); onClose(); resetForm(); }, 1200);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!teamId.trim()) {
      setError('Please enter a Team ID');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await teamApi.join(teamId.trim());
      setSuccess('Joined team successfully!');
      setTimeout(() => { onTeamChange(); onClose(); resetForm(); }, 1200);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    setLoading(true);
    setError('');
    try {
      await teamApi.leave();
      setSuccess('Left team successfully');
      setTimeout(() => { onTeamChange(); onClose(); }, 1000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDisband = async () => {
    if (!confirm('Are you sure you want to disband the team? This cannot be undone.')) return;
    setLoading(true);
    setError('');
    try {
      await teamApi.disband(myTeam!.id);
      setSuccess('Team disbanded');
      setTimeout(() => { onTeamChange(); onClose(); }, 1000);
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
            className="relative w-full max-w-md glass-card rounded-2xl p-6 z-10"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-fire-400" />
                Manage Team
              </h2>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {myTeam ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
                  {myTeam.logoUrl && (
                    <img src={resolveAssetUrl(myTeam.logoUrl)} alt={myTeam.name} className="w-12 h-12 rounded-lg object-cover" />
                  )}
                  <div>
                    <p className="text-white font-bold text-lg">{myTeam.name}</p>
                    <p className="text-zinc-400 text-sm">[{myTeam.tag}]</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-zinc-400 mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Members ({myTeam.members?.length || 0})
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {myTeam.members?.map((m: any) => (
                      <div key={m.user.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/3">
                        <Avatar src={resolveAssetUrl(m.user.avatarUrl)} alt={m.user.username} size={32} />
                        <span className="text-sm text-white flex-1">{m.user.username}</span>
                        {m.role === 'LEADER' && (
                          <span className="text-xs text-yellow-400 flex items-center gap-1">
                            <Crown className="w-3 h-3" /> Leader
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>
                )}
                {success && (
                  <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {success}</p>
                )}

                <div className="flex gap-3 pt-2">
                  {myTeam.leader?.id === userId ? (
                    <button onClick={handleDisband} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      Disband Team
                    </button>
                  ) : (
                    <button onClick={handleLeave} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-sm font-medium hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />}
                      Leave Team
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTab('create'); setError(''); setSuccess(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      tab === 'create'
                        ? 'bg-fire-500/20 text-fire-400 border border-fire-500/30'
                        : 'bg-white/5 text-zinc-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4" /> Create
                  </button>
                  <button
                    onClick={() => { setTab('join'); setError(''); setSuccess(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      tab === 'join'
                        ? 'bg-fire-500/20 text-fire-400 border border-fire-500/30'
                        : 'bg-white/5 text-zinc-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    <LogIn className="w-4 h-4" /> Join
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
                        placeholder="Enter team name"
                        className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                        maxLength={30}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Team Tag (max 6 chars)</label>
                      <input
                        type="text"
                        value={tag}
                        onChange={(e) => setTag(e.target.value.toUpperCase())}
                        placeholder="e.g. NEO"
                        className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none uppercase"
                        maxLength={6}
                      />
                    </div>
                    <button
                      onClick={handleCreate}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fire-500 text-white text-sm font-bold hover:bg-fire-400 transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Create Team
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Team ID</label>
                      <input
                        type="text"
                        value={teamId}
                        onChange={(e) => setTeamId(e.target.value)}
                        placeholder="Enter team ID to join"
                        className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={handleJoin}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fire-500 text-white text-sm font-bold hover:bg-fire-400 transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      Join Team
                    </button>
                  </div>
                )}

                {error && (
                  <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>
                )}
                {success && (
                  <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {success}</p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}