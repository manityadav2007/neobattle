'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, AlertCircle, CheckCircle, Loader2, Gamepad2, RefreshCw, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { verificationApi } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface LinkStatus {
  isLinked: boolean;
  freeFireUid: string | null;
  freeFireRegion: string | null;
  inGameNickname: string | null;
  inGameLevel: number | null;
  isVerified: boolean;
  lastSyncedAt: string | null;
  refreshCountToday: number;
  remainingRefreshes: number;
  nextRefreshAvailableInHours: number | null;
}

export default function VerifyPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const [uid, setUid] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const loadStatus = useCallback(async () => {
    if (!user) return;
    setStatusLoading(true);
    try {
      const res = await verificationApi.my();
      setLinkStatus(res.data || null);
    } catch {
      setLinkStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  if (loading || statusLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }
  if (!user) { router.push('/login'); return null; }

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const trimmedUid = uid.trim();
    if (!trimmedUid || !/^\d{5,12}$/.test(trimmedUid)) {
      setError('Please enter a valid Free Fire UID (numbers only, 5–12 digits)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await verificationApi.link({ uid: trimmedUid, region: 'IND' });
      setSuccess(res.message || 'Free Fire account linked successfully!');
      await loadStatus();
      await refreshUser();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await verificationApi.refresh();
      if (res.success) {
        await loadStatus();
        await refreshUser();
        showToast('Profile refreshed successfully!');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || getErrorMessage(err);
      if (err?.response?.data?.cachedData) {
        showToast("Couldn't refresh right now, showing last known data");
      } else {
        showToast(msg || 'Refresh failed, please try again later');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const isLinked = linkStatus?.isLinked;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      {/* Toast notification */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-zinc-800 border border-white/10 text-white text-sm shadow-lg flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          {toast}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-8">
          <Shield className="w-10 h-10 text-fire-400 mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold text-white">
            {isLinked ? 'Free Fire Account' : 'Link Free Fire ID'}
          </h1>
          <p className="text-zinc-400 mt-2">
            {isLinked
              ? 'Your Free Fire account is linked. You can refresh to update your stats.'
              : 'Enter your Free Fire UID to instantly link your account'}
          </p>
        </div>

        {/* Linked state — show profile card */}
        {isLinked && linkStatus && (
          <div className="glass-card rounded-2xl p-8 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-400">Linked</p>
                <p className="text-xs text-zinc-500">Free Fire account connected</p>
              </div>
            </div>

            <dl className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b border-white/5">
                <dt className="text-sm text-zinc-400">Free Fire UID</dt>
                <dd className="text-sm font-mono text-white">{linkStatus.freeFireUid}</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <dt className="text-sm text-zinc-400">In-Game Name</dt>
                <dd className="text-sm font-medium text-white">{linkStatus.inGameNickname || '—'}</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <dt className="text-sm text-zinc-400">Level</dt>
                <dd className="text-sm font-medium text-white">{linkStatus.inGameLevel ?? '—'}</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <dt className="text-sm text-zinc-400">Region</dt>
                <dd className="text-sm text-white">{linkStatus.freeFireRegion === 'IND' ? 'India (IND)' : (linkStatus.freeFireRegion || 'India (IND)')}</dd>
              </div>
            </dl>

            {/* Refresh button */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Last synced: {formatSyncTime(linkStatus.lastSyncedAt)}
              </p>
              {linkStatus.nextRefreshAvailableInHours !== null && linkStatus.remainingRefreshes === 0 ? (
                <div className="text-right">
                  <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-zinc-500 text-sm font-medium cursor-not-allowed opacity-60">
                    <RefreshCw className="w-4 h-4" />
                    Refresh (0 left today)
                  </button>
                  <p className="text-xs text-zinc-500 mt-1">
                    Next refresh in {linkStatus.nextRefreshAvailableInHours}h
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/15 text-fire-400 text-sm font-medium hover:bg-fire-500/25 transition-colors disabled:opacity-50"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh ({linkStatus.remainingRefreshes} left today)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Not linked — show link form */}
        {!isLinked && (
          <form onSubmit={handleLink} className="glass-card rounded-2xl p-8 space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" /> {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Free Fire UID</label>
              <div className="relative">
                <Gamepad2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={uid}
                  onChange={(e) => setUid(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="input-field w-full pl-10 pr-4 py-3 rounded-lg text-white font-mono"
                  placeholder="Enter your UID (numbers only)"
                  required
                  inputMode="numeric"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">Your unique Free Fire player ID (5–12 digits)</p>
            </div>


            <button
              type="submit"
              disabled={submitting || !uid.trim()}
              className="btn-fire w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Linking your account...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Shield className="w-4 h-4" /> Link Free Fire ID
                </span>
              )}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              Your nickname and level are fetched automatically — no screenshot needed.
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}