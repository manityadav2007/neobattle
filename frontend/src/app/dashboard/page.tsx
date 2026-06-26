'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy, Wallet, Users, Shield, CheckCircle, AlertCircle,
  ArrowRight, Gamepad2, RefreshCw, Pencil, Loader2, X, Save, Eye,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Avatar from '@/components/Avatar';
import { useTournaments } from '@/hooks/useTournaments';
import { formatCurrency, teamApi, userApi, uploadApi, resolveAssetUrl } from '@/lib/services';
import TeamManagementModal from '@/components/TeamManagementModal';
import { Team, type UserStats } from '@/lib/services';
import LeagueBadge from '@/components/LeagueBadge';
import { getErrorMessage } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, refetch, refreshUser } = useAuth();
  const { tournaments } = useTournaments({ autoFetch: true });
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [displayUsername, setDisplayUsername] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState('');
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user?.role === 'HOST') {
      router.push('/host-dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      teamApi.my().then((res) => setMyTeam(res.data || null)).catch(() => {});
      userApi.stats().then((res) => setUserStats(res.data || null)).catch(() => {});
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log('[Dashboard] Avatar upload started:', file.name, file.size, file.type);
    setAvatarUploading(true);
    try {
      const res = await uploadApi.avatar(file);
      console.log('[Dashboard] Avatar upload success:', res);
      await refreshUser();
      router.refresh();
    } catch (err) {
      console.error('[Dashboard] Avatar upload failed:', err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const startEditingUsername = () => {
    setUsernameInput(displayUsername || user!.username);
    setEditingUsername(true);
    setUsernameError('');
    setUsernameSuccess('');
  };

  const cancelEditingUsername = () => {
    setEditingUsername(false);
    setUsernameError('');
    setUsernameSuccess('');
  };

  const saveUsername = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setUsernameError('Username cannot be empty');
      return;
    }
    if (trimmed.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError('Username must be letters, numbers, and underscores only (no spaces)');
      return;
    }
    if (trimmed === (displayUsername || user!.username)) {
      setEditingUsername(false);
      return;
    }
    setSavingUsername(true);
    setUsernameError('');
    setUsernameSuccess('');
    try {
      const res = await userApi.updateProfile({ username: trimmed });
      console.log('[Dashboard] Username update success:', res);
      setDisplayUsername(trimmed);
      setUsernameSuccess('Username updated successfully!');
      setTimeout(() => setUsernameSuccess(''), 3000);
      setEditingUsername(false);
      await refreshUser();
      router.refresh();
    } catch (err) {
      console.error('[Dashboard] Username update failed:', err);
      setUsernameError(getErrorMessage(err));
    } finally {
      setSavingUsername(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="glass-card rounded-2xl h-64 animate-pulse" />
      </div>
    );
  }

  const myEntries = tournaments.filter((t) => t.isRegistered);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3 flex-wrap">
              <div className="relative inline-flex">
                <Avatar src={resolveAssetUrl(user.avatarUrl)} alt={displayUsername || user.displayName || user.username} size={40} />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-yellow-500 border-2 border-zinc-900 flex items-center justify-center hover:bg-yellow-400 transition-colors disabled:opacity-50"
                >
                  {avatarUploading ? (
                    <Loader2 className="w-3 h-3 text-zinc-900 animate-spin" />
                  ) : (
                    <Pencil className="w-2.5 h-2.5 text-zinc-900" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              Welcome, <span className="gradient-text">{displayUsername || user.displayName || user.username}</span>
              {userStats && <LeagueBadge wins={userStats.totalWins} size="md" />}
            </h1>
            <p className="text-zinc-400 mt-1">Your command center for NEOBATTLE</p>
          </div>
          <div className="flex items-center gap-3">
            {!user.isVerified && (
              <Link
                href="/dashboard/verify"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 text-sm font-medium border border-yellow-500/20"
              >
                <AlertCircle className="w-4 h-4" />
                Verify your Free Fire ID
              </Link>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            {
              icon: Wallet,
              label: 'Wallet Balance',
              value: user.wallet ? formatCurrency(user.wallet.balance) : '₹0',
              href: '/wallet',
              color: 'text-green-400',
            },
            {
              icon: Trophy,
              label: 'Active Tournaments',
              value: String(myEntries.length),
              href: '/tournaments',
              color: 'text-fire-400',
            },
            {
              icon: Users,
              label: 'Team',
              value: myTeam ? myTeam.name : 'No Team',
              href: '#',
              onClick: () => setTeamModalOpen(true),
              color: 'text-blue-400',
            },
            {
              icon: Shield,
              label: 'Verification',
              value: user.isVerified ? 'Verified' : 'Pending',
              color: user.isVerified ? 'text-green-400' : 'text-yellow-400',
            },
          ].map((stat: any) => (
            <div
              key={stat.label}
              className={`glass-card rounded-xl p-5 hover:fire-glow transition-shadow ${stat.onClick ? 'cursor-pointer' : ''}`}
              onClick={stat.onClick}
            >
              <div className="flex items-center gap-3 mb-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <span className="text-sm text-zinc-400">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-white">{stat.value}</p>
              {stat.href && !stat.onClick && (
                <Link href={stat.href} className="text-xs text-fire-400 hover:text-fire-300 mt-2 inline-flex items-center gap-1">
                  Manage <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-fire-400" />
              Player Profile
            </h2>
            <dl className="space-y-3">
              {[
                {
                  label: 'Username',
                  value: displayUsername || user.username,
                  editable: true,
                },
                ['Email', user.email],
                {
                  label: 'Free Fire ID',
                  value: user.freeFireId || 'Not linked',
                  isFreeFire: true,
                  verificationScreenshotUrl: user.verificationScreenshotUrl,
                  isVerified: user.isVerified,
                },
                ['Role', user.role],
              ].map((item: any) => {
                if (item.editable) {
                  return (
                    <div key={item.label} className="flex justify-between py-2 border-b border-white/5">
                      <dt className="text-sm text-zinc-400">{item.label}</dt>
                      <dd className="text-sm font-medium text-white flex items-center gap-1.5">
                        {editingUsername ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={usernameInput}
                              onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(''); }}
                              className="w-32 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') cancelEditingUsername(); }}
                            />
                            <button
                              onClick={saveUsername}
                              disabled={savingUsername}
                              className="p-1 rounded hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-50"
                            >
                              {savingUsername ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={cancelEditingUsername}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            {item.value as string}
                            <button onClick={startEditingUsername} className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-yellow-400 transition-colors">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </dd>
                    </div>
                  );
                }
                if (item.isFreeFire) {
                  return (
                    <div key={item.label} className="flex justify-between py-2 border-b border-white/5">
                      <dt className="text-sm text-zinc-400">{item.label}</dt>
                      <dd className="text-sm font-medium text-white flex items-center gap-1">
                        <span>{item.value as string}</span>
                        {item.isVerified ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        ) : item.value !== 'Not linked' ? (
                          <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                        ) : null}
                        {item.verificationScreenshotUrl && (
                          <a href={item.verificationScreenshotUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-fire-400 transition-colors" title="View Screenshot">
                            <Eye className="w-3 h-3" />
                          </a>
                        )}
                        <Link href="/dashboard/verify" className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-yellow-400 transition-colors" title={item.isVerified ? 'Re-upload' : item.verificationScreenshotUrl ? 'Edit/Re-upload' : 'Upload'}>
                          {item.isVerified || item.verificationScreenshotUrl ? <RefreshCw className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                        </Link>
                      </dd>
                    </div>
                  );
                }
                const [label, value] = item;
                return (
                  <div key={label} className="flex justify-between py-2 border-b border-white/5">
                    <dt className="text-sm text-zinc-400">{label}</dt>
                    <dd className="text-sm font-medium text-white flex items-center gap-1">
                      {value as string}
                      {label === 'IGN' && user.ign && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      )}
                      {label === 'Free Fire ID' && user.isVerified && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {usernameError && (
              <p className="text-xs text-red-400 mt-3 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {usernameError}
              </p>
            )}
            {usernameSuccess && (
              <p className="text-xs text-green-400 mt-3 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {usernameSuccess}
              </p>
            )}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              {[
                { href: '/tournaments', label: 'Browse Tournaments', icon: Trophy },
                { href: '/wallet', label: 'Manage Wallet', icon: Wallet },
                { href: '/dashboard/verify', label: 'Verify Free Fire ID', icon: Shield },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/3 hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <action.icon className="w-5 h-5 text-fire-400" />
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white">{action.label}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-fire-400 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <TeamManagementModal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        myTeam={myTeam}
        userId={user.id}
        onTeamChange={() => {
          teamApi.my().then((res) => setMyTeam(res.data || null)).catch(() => {});
        }}
      />
    </div>
  );
}
