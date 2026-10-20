'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ShoppingBag, Plus, Loader2, CheckCircle, AlertCircle, Copy, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/api';

export default function AdminStorePage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'GOOGLE_PLAY', amount: 100 });
  const [saving, setSaving] = useState(false);

  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || (!isSuperAdmin && !isAdmin))) router.push('/dashboard');
  }, [user, authLoading, isAdmin, isSuperAdmin, router]);

  const loadCodes = useCallback(async (isRetry = false) => {
    if (!isRetry) setLoading(true);
    setErr('');
    setIsRateLimited(false);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    try {
      const res = await api.get('/store/codes');
      setCodes(res.data.data || []);
      setErr('');
      setIsRateLimited(false);
    } catch (error: any) {
      const is429 = axios.isAxiosError(error) && error.response?.status === 429;
      if (is429) {
        setIsRateLimited(true);
        const retryDelay = 5;
        setRetrySeconds(retryDelay);
        setErr('Too many requests. Retrying automatically...');

        countdownTimerRef.current = setInterval(() => {
          setRetrySeconds((prev) => {
            if (prev <= 1) {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        retryTimerRef.current = setTimeout(() => {
          loadCodes(true);
        }, retryDelay * 1000);
      } else {
        setErr(getErrorMessage(error) || 'Failed to load codes');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin || isSuperAdmin) loadCodes();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isAdmin, isSuperAdmin, loadCodes]);

  const handleAdd = async () => {
    if (!form.code || !form.type || !form.amount) return;
    setSaving(true);
    setErr('');
    try {
      await api.post('/store/codes', form);
      setMsg('Code added!');
      setShowAdd(false);
      setForm({ code: '', type: 'GOOGLE_PLAY', amount: 100 });
      await loadCodes();
    } catch (err) {
      setErr(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-fire-400" />
              Store Manager
            </h1>
            <p className="text-zinc-400 mt-1">Manage Google Play & Amazon gift codes</p>
          </div>
          <button type="button" onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/20 text-fire-400 text-sm font-medium hover:bg-fire-500/30">
            <Plus className="w-4 h-4" /> Add Code
          </button>
        </div>

        {isRateLimited ? (
          <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Too many requests. Retrying automatically in {retrySeconds}s...</span>
            </div>
            <button
              type="button"
              onClick={() => loadCodes(false)}
              className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Now
            </button>
          </div>
        ) : err ? (
          <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{err}</span>
            </div>
            <button
              type="button"
              onClick={() => loadCodes(false)}
              className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        ) : null}
        {msg && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6"><CheckCircle className="w-4 h-4" /> {msg}</div>}

        {showAdd && (
          <div className="glass-card rounded-2xl p-6 mb-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Add New Code</h2>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Gift Code</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Enter the gift code..." className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  <option value="GOOGLE_PLAY">Google Play</option>
                  <option value="AMAZON">Amazon</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Amount (₹)</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} min={1} className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm" />
              </div>
            </div>
            <button type="button" onClick={handleAdd} disabled={saving} className="px-6 py-2.5 rounded-lg bg-fire-500/20 text-fire-400 font-semibold text-sm hover:bg-fire-500/30 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Adding...' : 'Add Code'}
            </button>
          </div>
        )}

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">All Codes ({codes.length})</h2>
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-fire-400 animate-spin" /></div>
          ) : codes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-3 py-3 font-medium">Code</th>
                    <th className="text-left px-3 py-3 font-medium">Type</th>
                    <th className="text-left px-3 py-3 font-medium">Amount</th>
                    <th className="text-left px-3 py-3 font-medium">Status</th>
                    <th className="text-left px-3 py-3 font-medium">Redeemed By</th>
                    <th className="text-left px-3 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/3">
                      <td className="px-3 py-3">
                        <code className="text-xs text-zinc-300 font-mono">{item.code}</code>
                      </td>
                      <td className="px-3 py-3 text-zinc-300">{item.type === 'GOOGLE_PLAY' ? 'Google Play' : 'Amazon'}</td>
                      <td className="px-3 py-3 text-white font-medium">₹{item.amount}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.isRedeemed ? 'text-zinc-500 bg-zinc-500/10' : 'text-green-400 bg-green-400/10'}`}>
                          {item.isRedeemed ? 'Redeemed' : 'Available'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-zinc-500">{item.redeemedBy || '-'}</td>
                      <td className="px-3 py-3 text-xs text-zinc-500">{new Date(item.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isRateLimited || err ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-amber-400 text-sm font-medium">
                {isRateLimited ? `Server busy (rate limit). Retrying in ${retrySeconds}s...` : err}
              </p>
              <button
                type="button"
                onClick={() => loadCodes(false)}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Now
              </button>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No codes yet. Add your first gift code.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
