'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  ShieldCheck,
  Clock,
  Check,
  Wallet,
  Sparkles,
  ChevronRight,
  CreditCard,
  Info,
  Receipt,
  Upload,
  FileText,
  Eye,
  X,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { dynamicDepositApi, DynamicDepositOrder, formatCurrency, walletApi, WalletLimits, depositClaimApi, DepositRequest } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

const DEFAULT_LIMITS: WalletLimits = {
  minDeposit: 10,
  maxDeposit: 10000,
  minWithdrawal: 100,
  maxWithdrawal: 5000,
  maxDailyWithdrawalPerUser: 5000,
};

const FIVE_MINUTES_SECONDS = 300;
const PRESET_AMOUNTS = [50, 100, 200, 500, 1000];

// Freework-style circular wave loader configuration (Orange to Blue brand gradient)
const FREEWORK_LOADER_DOTS = [
  { angle: 0, color: '#f97316' },   // Fire Orange (top)
  { angle: 45, color: '#fb923c' },  // Warm Amber/Orange
  { angle: 90, color: '#f43f5e' },  // Coral / Rose
  { angle: 135, color: '#818cf8' }, // Indigo Bridge
  { angle: 180, color: '#3b82f6' }, // Neo Blue (bottom)
  { angle: 225, color: '#60a5fa' }, // Light Neo Blue
  { angle: 270, color: '#a855f7' }, // Violet Bridge
  { angle: 315, color: '#ea580c' }, // Deep Fire Orange
];


function DepositContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Query parameter amount if provided
  const queryAmount = searchParams.get('amount');
  const initialAmount = queryAmount ? Math.max(1, parseFloat(queryAmount) || 0) : 0;

  const [inputAmount, setInputAmount] = useState<string>(initialAmount > 0 ? String(initialAmount) : '100');
  const [limits, setLimits] = useState<WalletLimits>(DEFAULT_LIMITS);
  const [order, setOrder] = useState<DynamicDepositOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    walletApi.getLimits().then((res) => {
      if (isMounted && res.data) {
        setLimits(res.data);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);
  const [timeLeft, setTimeLeft] = useState(FIVE_MINUTES_SECONDS);
  const [isTimerExpired, setIsTimerExpired] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [creditedAmount, setCreditedAmount] = useState<number>(initialAmount || 100);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const [savedConfirm, setSavedConfirm] = useState(false);
  const [downloadBlocked, setDownloadBlocked] = useState(false);
  const [savingQr, setSavingQr] = useState(false);

  const [checkingActive, setCheckingActive] = useState(true);
  const hasCheckedActiveRef = useRef(false);

  // Deposit Claim Flow State
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showClaimsListModal, setShowClaimsListModal] = useState(false);
  const [myClaims, setMyClaims] = useState<DepositRequest[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [claimUtr, setClaimUtr] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [claimPreview, setClaimPreview] = useState<string | null>(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [submittedClaim, setSubmittedClaim] = useState<DepositRequest | null>(null);

  const fetchMyClaims = async () => {
    try {
      setLoadingClaims(true);
      const res = await depositClaimApi.myClaims();
      if (res.success && res.data) {
        setMyClaims(res.data);
      }
    } catch (err) {
      console.error('Failed to load deposit claims:', err);
    } finally {
      setLoadingClaims(false);
    }
  };

  const handleClaimFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      setClaimError('Only JPG, PNG, and WebP images are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setClaimError('File size exceeds 5MB limit.');
      return;
    }

    setClaimError('');
    setClaimFile(file);
    const reader = new FileReader();
    reader.onload = () => setClaimPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    const cleanUtr = claimUtr.trim();
    if (!/^\d{12}$/.test(cleanUtr)) {
      setClaimError('UTR / reference number must be exactly 12 digits');
      return;
    }

    if (!claimFile) {
      setClaimError('Payment screenshot is required');
      return;
    }

    try {
      setSubmittingClaim(true);
      setClaimError('');

      const formData = new FormData();
      formData.append('depositTransactionId', order.transactionId);
      formData.append('utrNumber', cleanUtr);
      if (claimNotes.trim()) {
        formData.append('notes', claimNotes.trim());
      }
      formData.append('screenshot', claimFile);

      const res = await depositClaimApi.submit(formData);
      if (res.success && res.data) {
        setSubmittedClaim(res.data);
        setShowClaimModal(false);
        fetchMyClaims();
      }
    } catch (err: any) {
      setClaimError(getErrorMessage(err));
    } finally {
      setSubmittingClaim(false);
    }
  };

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const STORAGE_KEY = 'firearena_deposit_order';

  // Helper to compute remaining milliseconds clamped at 0
  const computeRemainingMs = (targetDate: string | Date | null | undefined): number => {
    if (!targetDate) return 0;
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(0, diff);
  };

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/wallet/deposit');
    }
  }, [user, authLoading, router]);

  // Initiate deposit order (always creates a NEW deposit)
  const startDeposit = async (amt: number) => {
    if (amt <= 0 || loading) return;

    setLoading(true);
    setError('');
    setIsSuccess(false);
    setIsTimerExpired(false);
    setOrder(null);

    try {
      const res = await dynamicDepositApi.initiate(amt);
      if (res.success && res.data) {
        setOrder(res.data);
        setCreditedAmount(res.data.requestedAmount);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
        } catch {}
        
        // Calculate remaining seconds strictly from the server's absolute expiry
        const targetExpiry = res.data.expiresAt || res.data.timerExpiresAt;
        if (targetExpiry) {
          const remainingMs = computeRemainingMs(targetExpiry);
          const sec = Math.floor(remainingMs / 1000);
          setTimeLeft(sec);
          if (sec <= 0) {
            setIsTimerExpired(true);
          }
        } else {
          setTimeLeft(FIVE_MINUTES_SECONDS);
        }
      } else {
        setError(res.message || 'Unable to generate payment QR. Please try again.');
      }
    } catch (err: any) {
      setError(getErrorMessage(err) || 'High network traffic right now. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  // Resume only when ?resume=<depositId> is passed from transaction history (Part A)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCheckingActive(false);
      return;
    }
    if (hasCheckedActiveRef.current) return;
    hasCheckedActiveRef.current = true;

    const resumeId = searchParams.get('resume');

    if (resumeId) {
      // User tapped a pending item in Transaction History
      const fetchResumable = async () => {
        try {
          const res = await dynamicDepositApi.getResumable(resumeId);
          if (res.success && res.data) {
            const targetExpiry = res.data.expiresAt || res.data.timerExpiresAt;
            const remainingMs = computeRemainingMs(targetExpiry);
            if (remainingMs > 0) {
              setOrder(res.data);
              setTimeLeft(Math.floor(remainingMs / 1000));
              setIsTimerExpired(false);
              setCheckingActive(false);
              return;
            } else {
              // 5-minute payment window ended -> show expired screen
              setOrder(res.data);
              setIsTimerExpired(true);
              setTimeLeft(0);
              setCheckingActive(false);
              return;
            }
          }
        } catch {
          // If getResumable returns 404 (e.g. 5-min window has ended), verify with getStatus
          try {
            const statusRes = await dynamicDepositApi.getStatus(resumeId);
            if (statusRes.success && statusRes.data) {
              setOrder({
                transactionId: statusRes.data.transactionId,
                requestedAmount: statusRes.data.requestedAmount,
                actualQrAmount: statusRes.data.actualQrAmount,
                upiDeepLink: '',
                qrCodeDataUrl: '',
                timerExpiresAt: statusRes.data.timerExpiresAt,
                expiresAt: statusRes.data.expiresAt,
              });
              setIsTimerExpired(true);
              setTimeLeft(0);
              setCheckingActive(false);
              return;
            }
          } catch {}
        }

        // Deposit not found or belonging to another user
        setOrder(null);
        setIsTimerExpired(false);
        setError('Deposit request not found, expired, or belongs to another user.');
        setCheckingActive(false);
      };

      fetchResumable();
    } else {
      // No resumeId: entering an amount and tapping Deposit must always create a NEW deposit
      setOrder(null);
      setIsTimerExpired(false);
      setCheckingActive(false);

      if (initialAmount > 0) {
        startDeposit(initialAmount);
      }
    }
  }, [user, authLoading, searchParams, initialAmount]);

  const handleCancelOrder = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    if (order?.transactionId) {
      try {
        await dynamicDepositApi.cancel(order.transactionId);
      } catch {
        // Silently continue
      }
    }
    setOrder(null);
    setIsTimerExpired(false);
    setTimeLeft(FIVE_MINUTES_SECONDS);
    router.replace('/wallet/deposit');
  };

  const handleStartNewDeposit = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setOrder(null);
    setIsTimerExpired(false);
    setTimeLeft(FIVE_MINUTES_SECONDS);
    router.replace('/wallet/deposit');
  };

  // Absolute Expiry Countdown Timer & Visibility/Focus Sync
  useEffect(() => {
    if (!order || isSuccess || isTimerExpired) return;

    const targetExpiry = order.timerExpiresAt || order.expiresAt;
    if (!targetExpiry) return;

    const syncRemainingTime = () => {
      const remainingMs = computeRemainingMs(targetExpiry);
      const sec = Math.floor(remainingMs / 1000);
      setTimeLeft(sec);
      if (sec <= 0) {
        setIsTimerExpired(true);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      }
    };

    // Run immediately to ensure fresh timestamp comparison
    syncRemainingTime();

    // Regular 1-second tick recalculating remaining = expiresAt - Date.now()
    countdownIntervalRef.current = setInterval(syncRemainingTime, 1000);

    // Event listeners to handle browser background throttling (mobile/tab switch)
    const handleVisibilityOrFocus = () => {
      syncRemainingTime();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
    };
  }, [order, isSuccess, isTimerExpired]);

  // Status Polling: Polls while order is active, with exponential backoff on errors and immediate halt on 4xx/expiry
  useEffect(() => {
    if (!order?.transactionId || order.transactionId === 'pending' || isSuccess || isTimerExpired) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let isSubscribed = true;
    let consecutiveErrors = 0;
    const baseIntervalMs = 2500;

    const scheduleNext = (delayMs: number) => {
      if (!isSubscribed) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(checkStatus, delayMs);
    };

    const checkStatus = async () => {
      if (!isSubscribed || !order?.transactionId || isSuccess || isTimerExpired) return;

      try {
        const res = await dynamicDepositApi.getStatus(order.transactionId);
        if (!isSubscribed) return;

        consecutiveErrors = 0;

        if (res.success && res.data) {
          if (res.data.isCompleted) {
            setIsSuccess(true);
            setCreditedAmount(res.data.requestedAmount);
            if (typeof res.data.balance === 'number') {
              setNewBalance(res.data.balance);
            }
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {}
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return;
          } else if (res.data.isLateMatch || res.data.status === 'AWAITING_LATE_MATCH' || res.data.isExpired || res.data.status === 'EXPIRED') {
            setIsTimerExpired(true);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return;
          }
        }
        // Success but pending: schedule next standard poll
        scheduleNext(baseIntervalMs);
      } catch (err: any) {
        if (!isSubscribed) return;

        // If server returns 404, 400, 401, 403 (any 4xx client error other than 429), deposit request is not valid -> STOP immediately
        if (axios.isAxiosError(err) && err.response?.status) {
          const status = err.response.status;
          if (status >= 400 && status < 500 && status !== 429) {
            console.warn(`[Deposit] Status check returned ${status}, halting polling.`);
            setIsTimerExpired(true);
            return;
          }
        }

        consecutiveErrors += 1;
        // Stop polling after 8 consecutive network / rate-limit failures
        if (consecutiveErrors >= 8) {
          console.warn('[Deposit] Consecutive polling errors exceeded limit, halting polling.');
          return;
        }

        // Exponential backoff for 429 or transient network errors: 3.5s -> 5.5s -> 8.5s -> 12s -> 15s max
        const backoffMultiplier = Math.min(6, Math.pow(1.5, consecutiveErrors));
        const delayMs = Math.round(baseIntervalMs * backoffMultiplier);
        scheduleNext(delayMs);
      }
    };

    // Kick off first status check after baseInterval
    scheduleNext(baseIntervalMs);

    return () => {
      isSubscribed = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [order, isSuccess, isTimerExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / FIVE_MINUTES_SECONDS) * 100));

  const handleSaveQr = async () => {
    if (!order?.qrCodeDataUrl) return;

    setSavingQr(true);
    setDownloadBlocked(false);

    try {
      // 1. Render to canvas at least 800x800
      const canvas = document.createElement('canvas');
      const size = 800;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      // 2. White quiet-zone border (at least 4 modules)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);

      // 3. Load QR image
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load QR code image'));
        img.src = order.qrCodeDataUrl;
      });

      // 40px quiet-zone margin inside 800x800 canvas
      const padding = 40;
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);

      // 4. Export as PNG blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });

      if (!blob) throw new Error('Blob creation failed');

      // 5. Trigger download named neobattle-deposit-<amount>.png
      const fileName = `neobattle-deposit-${order.actualQrAmount}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setSavedConfirm(true);
      setTimeout(() => setSavedConfirm(false), 3500);
    } catch (err) {
      console.error('Save QR error:', err);
      setDownloadBlocked(true);
    } finally {
      setSavingQr(false);
    }
  };

  if (authLoading || checkingActive) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center py-10 px-4 sm:px-6">
      <div className="w-full max-w-lg mx-auto">
        {/* Header Badge */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setShowClaimsListModal(true);
              fetchMyClaims();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors"
          >
            <Receipt className="w-3.5 h-3.5 text-blue-400" />
            My Claims
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Instant Verification
          </div>
        </div>

        {/* ==================================================== */}
        {/* SUCCESS STATE                                        */}
        {/* ==================================================== */}
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-8 sm:p-10 border border-emerald-500/30 text-center shadow-2xl relative overflow-hidden fire-glow"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black shadow-xl shadow-emerald-500/20">
                <Check className="w-10 h-10 stroke-[3]" />
              </div>

              <h1 className="text-3xl font-display font-black text-white mb-2 tracking-tight">
                Payment Verified! 🎉
              </h1>
              <p className="text-emerald-400 font-bold text-xl mb-4">
                +{formatCurrency(creditedAmount)} added to your wallet
              </p>

              {newBalance !== null && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 mb-6 text-sm">
                  <Wallet className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-400">Available Balance:</span>
                  <span className="font-bold text-white">{formatCurrency(newBalance)}</span>
                </div>
              )}

              <p className="text-zinc-400 text-xs max-w-sm mx-auto mb-8 leading-relaxed">
                Your funds have been credited and are ready to use for tournament registrations.
              </p>

              <button
                onClick={() => router.push('/wallet')}
                className="w-full py-3.5 px-6 rounded-xl btn-fire text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
              >
                Return to Wallet
              </button>
            </motion.div>
          ) : order && isTimerExpired ? (
            /* ==================================================== */
            /* EXPIRED SCREEN (Requirement 3 & 5)                  */
            /* ==================================================== */
            <motion.div
              key="expired-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-2xl p-8 sm:p-10 border border-orange-500/30 text-center shadow-2xl relative overflow-hidden fire-glow"
            >
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400 shadow-xl shadow-orange-500/10">
                <Clock className="w-8 h-8 stroke-[2.2]" />
              </div>

              <h1 className="text-2xl sm:text-3xl font-display font-black text-white mb-3 tracking-tight">
                Deposit request expired
              </h1>

              {submittedClaim ? (
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm leading-relaxed max-w-md mx-auto mb-8 text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5 text-sm">
                      <Receipt className="w-4 h-4 text-amber-400" /> Payment Claim Submitted
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
                      Under review
                    </span>
                  </div>
                  <p className="text-zinc-300 text-xs leading-relaxed">
                    Your claim for <strong className="text-white font-mono">{formatCurrency(submittedClaim.exactAmount || order.actualQrAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> (Ref: <span className="font-mono text-white">{submittedClaim.utrNumber}</span>) is under review. Our team will verify your receipt and credit your wallet.
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    You will receive an in-app notification once approved.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-200 text-xs sm:text-sm leading-relaxed max-w-md mx-auto mb-8 space-y-2">
                  <p className="font-semibold text-orange-300">
                    If you already paid, your wallet will be credited automatically within 15 minutes. Do not pay again.
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Did your money deduct from your bank? Tap &quot;I already paid&quot; below to submit your 12-digit UTR and screenshot for immediate review.
                  </p>
                </div>
              )}

              <div className="w-full max-w-sm mx-auto space-y-2.5">
                {!submittedClaim && (
                  <button
                    type="button"
                    onClick={() => {
                      setClaimUtr('');
                      setClaimNotes('');
                      setClaimFile(null);
                      setClaimPreview(null);
                      setClaimError('');
                      setShowClaimModal(true);
                    }}
                    className="w-full py-3.5 px-6 rounded-xl btn-fire text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Receipt className="w-4 h-4" />
                    I already paid
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartNewDeposit}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                    submittedClaim
                      ? 'btn-fire text-white shadow-lg shadow-blue-500/20'
                      : 'bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300'
                  }`}
                >
                  Start New Deposit
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowClaimsListModal(true);
                    fetchMyClaims();
                  }}
                  className="w-full text-center py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View My Deposit Claims &rarr;
                </button>
              </div>
            </motion.div>
          ) : order ? (
            /* ==================================================== */
            /* ACTIVE QR & TIMER DISPLAY                           */
            /* ==================================================== */
            <motion.div
              key="active-qr-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="glass-card rounded-2xl p-6 sm:p-8 border border-white/10 shadow-2xl fire-glow relative"
            >
              {/* Header Amount Display */}
              <div className="text-center mb-6">
                <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold mb-1.5">
                  UPI Deposit
                </p>
                <h1 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
                  Scan to Pay{' '}
                  <span className="gradient-text font-black">
                    {formatCurrency(order.actualQrAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-1.5 max-w-xs mx-auto">
                  Scan the QR code using any UPI app to deposit instantly.
                </p>

                {/* Explanatory note about dynamic paise matching */}
                <div className="mt-3.5 mx-auto max-w-sm p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-left flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    <strong className="text-blue-300 font-semibold">Why the extra paise?</strong>{' '}
                    This unique amount lets us verify and credit your payment instantly, without any manual approval delays. You&apos;ll always receive the exact amount you requested in your wallet.
                  </p>
                </div>
              </div>

              {/* Seamless QR Code Display Card */}
              <div className="flex flex-col items-center justify-center my-4">
                <div className="p-1 rounded-2xl bg-gradient-to-br from-blue-500/30 via-white/10 to-orange-500/30 shadow-2xl">
                  <div className="bg-[#0f1017] rounded-xl p-4 flex flex-col items-center border border-white/5">
                    {/* Badge inside QR card */}
                    <div className="mb-3 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      <span>Exact Amount: <strong className="text-white font-mono">{formatCurrency(order.actualQrAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>

                    {/* QR Code itself */}
                    <div className="p-3 bg-white rounded-xl shadow-inner flex items-center justify-center">
                      <img
                        src={order.qrCodeDataUrl}
                        alt="UPI QR Code"
                        className="w-56 h-56 sm:w-60 sm:h-60 object-contain rounded-lg block select-none"
                      />
                    </div>

                    {/* Supported UPI Providers */}
                    <p className="mt-3 text-[11px] font-medium text-zinc-400 tracking-wide">
                      GPay • PhonePe • Paytm • BHIM • Cred
                    </p>
                  </div>
                </div>

                {/* Save QR Action & Guidance */}
                <div className="w-full max-w-sm mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={handleSaveQr}
                    disabled={savingQr}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl btn-fire text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-75"
                  >
                    {savingQr ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : savedConfirm ? (
                      <Check className="w-4 h-4 text-white stroke-[2.5]" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {savedConfirm ? 'QR Code Saved!' : savingQr ? 'Saving QR...' : 'Save QR'}
                  </button>

                  {savedConfirm && (
                    <p className="text-center text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1.5 animate-in fade-in">
                      <Check className="w-3.5 h-3.5" />
                      Saved! Check your gallery or downloads.
                    </p>
                  )}

                  {downloadBlocked && (
                    <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs text-center leading-relaxed">
                      Download was blocked by your browser. Please long-press the QR code above and choose &quot;Save image&quot;.
                    </div>
                  )}

                  <p className="text-xs text-zinc-400 text-center leading-relaxed px-1">
                    Tap Save QR, then open any UPI app, tap Scan QR, choose Upload from gallery and select this image. Pay the exact amount shown, including paise.
                  </p>

                  <button
                    type="button"
                    onClick={handleCancelOrder}
                    className="w-full text-center py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel &amp; Choose Different Amount
                  </button>
                </div>
              </div>

              {/* Polished 5-Minute Timer & Fluid Progress Bar */}
              <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    Time Remaining
                  </span>
                  <span
                    className={`font-mono font-bold text-sm tracking-wider ${
                      timeLeft <= 60 ? 'text-orange-400 animate-pulse' : 'text-white'
                    }`}
                  >
                    {formattedTime}
                  </span>
                </div>

                {/* Progress Bar with Fluid CSS Transition */}
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                      timeLeft <= 60
                        ? 'bg-gradient-to-r from-orange-500 to-red-500'
                        : 'bg-gradient-to-r from-blue-500 to-orange-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Waiting for verification indicator */}
              <div className="mt-5 pt-5 border-t border-white/5">
                {/* Freework Dribbble-style circular wave loader */}
                <div className="flex flex-col items-center justify-center py-2 text-center">
                  {/* Staggered radial dots wave loader with brand orange-to-blue gradient */}
                  <div className="relative w-12 h-12 mb-3 flex items-center justify-center">
                    {/* Ambient background glow aura */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/15 via-transparent to-orange-500/15 blur-md pointer-events-none" />

                    {/* 8 Radial Staggered Pulsing Dots */}
                    {FREEWORK_LOADER_DOTS.map((dot, i) => (
                      <div
                        key={i}
                        className="absolute top-1/2 left-1/2 -ml-1 -mt-1 w-2 h-2 flex items-center justify-center pointer-events-none"
                        style={{
                          transform: `rotate(${dot.angle}deg) translateY(-16px)`,
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full freework-wave-dot"
                          style={{
                            backgroundColor: dot.color,
                            color: dot.color,
                            animationDelay: `${-1.2 + (i * 1.2) / FREEWORK_LOADER_DOTS.length}s`,
                          }}
                        />
                      </div>
                    ))}

                    {/* Delicate ambient center core */}
                    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-blue-400/40 to-orange-400/40 blur-[0.5px] pointer-events-none" />
                  </div>

                  {/* Status Headline */}
                  <div className="flex items-center justify-center gap-1 text-sm font-bold text-white tracking-wide">
                    <span>Verifying your payment</span>
                    <span className="flex space-x-0.5">
                      <span className="animate-bounce delay-100 text-blue-400 font-bold">.</span>
                      <span className="animate-bounce delay-200 text-blue-400 font-bold">.</span>
                      <span className="animate-bounce delay-300 text-orange-400 font-bold">.</span>
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
                    Please complete the transfer in your UPI app. This page will update automatically.
                  </p>
                </div>
              </div>

              {/* Security note */}
              <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400/80" />
                <span>Instant automated verification • 24/7 wallet credit</span>
              </div>
            </motion.div>
          ) : (
            /* ==================================================== */
            /* INPUT AMOUNT / PRESETS FORM                          */
            /* ==================================================== */
            <motion.div
              key="input-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="glass-card rounded-2xl p-6 sm:p-8 border border-white/10 shadow-2xl fire-glow"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3">
                  <Wallet className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                  Add Wallet Balance
                </h1>
                <p className="text-xs text-zinc-400 mt-1">
                  Choose or enter the amount you want to deposit to generate your UPI QR code.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                    Deposit Amount (₹)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-4 font-display font-bold text-lg text-zinc-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min={limits.minDeposit}
                      max={limits.maxDeposit}
                      step="any"
                      value={inputAmount}
                      onChange={(e) => {
                        setInputAmount(e.target.value);
                        setError('');
                      }}
                      placeholder="e.g. 100"
                      className="input-field w-full pl-9 pr-4 py-3.5 rounded-xl text-white font-display font-bold text-xl"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5">
                    Min deposit {formatCurrency(limits.minDeposit)}, max {formatCurrency(limits.maxDeposit)}
                  </p>
                  {inputAmount.trim().length > 0 && (
                    (() => {
                      const t = inputAmount.trim();
                      const n = Number(t);
                      if (isNaN(n) || n <= 0) return <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>Amount must be greater than 0</span></p>;
                      if (!/^\d+(\.\d{1,2})?$/.test(t)) return <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>Amount can have at most 2 decimal places</span></p>;
                      if (n < limits.minDeposit) return <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>Minimum deposit is {formatCurrency(limits.minDeposit)}</span></p>;
                      if (n > limits.maxDeposit) return <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>Maximum deposit is {formatCurrency(limits.maxDeposit)}</span></p>;
                      return null;
                    })()
                  )}
                </div>

                {/* Quick Presets */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Quick Select
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setInputAmount(String(amt));
                          setError('');
                        }}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all ${
                          inputAmount === String(amt)
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm scale-[1.02]'
                            : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
                        }`}
                      >
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(inputAmount);
                    if (parsed && parsed > 0) {
                      startDeposit(parsed);
                    } else {
                      setError('Please enter a valid deposit amount greater than 0');
                    }
                  }}
                  disabled={
                    loading ||
                    !inputAmount.trim() ||
                    isNaN(Number(inputAmount.trim())) ||
                    Number(inputAmount.trim()) < limits.minDeposit ||
                    Number(inputAmount.trim()) > limits.maxDeposit ||
                    !/^\d+(\.\d{1,2})?$/.test(inputAmount.trim())
                  }
                  className="w-full py-3.5 px-6 rounded-xl btn-fire text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating QR Code...
                    </>
                  ) : (
                    <>
                      <span>Proceed to Payment</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-zinc-400">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Zero fees • Instant automated balance credit</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* "I ALREADY PAID" CLAIM SUBMISSION MODAL */}
      <AnimatePresence>
        {showClaimModal && order && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowClaimModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-md w-full bg-zinc-900 border border-white/15 rounded-2xl p-6 shadow-2xl overflow-hidden text-left"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-bold text-white">Deposit Claim</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {claimError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{claimError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitClaim} className="space-y-4">
                {/* Prefilled, read-only exact amount with paise */}
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Amount Paid (Prefilled &amp; Exact)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={formatCurrency(order.actualQrAmount, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    className="input-field w-full px-4 py-2.5 rounded-xl text-white font-mono font-bold bg-white/5 border border-white/10 cursor-not-allowed select-all"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    This matches the exact amount with unique paise generated for this deposit.
                  </p>
                </div>

                {/* 12-digit UTR input */}
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    12-digit UPI Reference / UTR Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    value={claimUtr}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setClaimUtr(val);
                      setClaimError('');
                    }}
                    placeholder="e.g. 428901234567"
                    className="input-field w-full px-4 py-2.5 rounded-xl text-white font-mono text-sm tracking-wider"
                    required
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Found on your UPI app transaction receipt (Google Pay, PhonePe, Paytm, BHIM, Cred). Must be exactly 12 digits.
                  </p>
                </div>

                {/* File picker */}
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Payment Screenshot <span className="text-red-400">*</span>
                  </label>
                  <div className="border-2 border-dashed border-white/15 rounded-xl p-4 text-center hover:border-blue-500/50 transition-colors bg-white/[0.02]">
                    <input
                      type="file"
                      id="claim-screenshot-input"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleClaimFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="claim-screenshot-input"
                      className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                    >
                      <Upload className="w-6 h-6 text-blue-400" />
                      <span className="text-xs font-semibold text-zinc-200">
                        {claimFile ? claimFile.name : 'Choose screenshot file'}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        JPG, PNG, or WebP up to 5MB
                      </span>
                    </label>
                  </div>
                  {claimPreview && (
                    <div className="mt-2 relative rounded-lg overflow-hidden border border-white/10 max-h-32 flex items-center justify-center bg-black">
                      <img src={claimPreview} alt="Preview" className="max-h-32 object-contain" />
                    </div>
                  )}
                </div>

                {/* Optional note */}
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Optional Note
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={claimNotes}
                    onChange={(e) => setClaimNotes(e.target.value)}
                    placeholder="e.g. Paid from PNB bank via PhonePe"
                    className="input-field w-full p-2.5 rounded-xl text-white text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowClaimModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingClaim || claimUtr.length !== 12 || !claimFile}
                    className="btn-fire px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingClaim ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...
                      </>
                    ) : (
                      'Submit Claim'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "MY DEPOSIT CLAIMS" MODAL */}
      <AnimatePresence>
        {showClaimsListModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowClaimsListModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-lg w-full bg-zinc-900 border border-white/15 rounded-2xl p-6 shadow-2xl max-h-[85vh] flex flex-col text-left"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-bold text-white">My Deposit Claims</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClaimsListModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-3 flex-1 pr-1">
                {loadingClaims ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    <span>Loading your claims...</span>
                  </div>
                ) : myClaims.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500 text-xs">
                    No deposit claims submitted yet.
                  </div>
                ) : (
                  myClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-white text-base">
                          {formatCurrency(claim.exactAmount || claim.amount, { minimumFractionDigits: 2 })}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            claim.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : claim.status === 'REJECTED'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : claim.status === 'AUTO_RESOLVED'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                          }`}
                        >
                          {claim.status === 'PENDING'
                            ? 'Under Review'
                            : claim.status === 'AUTO_RESOLVED'
                            ? 'Auto-Resolved'
                            : claim.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-zinc-400 flex-wrap gap-1">
                        {claim.utrNumber ? (
                          <span>
                            Ref: <strong className="font-mono text-zinc-300">{claim.utrNumber}</strong>
                          </span>
                        ) : (
                          <span className="italic text-zinc-500">No UTR</span>
                        )}
                        <span>{new Date(claim.createdAt).toLocaleDateString()}</span>
                      </div>

                      {claim.status === 'REJECTED' && claim.rejectionReason && (
                        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                          <strong>Rejection reason:</strong> {claim.rejectionReason}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DepositPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <DepositContent />
    </Suspense>
  );
}
