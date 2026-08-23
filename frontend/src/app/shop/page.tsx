'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, Copy, Check, CheckCircle, AlertCircle, Loader2, Clock, XCircle,
  ArrowRight, Landmark, RefreshCw, Gift,
} from 'lucide-react';
import { SiGoogleplay } from 'react-icons/si';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, giftCardApi, type GiftCard, type GiftCardRedemption } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function ShopPage() {
  const { user, loading, refreshUser } = useAuth();
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [redemptions, setRedemptions] = useState<GiftCardRedemption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const balance = user?.wallet?.balance || 0;

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const [cardsRes, mineRes] = await Promise.all([
        giftCardApi.list(),
        giftCardApi.myRedemptions(),
      ]);
      setCards(cardsRes.data || []);
      setRedemptions(mineRes.data || []);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && user) loadData();
  }, [loading, user, loadData]);

  const handleBuy = async (card: GiftCard) => {
    if (!confirm(`Redeem ${formatCurrency(card.priceInCoins)} from your wallet for a ${card.name} worth ₹${card.value}? The code will be delivered after admin approval.`)) return;
    setBuyingId(card.id);
    setErr('');
    setMsg('');
    try {
      const res = await giftCardApi.redeem(card.id);
      setMsg(res.message || 'Request submitted — awaiting admin approval.');
      await loadData();
      refreshUser();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBuyingId(null);
    }
  };

  const copyCode = async (r: GiftCardRedemption) => {
    if (!r.code) return;
    await navigator.clipboard.writeText(r.code);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }

  const statusBadge = (s: string) =>
    s === 'PENDING' ? 'text-yellow-400 bg-yellow-500/10' :
    s === 'APPROVED' ? 'text-green-400 bg-green-500/10' :
    'text-red-400 bg-red-500/10';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Landmark className="w-8 h-8 text-fire-400" />
            Redeem Shop
          </h1>
          <p className="text-zinc-400 mt-2">Spend your winnings on gift card redeem codes</p>
        </div>

        {msg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4 shrink-0" /> {msg}
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" /> {err}
          </div>
        )}

        <div className="glass-card rounded-2xl p-6 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Current Balance</p>
              <p className="text-3xl font-black gradient-text">{formatCurrency(balance)}</p>
            </div>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <h2 className="text-lg font-bold text-white mb-4">Available Gift Cards</h2>

        {!user ? (
          <div className="glass-card rounded-2xl p-12 text-center mb-10">
            <p className="text-zinc-400">Please <a href="/login" className="text-fire-400 hover:underline">login</a> to purchase redeem codes</p>
          </div>
        ) : loadingData ? (
          <div className="py-12 flex justify-center mb-10"><Loader2 className="w-7 h-7 text-fire-400 animate-spin" /></div>
        ) : cards.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center mb-10">
            <SiGoogleplay className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No gift cards available right now. Check back soon!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {cards.map((card) => (
              <div key={card.id} className="glass-card rounded-2xl p-5 flex flex-col group">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 rounded-xl ${card.imageUrl ? 'bg-white p-1.5' : 'bg-green-500/10 border border-green-500/20'} flex items-center justify-center`}>
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} className="w-full h-full object-contain" />
                    ) : (
                      <SiGoogleplay className="w-7 h-7 text-green-400" />
                    )}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">
                    ₹{card.value} value
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{card.name}</h3>
                <p className="text-sm text-zinc-500 mt-0.5">Face value ₹{card.value}</p>
                <div className="mt-auto pt-4">
                  <button
                    onClick={() => handleBuy(card)}
                    disabled={buyingId === card.id || Number(balance) < Number(card.priceInCoins)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/15 text-green-400 text-sm font-bold hover:bg-green-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {buyingId === card.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                    {Number(balance) < Number(card.priceInCoins)
                      ? `Need ${formatCurrency(card.priceInCoins)}`
                      : `Redeem for ${formatCurrency(card.priceInCoins)}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {user && (
          <>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              My Redemptions
              {redemptions.filter((r) => r.status === 'PENDING').length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">
                  {redemptions.filter((r) => r.status === 'PENDING').length} pending
                </span>
              )}
            </h2>

            {loadingData ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 text-fire-400 animate-spin" /></div>
            ) : redemptions.length === 0 ? (
              <div className="glass-card rounded-2xl p-10 text-center">
                <Gift className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">No redemptions yet. Purchase a gift card above to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {redemptions.map((r) => (
                  <div key={r.id} className="glass-card rounded-2xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white">{r.giftCard.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          ₹{r.giftCard.value} value · Paid {formatCurrency(r.amountPaid ?? 0)} · {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>

                      {r.status === 'PENDING' && (
                        <span className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
                          <Clock className="w-3.5 h-3.5 text-yellow-400" /> Awaiting admin approval
                        </span>
                      )}
                      {r.status === 'REJECTED' && (
                        <span className="flex items-center gap-1.5 text-xs text-red-400 shrink-0">
                          <XCircle className="w-3.5 h-3.5" /> Refunded to wallet
                        </span>
                      )}
                      {r.status === 'APPROVED' && r.code && (
                        <div className="flex items-center gap-2 shrink-0">
                          <code className="px-3 py-2 rounded-lg bg-black/30 border border-green-500/20 text-green-300 font-mono text-sm tracking-wider select-all">
                            {r.code}
                          </code>
                          <button
                            onClick={() => copyCode(r)}
                            className="p-2.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                            title="Copy code"
                          >
                            {copiedId === r.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 glass-card rounded-2xl p-4 flex items-center gap-3 text-sm text-zinc-400">
              <ArrowRight className="w-4 h-4 text-fire-400 shrink-0" />
              Codes are assigned manually by admins after verification — usually within 24 hours.
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
