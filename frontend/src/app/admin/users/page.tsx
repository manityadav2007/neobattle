'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Shield, Users, AlertCircle, CheckCircle, ArrowUp, ArrowDown,
  RefreshCw, Search, Loader2, ArrowLeft, AlertTriangle, X, Copy,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminApi } from '@/lib/services';
import { getErrorMessage, api } from '@/lib/api';

interface UserRow {
  id: string;
  uid: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const roleFilter = searchParams.get('role');

  const [warningUser, setWarningUser] = useState<UserRow | null>(null);
  const [warningReason, setWarningReason] = useState('');
  const [sendingWarning, setSendingWarning] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, authLoading, isSuperAdmin, router]);

  const loadUsers = async (p = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.users(p);
      setUsers(res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setPage(p);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadUsers();
  }, [isSuperAdmin]);

  const handlePromote = async (userId: string) => {
    try {
      const res = await adminApi.promoteUser(userId);
      setActionMsg(res.message || 'Promoted to Host');
      await loadUsers(page);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDemote = async (userId: string) => {
    try {
      const res = await adminApi.demoteUser(userId);
      setActionMsg(res.message || 'Demoted to Player');
      await loadUsers(page);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSendWarning = async () => {
    if (!warningUser || !warningReason.trim()) return;
    setSendingWarning(true);
    try {
      await api.post('/warnings', { userId: warningUser.id, reason: warningReason.trim() });
      setActionMsg(`Warning sent to ${warningUser.username}`);
      setWarningUser(null);
      setWarningReason('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSendingWarning(false);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matches = u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q);
    if (roleFilter === 'HOST') return matches && u.role === 'HOST';
    return matches;
  });

  if (authLoading) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>

        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-fire-400" />
              User Management
            </h1>
            <p className="text-zinc-400 mt-1">Manage users — search by UID, username, or email. Promote, demote, or send warnings.</p>
          </div>
          <button onClick={() => loadUsers()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {actionMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" /> {actionMsg}
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by UID (FA-XXXX), username, or email..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-20 flex justify-center">
              <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-4 font-medium">UID</th>
                    <th className="text-left px-6 py-4 font-medium">Username</th>
                    <th className="text-left px-6 py-4 font-medium">Email</th>
                    <th className="text-left px-6 py-4 font-medium">Role</th>
                    <th className="text-left px-6 py-4 font-medium">Status</th>
                    <th className="text-right px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-6 py-4">
                        <code className="text-xs text-zinc-400 font-mono bg-white/5 px-2 py-0.5 rounded">{u.uid}</code>
                      </td>
                      <td className="px-6 py-4 text-white font-medium">{u.username}</td>
                      <td className="px-6 py-4 text-zinc-400">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          u.role === 'SUPER_ADMIN' || u.role === 'ADMIN'
                            ? 'text-yellow-400 bg-yellow-400/15 border border-yellow-500/20'
                          : u.role === 'HOST'
                            ? 'text-sky-400 bg-sky-400/15 border border-sky-500/20'
                          : 'text-zinc-400 bg-zinc-400/10 border border-zinc-500/10'
                        }`}>
                          {u.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs ${u.isActive ? 'text-green-400' : 'text-red-400'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setWarningUser(u); setWarningReason(''); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                            title="Send Warning"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" /> Warn
                          </button>
                          {u.role !== 'SUPER_ADMIN' && u.role !== 'ADMIN' && (
                            <>
                              {u.role !== 'HOST' ? (
                                <button onClick={() => handlePromote(u.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20">
                                  <ArrowUp className="w-3.5 h-3.5" /> Promote
                                </button>
                              ) : (
                                <button onClick={() => handleDemote(u.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-medium hover:bg-yellow-500/20">
                                  <ArrowDown className="w-3.5 h-3.5" /> Demote
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t border-white/5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => loadUsers(i + 1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    page === i + 1 ? 'bg-fire-500/20 text-fire-400' : 'bg-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {warningUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-2xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Send Warning
              </h2>
              <button type="button" onClick={() => setWarningUser(null)} className="p-1 text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              Issuing warning to <span className="text-white font-semibold">{warningUser.username}</span> ({warningUser.uid})
            </p>
            <textarea
              value={warningReason}
              onChange={(e) => setWarningReason(e.target.value)}
              placeholder="Enter the reason for this warning..."
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm mb-4 min-h-[100px]"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSendWarning}
                disabled={!warningReason.trim() || sendingWarning}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 font-semibold text-sm hover:bg-red-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingWarning ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                {sendingWarning ? 'Sending...' : 'Send Warning'}
              </button>
              <button type="button" onClick={() => setWarningUser(null)} className="px-4 py-2.5 rounded-lg bg-white/5 text-zinc-400 text-sm font-medium hover:bg-white/10">
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
