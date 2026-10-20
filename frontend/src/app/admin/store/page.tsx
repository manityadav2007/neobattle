'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, Gift, Plus, Loader2, CheckCircle, XCircle, AlertCircle,
  Copy, Eye, EyeOff, RefreshCw, Check, Power, Tag, ShieldCheck, User, Search,
  Package, DollarSign, Clock, ArrowRight
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { api, getErrorMessage } from '@/lib/api';
import { giftCardApi, uploadApi, formatCurrency, formatDate, type GiftCard, type GiftCardRedemption } from '@/lib/services';
import { sanitizeMediaUrl } from '@/utils/sanitizeUrl';

interface StoreCode {
  id: string;
  code: string;
  type: string;
  amount: number;
  isRedeemed: boolean;
  redeemedBy: string | null;
  createdAt: string;
}

function AdminStoreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders'>(
    activeTabParam === 'orders' ? 'orders' : 'catalog'
  );

  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();
  const hasAccess = isSuperAdmin || isAdmin;

  // Data states
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [codes, setCodes] = useState<StoreCode[]>([]);
  const [redemptions, setRedemptions] = useState<GiftCardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Filtering states
  const [codesFilter, setCodesFilter] = useState<'ALL' | 'AVAILABLE' | 'REDEEMED'>('ALL');
  const [ordersFilter, setOrdersFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  // Reveal / Copy states
  const [revealedCodes, setRevealedCodes] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Forms and Modals
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardForm, setCardForm] = useState({ name: '', value: '', priceInCoins: '' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [savingCard, setSavingCard] = useState(false);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);

  const [showAddCode, setShowAddCode] = useState(false);
  const [codeForm, setCodeForm] = useState({ code: '', type: 'GOOGLE_PLAY', amount: 100 });
  const [savingCode, setSavingCode] = useState(false);

  // Redemption fulfillment state
  const [redemptionCodeInput, setRedemptionCodeInput] = useState<Record<string, string>>({});
  const [processingRedemption, setProcessingRedemption] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !hasAccess)) {
      router.push(user ? '/dashboard' : '/login');
    }
  }, [user, authLoading, hasAccess, router]);

  useEffect(() => {
    if (activeTabParam === 'orders' || activeTabParam === 'catalog') {
      setActiveTab(activeTabParam);
    }
  }, [activeTabParam]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cardsRes, redRes, codesRes] = await Promise.allSettled([
        giftCardApi.listAll(),
        giftCardApi.redemptions(),
        api.get('/store/codes'),
      ]);

      if (cardsRes.status === 'fulfilled' && cardsRes.value?.data) {
        setCards(cardsRes.value.data);
      }
      if (redRes.status === 'fulfilled' && redRes.value?.data) {
        setRedemptions(redRes.value.data);
      }
      if (codesRes.status === 'fulfilled' && codesRes.value?.data?.data) {
        setCodes(codesRes.value.data.data);
      }
    } catch (error: any) {
      setErr(getErrorMessage(error) || 'Failed to load store data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) loadData();
  }, [hasAccess, loadData]);

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedCodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskCode = (code: string) => {
    if (!code) return '••••••••••••';
    if (code.length <= 4) return '••••••••';
    return `•••••••• ${code.slice(-4)}`;
  };

  // Card Handlers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(encodeURI(URL.createObjectURL(file)));
  };

  const handleCreateCard = async () => {
    if (!cardForm.name.trim() || !cardForm.value || !cardForm.priceInCoins) {
      setErr('Name, face value, and price in coins are required');
      return;
    }
    setSavingCard(true);
    setErr('');
    setMsg('');
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const uploadRes = await uploadApi.giftCardImage(imageFile);
        imageUrl = uploadRes.data.imageUrl;
      }
      await giftCardApi.create({
        name: cardForm.name.trim(),
        value: Number(cardForm.value),
        priceInCoins: Number(cardForm.priceInCoins),
        imageUrl,
      });
      setMsg('New gift card added to catalog!');
      setShowAddCard(false);
      setCardForm({ name: '', value: '', priceInCoins: '' });
      setImageFile(null);
      setImagePreview(null);
      await loadData();
    } catch (err: any) {
      setErr(getErrorMessage(err));
    } finally {
      setSavingCard(false);
    }
  };

  const handleToggleCardActive = async (card: GiftCard) => {
    setUpdatingCardId(card.id);
    setErr('');
    setMsg('');
    try {
      await giftCardApi.update(card.id, { isActive: !card.isActive });
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, isActive: !card.isActive } : c)));
      setMsg(`"${card.name}" ${!card.isActive ? 'activated' : 'deactivated'}.`);
    } catch (err: any) {
      setErr(getErrorMessage(err));
    } finally {
      setUpdatingCardId(null);
    }
  };

  // Code Handlers
  const handleAddCode = async () => {
    if (!codeForm.code.trim() || !codeForm.type || !codeForm.amount) return;
    setSavingCode(true);
    setErr('');
    setMsg('');
    try {
      await api.post('/store/codes', {
        code: codeForm.code.trim(),
        type: codeForm.type,
        amount: Number(codeForm.amount),
      });
      setMsg('Gift code added to store inventory!');
      setShowAddCode(false);
      setCodeForm({ code: '', type: 'GOOGLE_PLAY', amount: 100 });
      await loadData();
    } catch (err: any) {
      setErr(getErrorMessage(err));
    } finally {
      setSavingCode(false);
    }
  };

  // Order / Redemption Handlers
  const handleApproveRedemption = async (redemptionId: string) => {
    const code = redemptionCodeInput[redemptionId]?.trim();
    if (!code) {
      setErr('Please enter or select a valid redeem code to deliver.');
      return;
    }
    setProcessingRedemption(redemptionId);
    setErr('');
    setMsg('');
    try {
      await giftCardApi.updateRedemption(redemptionId, 'APPROVED', code);
      setMsg('Code assigned & delivered! The user can now view it in My Redemptions.');
      setRedemptionCodeInput((prev) => ({ ...prev, [redemptionId]: '' }));
      await loadData();
    } catch (err: any) {
      setErr(getErrorMessage(err));
    } finally {
      setProcessingRedemption(null);
    }
  };

  const handleRejectRedemption = async (redemptionId: string) => {
    if (!confirm('Reject this request? The user will be automatically refunded in coins and stock restored.')) {
      return;
    }
    setProcessingRedemption(redemptionId);
    setErr('');
    setMsg('');
    try {
      await giftCardApi.updateRedemption(redemptionId, 'REJECTED');
      setMsg('Redemption rejected — wallet refunded and stock restored.');
      await loadData();
    } catch (err: any) {
      setErr(getErrorMessage(err));
    } finally {
      setProcessingRedemption(null);
    }
  };

  if (authLoading || !hasAccess) return null;

  // Filtered lists
  const filteredCodes = codes.filter((c) => {
    if (codesFilter === 'AVAILABLE') return !c.isRedeemed;
    if (codesFilter === 'REDEEMED') return c.isRedeemed;
    return true;
  });

  const filteredRedemptions = redemptions.filter((r) => {
    if (ordersFilter === 'ALL') return true;
    return r.status === ordersFilter;
  });

  const pendingOrdersCount = redemptions.filter((r) => r.status === 'PENDING').length;
  const availableCodesCount = codes.filter((c) => !c.isRedeemed).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-fire-400" />
              Store &amp; Gift Cards Manager
            </h1>
            <p className="text-zinc-400 mt-1">
              Manage gift card catalog items, digital inventory codes, and order fulfillment
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-zinc-300 border border-white/10 transition-colors shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-fire-400' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Global Alerts */}
        {err && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" /> {err}
          </div>
        )}
        {msg && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4 shrink-0" /> {msg}
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="glass-card rounded-2xl p-4 border border-white/10">
            <span className="text-xs text-zinc-400">Catalog Cards</span>
            <p className="text-2xl font-bold font-display text-white mt-1">{cards.length}</p>
            <span className="text-[11px] text-emerald-400">{cards.filter((c) => c.isActive).length} active</span>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-white/10">
            <span className="text-xs text-zinc-400">Available Codes</span>
            <p className="text-2xl font-bold font-display text-emerald-400 mt-1">{availableCodesCount}</p>
            <span className="text-[11px] text-zinc-500">In inventory</span>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-white/10">
            <span className="text-xs text-zinc-400">Pending Orders</span>
            <p className="text-2xl font-bold font-display text-yellow-400 mt-1">{pendingOrdersCount}</p>
            <span className="text-[11px] text-yellow-400/80">Awaiting code delivery</span>
          </div>
          <div className="glass-card rounded-2xl p-4 border border-white/10">
            <span className="text-xs text-zinc-400">Total Fulfilled</span>
            <p className="text-2xl font-bold font-display text-purple-400 mt-1">
              {redemptions.filter((r) => r.status === 'APPROVED').length}
            </p>
            <span className="text-[11px] text-zinc-500">Redeemed by users</span>
          </div>
        </div>

        {/* Main Tab Navigation */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'catalog'
                ? 'bg-fire-500/20 text-fire-400 border border-fire-500/30 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Package className="w-4 h-4" />
            Catalog &amp; Codes
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${
              activeTab === 'orders'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Gift className="w-4 h-4" />
            Orders &amp; Redemptions
            {pendingOrdersCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-black">
                {pendingOrdersCount}
              </span>
            )}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: CATALOG & INVENTORY CODES                                          */}
        {/* ========================================================================= */}
        {activeTab === 'catalog' && (
          <div className="space-y-8">
            {/* 1. Gift Card Catalog Items */}
            <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-fire-400" />
                    Gift Card Catalog ({cards.length})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Cards displayed in the user store with pricing, values, and live stock tracking.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddCard(!showAddCard)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fire-500/20 text-fire-400 text-xs font-bold hover:bg-fire-500/30 border border-fire-500/30 transition-all shrink-0"
                >
                  <Plus className="w-4 h-4" /> {showAddCard ? 'Close Form' : 'Add Gift Card'}
                </button>
              </div>

              {/* Add Card Drawer/Form */}
              <AnimatePresence>
                {showAddCard && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-6"
                  >
                    <div className="p-5 rounded-2xl bg-white/[0.03] border border-fire-500/30 space-y-4">
                      <h3 className="text-sm font-bold text-white">Create New Catalog Gift Card</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">Card Name</label>
                          <input
                            type="text"
                            value={cardForm.name}
                            onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                            placeholder="e.g. Google Play ₹500"
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-fire-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">Face Value (₹)</label>
                          <input
                            type="number"
                            value={cardForm.value}
                            onChange={(e) => setCardForm({ ...cardForm, value: e.target.value })}
                            placeholder="e.g. 500"
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-fire-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">Price in Coins (₹)</label>
                          <input
                            type="number"
                            value={cardForm.priceInCoins}
                            onChange={(e) => setCardForm({ ...cardForm, priceInCoins: e.target.value })}
                            placeholder="e.g. 500"
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-fire-500/50"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">Card Image</label>
                        <div className="flex items-center gap-3">
                          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors">
                            Choose Image
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </label>
                          {imagePreview && (
                            <img
                              src={encodeURI(sanitizeMediaUrl(imagePreview))}
                              alt="Preview"
                              className="h-10 w-16 object-contain rounded bg-black/40 border border-white/10"
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleCreateCard}
                          disabled={savingCard}
                          className="px-5 py-2 rounded-xl bg-fire-500 text-black text-xs font-bold hover:bg-fire-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {savingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          {savingCard ? 'Creating...' : 'Save Card'}
                        </button>
                        <button
                          onClick={() => setShowAddCard(false)}
                          className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 text-xs hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Cards Grid */}
              {loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
              ) : cards.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No gift cards configured yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cards.map((card) => {
                    const isAmazon = card.name.toUpperCase().includes('AMAZON');
                    const targetType = isAmazon ? 'AMAZON' : 'GOOGLE_PLAY';
                    const matchingCodes = codes.filter(
                      (c) => c.type === targetType && !c.isRedeemed && c.amount === card.value
                    );
                    const isBusy = updatingCardId === card.id;

                    return (
                      <div
                        key={card.id}
                        className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {card.imageUrl ? (
                              <img
                                src={card.imageUrl}
                                alt={card.name}
                                className="w-12 h-12 rounded-xl object-contain bg-white/5 p-1 border border-white/10 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-fire-500/10 border border-fire-500/20 flex items-center justify-center text-fire-400 shrink-0">
                                <Gift className="w-6 h-6" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{card.name}</h4>
                              <p className="text-xs text-zinc-400">
                                Face Value: <strong className="text-white">₹{card.value}</strong>
                              </p>
                              <p className="text-xs text-zinc-500">
                                Price: <strong className="text-fire-400">{formatCurrency(card.priceInCoins)}</strong>
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleCardActive(card)}
                            disabled={isBusy}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                              card.isActive
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                            {card.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-zinc-400">
                          <span>Stock Inventory:</span>
                          <span
                            className={`font-semibold px-2 py-0.5 rounded ${
                              matchingCodes.length > 0
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-yellow-500/10 text-yellow-400'
                            }`}
                          >
                            {matchingCodes.length} codes ready
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Store Digital Codes Inventory */}
            <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Tag className="w-5 h-5 text-emerald-400" />
                    Digital Codes Inventory ({filteredCodes.length})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Preloaded digital codes for automated or manual fulfillment. Codes are masked for security.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
                    {(['ALL', 'AVAILABLE', 'REDEEMED'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setCodesFilter(filter)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                          codesFilter === filter
                            ? 'bg-fire-500/20 text-fire-400'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddCode(!showAddCode)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 border border-emerald-500/30 transition-all shrink-0"
                  >
                    <Plus className="w-4 h-4" /> {showAddCode ? 'Close Form' : 'Add Code'}
                  </button>
                </div>
              </div>

              {/* Add Code Form */}
              <AnimatePresence>
                {showAddCode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-6"
                  >
                    <div className="p-5 rounded-2xl bg-white/[0.03] border border-emerald-500/30 space-y-4">
                      <h3 className="text-sm font-bold text-white">Add New Redeem Code to Stock</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">Code Type</label>
                          <select
                            value={codeForm.type}
                            onChange={(e) => setCodeForm({ ...codeForm, type: e.target.value })}
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-emerald-500/50"
                          >
                            <option value="GOOGLE_PLAY">Google Play</option>
                            <option value="AMAZON">Amazon Gift Card</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">Denomination / Amount (₹)</label>
                          <input
                            type="number"
                            value={codeForm.amount}
                            onChange={(e) => setCodeForm({ ...codeForm, amount: Number(e.target.value) })}
                            min={1}
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">Actual Secret Code</label>
                          <input
                            type="text"
                            value={codeForm.code}
                            onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                            placeholder="e.g. ABCD-1234-EFGH-5678"
                            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleAddCode}
                          disabled={savingCode || !codeForm.code.trim()}
                          className="px-5 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {savingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          {savingCode ? 'Adding Code...' : 'Add Code to Inventory'}
                        </button>
                        <button
                          onClick={() => setShowAddCode(false)}
                          className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 text-xs hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Codes Table with Masking & Reveal */}
              {loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
              ) : filteredCodes.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No codes found in this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider">
                        <th className="text-left py-3 pr-4 font-semibold">Code (Masked)</th>
                        <th className="text-left py-3 pr-4 font-semibold">Type</th>
                        <th className="text-left py-3 pr-4 font-semibold">Amount</th>
                        <th className="text-left py-3 pr-4 font-semibold">Status</th>
                        <th className="text-left py-3 pr-4 font-semibold">Redeemed By</th>
                        <th className="text-left py-3 pr-4 font-semibold">Added Date</th>
                        <th className="text-right py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredCodes.map((item) => {
                        const isRevealed = !!revealedCodes[item.id];
                        const displayCode = isRevealed ? item.code : maskCode(item.code);

                        return (
                          <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3.5 pr-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <code
                                  className={`text-xs font-mono px-2 py-1 rounded bg-black/40 border border-white/10 ${
                                    isRevealed ? 'text-emerald-300' : 'text-zinc-400 tracking-wider'
                                  }`}
                                >
                                  {displayCode}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(item.id)}
                                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                  title={isRevealed ? 'Mask code' : 'Reveal code'}
                                >
                                  {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td className="py-3.5 pr-4 text-zinc-300 text-xs whitespace-nowrap">
                              {item.type === 'GOOGLE_PLAY' ? 'Google Play' : 'Amazon'}
                            </td>
                            <td className="py-3.5 pr-4 text-white font-bold whitespace-nowrap">
                              ₹{item.amount}
                            </td>
                            <td className="py-3.5 pr-4 whitespace-nowrap">
                              <span
                                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                  item.isRedeemed
                                    ? 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20'
                                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                }`}
                              >
                                {item.isRedeemed ? 'Redeemed' : 'Available'}
                              </span>
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-zinc-400 whitespace-nowrap">
                              {item.redeemedBy ? `@${item.redeemedBy}` : '—'}
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-zinc-500 whitespace-nowrap">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleCopy(item.code, item.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs transition-colors"
                                title="Copy plaintext code"
                              >
                                {copiedKey === item.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-green-400" />
                                    <span className="text-green-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ORDERS & REDEMPTIONS (Fulfillment Queue)                           */}
        {/* ========================================================================= */}
        {activeTab === 'orders' && (
          <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-purple-400" />
                  Gift Card Orders &amp; Redemptions ({filteredRedemptions.length})
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Review user redemption requests, assign digital codes, or refund wallet balances.
                </p>
              </div>

              {/* Status Filters */}
              <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setOrdersFilter(filter)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      ordersFilter === filter
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {filter}
                    {filter === 'PENDING' && pendingOrdersCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500 text-black">
                        {pendingOrdersCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
              </div>
            ) : filteredRedemptions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-emerald-400/60 mx-auto mb-2" />
                <p className="text-zinc-300 font-medium text-sm">No orders found in this view</p>
                <p className="text-zinc-500 text-xs mt-1">
                  When users purchase gift cards with coins, their fulfillment requests appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRedemptions.map((r) => {
                  const isPending = r.status === 'PENDING';
                  const isApproved = r.status === 'APPROVED';
                  const isRejected = r.status === 'REJECTED';
                  const isBusy = processingRedemption === r.id;
                  const isCodeRevealed = !!revealedCodes[`order_${r.id}`];

                  // Check if there are available stock codes matching this card
                  const matchingStockCodes = codes.filter(
                    (c) => !c.isRedeemed && c.amount === r.giftCard?.value
                  );

                  return (
                    <div
                      key={r.id}
                      className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-purple-500/20 transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                            <Gift className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">@{r.user?.username || 'Unknown'}</span>
                              <span className="text-xs text-zinc-500 font-mono">({r.user?.email})</span>
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              Ordered: <strong className="text-white">{r.giftCard?.name}</strong> • Value: ₹{r.giftCard?.value} • Paid:{' '}
                              <strong className="text-fire-400">
                                {formatCurrency(Number(r.giftCard?.priceInCoins ?? 0))}
                              </strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500">
                            {new Date(r.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              isPending
                                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                : isApproved
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                      </div>

                      {/* Delivered Code Display (if already fulfilled) */}
                      {isApproved && r.code && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400">Delivered Code:</span>
                            <code className="text-xs font-mono font-bold text-emerald-300">
                              {isCodeRevealed ? r.code : maskCode(r.code)}
                            </code>
                            <button
                              type="button"
                              onClick={() => toggleReveal(`order_${r.id}`)}
                              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                              title={isCodeRevealed ? 'Mask' : 'Reveal'}
                            >
                              {isCodeRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(r.code!, `order_${r.id}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-xs"
                          >
                            {copiedKey === `order_${r.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-green-400" />
                                <span className="text-green-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Code</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Pending Action Controls */}
                      {isPending && (
                        <div className="pt-2 border-t border-white/5 space-y-2">
                          {matchingStockCodes.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400/90 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">
                              <Package className="w-3.5 h-3.5 shrink-0" />
                              <span>{matchingStockCodes.length} matching code(s) available in inventory.</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setRedemptionCodeInput((prev) => ({
                                    ...prev,
                                    [r.id]: matchingStockCodes[0].code,
                                  }))
                                }
                                className="underline hover:text-white font-semibold ml-auto"
                              >
                                Autofill Stock Code
                              </button>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={redemptionCodeInput[r.id] || ''}
                              onChange={(e) =>
                                setRedemptionCodeInput((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                              placeholder="Paste or enter actual redeem code..."
                              className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono outline-none focus:border-purple-500/50"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApproveRedemption(r.id)}
                                disabled={isBusy || !redemptionCodeInput[r.id]?.trim()}
                                className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                              >
                                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                Approve &amp; Deliver Code
                              </button>
                              <button
                                onClick={() => handleRejectRedemption(r.id)}
                                disabled={isBusy}
                                className="px-3.5 py-2 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject &amp; Refund
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function AdminStorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
        </div>
      }
    >
      <AdminStoreContent />
    </Suspense>
  );
}
