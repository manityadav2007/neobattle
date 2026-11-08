'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  Send,
  Users,
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  Clock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface BroadcastHistoryItem {
  id: string;
  title: string;
  message: string;
  path: string;
  target: string;
  targetUser?: string;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  admin: string;
}

const PRESET_PATHS = [
  { label: 'Home (/)', value: '/' },
  { label: 'Tournaments (/tournaments)', value: '/tournaments' },
  { label: 'Wallet (/wallet)', value: '/wallet' },
  { label: 'Dashboard (/dashboard)', value: '/dashboard' },
  { label: 'Esports (/esports)', value: '/esports' },
  { label: 'Shop (/shop)', value: '/shop' },
  { label: 'Leaderboards (/leaderboards)', value: '/leaderboards' },
  { label: 'Custom Path...', value: 'custom' },
];

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [pathPreset, setPathPreset] = useState('/');
  const [customPath, setCustomPath] = useState('');
  const [audience, setAudience] = useState<'all' | 'single'>('all');
  const [targetUser, setTargetUser] = useState('');

  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const resolvedPath = pathPreset === 'custom' ? customPath.trim() : pathPreset;

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/admin/notifications/history');
      if (res.data?.success && Array.isArray(res.data?.data)) {
        setHistory(res.data.data);
      }
    } catch (err) {
      console.warn('[AdminNotifications] Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResultMsg(null);

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!cleanTitle) {
      setResultMsg({ type: 'error', text: 'Notification title is required' });
      return;
    }
    if (!cleanMessage) {
      setResultMsg({ type: 'error', text: 'Notification message is required' });
      return;
    }
    if (audience === 'single' && !targetUser.trim()) {
      setResultMsg({ type: 'error', text: 'Username or User ID is required for single-user target' });
      return;
    }

    const confirmText =
      audience === 'all'
        ? `Broadcast this push notification to ALL active users?\n\nTitle: ${cleanTitle}\nMessage: ${cleanMessage}`
        : `Send push notification to user "${targetUser.trim()}"?\n\nTitle: ${cleanTitle}`;

    if (!window.confirm(confirmText)) {
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/admin/notifications/send', {
        title: cleanTitle,
        message: cleanMessage,
        path: resolvedPath || '/',
        target: audience,
        targetUser: audience === 'single' ? targetUser.trim() : undefined,
      });

      const sent = res.data?.data?.sentCount ?? 0;
      const failed = res.data?.data?.failedCount ?? 0;

      setResultMsg({
        type: 'success',
        text: `Push notification dispatched! Sent: ${sent}, Failed: ${failed}.`,
      });

      setTitle('');
      setMessage('');
      if (audience === 'single') setTargetUser('');
      fetchHistory();
    } catch (err) {
      setResultMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Bell className="w-8 h-8 text-orange-500" />
              Push Notifications
            </h1>
            <p className="text-zinc-400 mt-1">
              Send instant Firebase Cloud Messaging push alerts to app users.
            </p>
          </div>
          <button
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-zinc-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {resultMsg && (
          <div
            className={`flex items-start gap-3 p-4 rounded-xl mb-6 border ${
              resultMsg.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}
          >
            {resultMsg.type === 'success' ? (
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <p className="text-sm">{resultMsg.text}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Send Form */}
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 border border-white/10 bg-white/5 space-y-5">
            <h2 className="text-lg font-semibold text-white">Compose Notification</h2>

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Target Audience
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAudience('all')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition ${
                      audience === 'all'
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    All Users
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudience('single')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition ${
                      audience === 'single'
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    Single User
                  </button>
                </div>
              </div>

              {audience === 'single' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    User ID or Username
                  </label>
                  <input
                    type="text"
                    value={targetUser}
                    onChange={(e) => setTargetUser(e.target.value)}
                    placeholder="Enter user ID or username"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Notification Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 🏆 Major Tournament Starting Soon!"
                  maxLength={100}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Notification Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. Room code is now available. Enter the lobby within 10 minutes."
                  rows={3}
                  maxLength={300}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  On-Tap Action (In-App Destination)
                </label>
                <select
                  value={pathPreset}
                  onChange={(e) => setPathPreset(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500/50"
                >
                  {PRESET_PATHS.map((preset) => (
                    <option key={preset.value} value={preset.value} className="bg-zinc-900 text-white">
                      {preset.label}
                    </option>
                  ))}
                </select>

                {pathPreset === 'custom' && (
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="e.g. /tournaments/your-tournament-id"
                    className="w-full mt-2 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50"
                  />
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-sm transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending Broadcast...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Dispatch Notification
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Quick Info & Tips */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-xs text-zinc-400 space-y-3">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                Delivery Guidelines
              </h3>
              <p>
                • Notifications are delivered via Firebase Cloud Messaging directly to registered Android devices.
              </p>
              <p>
                • Inactive or uninstalled tokens are cleaned up automatically upon receipt of FCM dead-token responses.
              </p>
              <p>
                • Users who have disabled the Master Notification toggle in their settings are skipped to respect player preferences.
              </p>
              <p>
                • Destination paths are strictly sanitized to allowlisted internal routes.
              </p>
            </div>
          </div>
        </div>

        {/* History List */}
        <div className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" />
            Recent Broadcasts
          </h2>

          {loadingHistory && history.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-400" />
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-zinc-500 text-sm">
              No recent notification broadcasts found.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5 overflow-hidden">
              {history.map((item) => (
                <div key={item.id} className="p-4 hover:bg-white/[0.02] transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">{item.title}</span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                          {item.target}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{item.message}</p>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 pt-1">
                        <span>By {item.admin}</span>
                        <span>•</span>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        {item.path && (
                          <>
                            <span>•</span>
                            <span className="text-orange-400 font-mono">{item.path}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs shrink-0">
                      <span className="text-emerald-400 font-semibold">{item.sentCount} sent</span>
                      {item.failedCount > 0 && (
                        <span className="text-rose-400 ml-2 font-semibold">({item.failedCount} failed)</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
