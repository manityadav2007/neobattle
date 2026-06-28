'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Bell, Lock, Save, Loader2, AlertCircle, CheckCircle, LogOut, Eye, EyeOff, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { userApi, uploadApi, resolveAssetUrl } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

type Tab = 'profile' | 'notifications' | 'security';

const tabs: { key: Tab; label: string; icon: typeof SlidersHorizontal }[] = [
  { key: 'profile', label: 'Profile Preferences', icon: SlidersHorizontal },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'security', label: 'Security', icon: Lock },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Profile
  const [displayName, setDisplayName] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Notifications
  const [notifyTournaments, setNotifyTournaments] = useState(true);
  const [notifyResults, setNotifyResults] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [secSubmitting, setSecSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setNotifyTournaments(user.notifyTournaments ?? true);
      setNotifyResults(user.notifyResults ?? true);
      setNotifyAlerts(user.notifyAlerts ?? true);
    }
  }, [user]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await userApi.updateProfile({ displayName });
      refreshUser();
      showMsg('success', 'Profile saved');
    } catch (err) {
      showMsg('error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setMessage(null);
    try {
      const res = await uploadApi.avatar(file);
      console.log('[Settings] Avatar upload full response:', JSON.stringify(res, null, 2));
      const newUrl = res?.data?.avatarUrl;
      console.log('[Settings] Avatar URL received from upload:', newUrl);
      if (newUrl) {
        const fullUrl = resolveAssetUrl(newUrl);
        console.log('[Settings] Resolved full URL:', fullUrl);
        setAvatarPreview(fullUrl || null);
      }
      refreshUser();
      showMsg('success', 'Avatar updated');
    } catch (err) {
      showMsg('error', getErrorMessage(err));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await userApi.updateProfile({ notifyTournaments, notifyResults, notifyAlerts });
      refreshUser();
      showMsg('success', 'Notification preferences saved');
    } catch (err) {
      showMsg('error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showMsg('error', 'New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      showMsg('error', 'Password must be at least 6 characters');
      return;
    }
    setSecSubmitting(true);
    setMessage(null);
    try {
      await userApi.changePassword({ currentPassword, newPassword });
      showMsg('success', 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showMsg('error', getErrorMessage(err));
    } finally {
      setSecSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) return;
    setSecSubmitting(true);
    setMessage(null);
    try {
      await userApi.deleteAccount({ password: deletePassword });
      await logout();
      router.push('/');
    } catch (err) {
      showMsg('error', getErrorMessage(err));
      setSecSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }

  const tabContent = {
    profile: (
      <div className="space-y-6">
        <div className="flex items-center gap-5">
          {(() => {
            const src = avatarPreview || resolveAssetUrl(user.avatarUrl);
            console.log('[Settings] Avatar src for img tag:', src);
            return src ? (
              <img src={src} alt={user.displayName || user.username} className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                <Upload className="w-8 h-8" />
              </div>
            );
          })()}
          <div>
            <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-white/10 transition-colors">
              <Upload className="h-4 w-4" />
              {uploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <p className="text-xs text-zinc-500 mt-2">JPG, PNG, GIF or WebP. Max 5MB.</p>
            {user.avatarUrl && <p className="text-[10px] text-zinc-600 mt-1">Debug: {user.avatarUrl}</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-fire-500/40 focus:ring-1 focus:ring-fire-500/20"
          />
        </div>
        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>
    ),
    notifications: (
      <div className="space-y-6">
        {[
          { key: 'tournaments' as const, label: 'Tournament Reminders', desc: 'Get notified when a tournament you joined is about to start.', val: notifyTournaments, set: setNotifyTournaments },
          { key: 'results' as const, label: 'Result Updates', desc: 'Receive match results, scores, and leaderboard changes.', val: notifyResults, set: setNotifyResults },
          { key: 'alerts' as const, label: 'Account Alerts', desc: 'Security alerts for logins, password changes, and account activity.', val: notifyAlerts, set: setNotifyAlerts },
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{item.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={item.val}
              onClick={() => item.set(!item.val)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                item.val ? 'bg-fire-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  item.val ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
        <button
          onClick={handleSaveNotifications}
          disabled={saving}
          className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Preferences
        </button>
      </div>
    ),
    security: (
      <div className="space-y-8">
        <div>
          <h3 className="text-base font-semibold text-white mb-4">Change Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-fire-500/40 focus:ring-1 focus:ring-fire-500/20"
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm text-white outline-none transition-all focus:border-fire-500/40 focus:ring-1 focus:ring-fire-500/20"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm text-white outline-none transition-all focus:border-fire-500/40 focus:ring-1 focus:ring-fire-500/20"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={secSubmitting}
              className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {secSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Update Password
            </button>
          </form>
        </div>

        <div className="border-t border-white/5 pt-8">
          <h3 className="text-base font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-zinc-400 mb-4">Permanently deactivate your account. This action cannot be undone.</p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Delete Account
          </button>
        </div>
      </div>
    ),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fire-300">Player Controls</p>
        <h1 className="mt-3 text-3xl font-display font-bold text-white sm:text-4xl">
          <span className="gradient-text">Settings</span>
        </h1>
        <p className="mt-2 text-zinc-400">Manage account preferences, notifications, and security.</p>
      </motion.div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-6 flex items-center gap-2 rounded-xl p-4 text-sm ${
            message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </motion.div>
      )}

      {/* Tabs */}
      <div className="mt-8 flex gap-2 border-b border-white/5 overflow-x-auto whitespace-nowrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 bg-fire-500 rounded-full" style={{ height: '2px' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {tabContent[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-md rounded-3xl border border-red-500/20 bg-[#0d0d16] p-6 shadow-2xl"
            >
              <h2 className="text-lg font-bold text-red-400">Delete Account</h2>
              <p className="mt-2 text-sm text-zinc-400">
                This will deactivate your account permanently. Enter your password to confirm.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
              />
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeletePassword(''); }}
                  className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={secSubmitting || !deletePassword}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {secSubmitting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
