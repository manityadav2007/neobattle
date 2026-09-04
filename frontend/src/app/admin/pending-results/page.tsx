'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Trophy, AlertCircle, CheckCircle, XCircle, Loader2, Eye, RefreshCw, Users, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { resultApi, formatCurrency, formatDate, type ResultSubmission } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminPendingResultsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [results, setResults] = useState<ResultSubmission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<ResultSubmission | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      const res = await resultApi.pending();
      setResults(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleApprove = async (sub: ResultSubmission) => {
    const t = sub.tournament;
    const isTeam = t?.format === 'DUO' || t?.format === 'SQUAD';
    const splitCount = t?.format === 'DUO' ? 2 : (t?.format === 'SQUAD' ? 4 : 1);
    const lines = [
      Number(t?.prizeFirst) > 0 && `${isTeam ? '1st Winning Team' : '1st Place'} (${sub.firstUid}): ${formatCurrency(Number(t!.prizeFirst))}${isTeam ? ` (${formatCurrency(Math.floor(Number(t!.prizeFirst) / splitCount))}/player)` : ''}`,
      Number(t?.prizeSecond) > 0 && `${isTeam ? '2nd Winning Team' : '2nd Place'} (${sub.secondUid || '—'}): ${formatCurrency(Number(t!.prizeSecond))}${isTeam && sub.secondUid ? ` (${formatCurrency(Math.floor(Number(t!.prizeSecond) / splitCount))}/player)` : ''}`,
      Number(t?.prizeThird) > 0 && `${isTeam ? '3rd Winning Team' : '3rd Place'} (${sub.thirdUid || '—'}): ${formatCurrency(Number(t!.prizeThird))}${isTeam && sub.thirdUid ? ` (${formatCurrency(Math.floor(Number(t!.prizeThird) / splitCount))}/player)` : ''}`,
      Number(t?.hostCommission) > 0 && `Host commission: ${formatCurrency(Number(t!.hostCommission))}`,
    ].filter(Boolean);
    if (!confirm(`Approve & distribute prizes?\n\n${lines.join('\n')}\n\n${isTeam ? 'Winning team prizes will be split equally among all verified members directly into their wallets.' : "Winners' and host wallets will be credited instantly."}`)) return;

    setBusy(sub.id);
    setError('');
    setMsg('');
    try {
      const res = await resultApi.review(sub.id, 'APPROVE');
      setMsg(res.message || 'Approved & distributed!');
      setSelected(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setBusy(id);
    setError('');
    setMsg('');
    try {
      await resultApi.review(id, 'REJECT', rejectReason.trim());
      setMsg('Result rejected — host can resubmit.');
      setRejectId(null);
      setRejectReason('');
      setSelected(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Trophy className="w-8 h-8 text-yellow-400" />
              Pending Results
            </h1>
            <p className="text-zinc-400 mt-1">Review host-submitted results and trigger payouts</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {msg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" /> {msg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loadingData ? (
          <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>
        ) : results.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No pending result submissions.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {results.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSelected(sub)}
                className="glass-card rounded-2xl p-5 text-left hover:border-fire-500/30 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white">{sub.tournament?.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      UID {sub.tournament?.uid} · Host: {sub.host?.username}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                      <span className="text-yellow-300 font-mono">🥇 {sub.firstUid}</span>
                      {sub.secondUid && <span className="text-zinc-300 font-mono">🥈 {sub.secondUid}</span>}
                      {sub.thirdUid && <span className="text-zinc-300 font-mono">🥉 {sub.thirdUid}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black gradient-text">
                      {formatCurrency(Number(sub.tournament?.prizePool ?? 0))}
                    </p>
                    <p className="text-[11px] text-zinc-500">{formatDate(sub.createdAt)}</p>
                    <span className="text-[11px] text-fire-400 inline-flex items-center gap-1 mt-1">
                      Review <Eye className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Detailed review modal */}
      {selected && selected.tournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-card rounded-2xl p-6 z-10">
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-zinc-400">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white pr-8">{selected.tournament.title}</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Tournament ID: <span className="font-mono text-zinc-300">{selected.tournament.uid}</span> · Host:{' '}
              <span className="text-zinc-300">{selected.host?.username}</span> · Submitted {formatDate(selected.createdAt)}
            </p>

            {/* Winners */}
            <div className="mt-5">
              {(() => {
                const isTeam = selected.tournament.format === 'DUO' || selected.tournament.format === 'SQUAD';
                const splitCount = selected.tournament.format === 'DUO' ? 2 : (selected.tournament.format === 'SQUAD' ? 4 : 1);
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Submitted Winners</p>
                      {isTeam && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-semibold">
                          {selected.tournament.format} Match — {splitCount}-Way Split Payout
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {[
                        { medal: '🥇', label: isTeam ? '1st Winning Team' : '1st Place', uid: selected.firstUid, prize: Number(selected.tournament.prizeFirst) },
                        { medal: '🥈', label: isTeam ? '2nd Winning Team' : '2nd Place', uid: selected.secondUid, prize: Number(selected.tournament.prizeSecond) },
                        { medal: '🥉', label: isTeam ? '3rd Winning Team' : '3rd Place', uid: selected.thirdUid, prize: Number(selected.tournament.prizeThird) },
                      ]
                        .filter((w) => w.uid)
                        .map((w) => (
                          <div key={w.label} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div>
                              <span className="text-sm text-white font-medium">{w.medal} {w.label} — <span className="font-mono text-fire-400">{w.uid}</span></span>
                              {isTeam && (
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  Total Pool: {formatCurrency(w.prize)} → <span className="text-emerald-400 font-semibold">{formatCurrency(Math.floor(w.prize / splitCount))} per player</span> ({splitCount} verified members)
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-bold text-yellow-400">{formatCurrency(w.prize)}</span>
                          </div>
                        ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Commission breakdown */}
            <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-zinc-500">Prize Pool</p><p className="text-white font-bold">{formatCurrency(Number(selected.tournament.prizePool))}</p></div>
              <div><p className="text-zinc-500">Platform (16%)</p><p className="text-fire-400 font-bold">{formatCurrency(Number(selected.tournament.platformCommission))}</p></div>
              <div><p className="text-zinc-500">Host (4%)</p><p className="text-green-400 font-bold">{formatCurrency(Number(selected.tournament.hostCommission))}</p></div>
              <div><p className="text-zinc-500">Total Prizes</p><p className="text-yellow-400 font-bold">
                {formatCurrency(
                  Number(selected.tournament.prizeFirst) +
                  (Number(selected.tournament.prizeSecond) || 0) +
                  (Number(selected.tournament.prizeThird) || 0)
                )}
              </p></div>
            </div>

            {/* Participants */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Participants ({selected.participants?.length ?? 0})
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {(selected.participants || []).map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/3 text-xs">
                    <span className="text-white">{p.username}{p.ign ? ` (${p.ign})` : ''}</span>
                    <span className={`font-mono ${[selected.firstUid, selected.secondUid, selected.thirdUid].includes(p.uid) ? 'text-yellow-300' : 'text-zinc-500'}`}>
                      {p.uid}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Proof */}
            <div className="mt-5">
              <a href={selected.screenshotUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-fire-400 hover:text-fire-300">
                <Eye className="w-4 h-4" /> View Winning Proof Screenshot
              </a>
            </div>

            {/* Actions */}
            {rejectId === selected.id ? (
              <div className="mt-5 space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none focus:border-red-500/50 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleReject(selected.id)} disabled={busy === selected.id || !rejectReason.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/15 text-red-400 text-sm font-semibold hover:bg-red-500/25 disabled:opacity-50">
                    {busy === selected.id ? 'Rejecting...' : 'Confirm Reject'}
                  </button>
                  <button onClick={() => { setRejectId(null); setRejectReason(''); }}
                    className="px-4 py-2.5 rounded-xl bg-white/5 text-zinc-400 text-sm hover:bg-white/10">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex gap-3">
                <button onClick={() => handleApprove(selected)} disabled={busy === selected.id}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/20 text-green-400 text-sm font-bold hover:bg-green-500/30 border border-green-500/30 disabled:opacity-50 transition-all">
                  {busy === selected.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Approve &amp; Distribute
                </button>
                <button onClick={() => { setRejectId(selected.id); setRejectReason(''); }} disabled={busy === selected.id}
                  className="px-5 py-3 rounded-xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 disabled:opacity-50 transition-colors">
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
