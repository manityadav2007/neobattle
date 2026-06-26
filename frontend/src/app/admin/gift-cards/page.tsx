'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Gift, Plus, Loader2, AlertCircle, CheckCircle, X, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { giftCardApi, uploadApi, formatCurrency, type GiftCard, type GiftCardRedemption } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function AdminGiftCardsPage() {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [redemptions, setRedemptions] = useState<GiftCardRedemption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', value: '', priceInCoins: '', stockCount: '0' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && !isSuperAdmin) router.push('/dashboard');
  }, [user, loading, isSuperAdmin, router]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [cardsRes, redRes] = await Promise.all([
        giftCardApi.listAll(),
        giftCardApi.redemptions(),
      ]);
      setCards(cardsRes.data || []);
      setRedemptions(redRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.value || !form.priceInCoins) {
      setError('Name, value, and price are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const uploadRes = await uploadApi.giftCardImage(imageFile);
        imageUrl = uploadRes.data.imageUrl;
      }
      await giftCardApi.create({
        name: form.name,
        value: Number(form.value),
        priceInCoins: Number(form.priceInCoins),
        stockCount: Number(form.stockCount) || 0,
        imageUrl,
      });
      setActionMsg('Gift card created!');
      setShowForm(false);
      setForm({ name: '', value: '', priceInCoins: '', stockCount: '0' });
      setImageFile(null);
      setImagePreview(null);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/admin" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Admin Panel
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <Gift className="w-8 h-8 text-fire-400" />
              Gift Cards
            </h1>
            <p className="text-zinc-400 mt-1">Manage gift card catalog and redemptions</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-500/20 text-fire-400 text-sm font-medium hover:bg-fire-500/30 transition-colors">
              <Plus className="w-4 h-4" /> Add Gift Card
            </button>
            <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
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

        {showForm && (
          <div className="glass-card rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold text-white mb-4">New Gift Card</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none" placeholder="e.g. Google Play" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Value (₹)</label>
                <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none" placeholder="e.g. 50" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Price in Coins (₹)</label>
                <input type="number" value={form.priceInCoins} onChange={(e) => setForm({ ...form, priceInCoins: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none" placeholder="e.g. 500" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Stock Count</label>
                <input type="number" value={form.stockCount} onChange={(e) => setForm({ ...form, stockCount: e.target.value })} className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-yellow-500/50 focus:outline-none" placeholder="e.g. 10" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-1">Card Image</label>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/10 transition-colors">
                  Choose Image
                  <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                </label>
                {imagePreview && <img src={imagePreview} alt="Preview" className="h-10 rounded" />}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={saving} className="btn-fire px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Creating...' : 'Create Gift Card'}
              </button>
              <button onClick={() => { setShowForm(false); setImageFile(null); setImagePreview(null); }} className="px-4 py-2.5 rounded-lg bg-white/5 text-zinc-400 text-sm hover:bg-white/10">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Catalog ({cards.length})</h2>
            {loadingData ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
            ) : cards.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No gift cards yet</p>
            ) : (
              <div className="space-y-3">
                {cards.map((card) => (
                  <div key={card.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
                    <div className="flex items-center gap-3">
                      {card.imageUrl && <img src={card.imageUrl} alt={card.name} className="w-10 h-10 rounded object-contain bg-white/5" />}
                      <div>
                        <p className="text-sm font-medium text-white">{card.name}</p>
                        <p className="text-xs text-zinc-500">₹{card.value} | Cost: {formatCurrency(card.priceInCoins)} | Stock: {card.stockCount}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${card.isActive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                      {card.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Pending Redemptions ({redemptions.filter((r) => r.status === 'PENDING').length})</h2>
            {loadingData ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
            ) : redemptions.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No redemptions</p>
            ) : (
              <div className="space-y-3">
                {redemptions.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl bg-white/3 border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-medium text-white">{r.user.username}</p>
                        <p className="text-xs text-zinc-500">{r.giftCard.name} — ₹{r.giftCard.value}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'PENDING' ? 'text-yellow-400 bg-yellow-400/10' :
                        r.status === 'APPROVED' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
                      }`}>{r.status}</span>
                    </div>
                    {r.status === 'PENDING' && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={async () => { try { await giftCardApi.updateRedemption(r.id, 'APPROVED'); setActionMsg('Approved'); await loadData(); } catch (err) { setError(getErrorMessage(err)); } }} className="flex-1 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20">Approve</button>
                        <button onClick={async () => { try { await giftCardApi.updateRedemption(r.id, 'REJECTED'); setActionMsg('Rejected'); await loadData(); } catch (err) { setError(getErrorMessage(err)); } }} className="flex-1 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
