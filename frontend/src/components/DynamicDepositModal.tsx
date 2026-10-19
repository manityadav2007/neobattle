'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle, AlertCircle, Loader2, Smartphone, ShieldCheck, Clock, RefreshCw, Copy, Check, Info
} from 'lucide-react';
import { dynamicDepositApi, DynamicDepositOrder, DepositOrderStatus, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface DynamicDepositModalProps {
  amount: number;
  open: boolean;
  onClose: () => void;
  onSuccess: (newBalance?: number) => void;
}

const FIVE_MINUTES_SECONDS = 300;

export default function DynamicDepositModal({
  amount,
  open,
  onClose,
  onSuccess,
}: DynamicDepositModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<DynamicDepositOrder | null>(null);
  const [timeLeft, setTimeLeft] = useState(FIVE_MINUTES_SECONDS);
  const [isTimerExpired, setIsTimerExpired] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [creditedAmount, setCreditedAmount] = useState<number>(amount);
  const [copiedLink, setCopiedLink] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to compute remaining milliseconds clamped at 0
  const computeRemainingMs = (targetDate: string | Date | null | undefined): number => {
    if (!targetDate) return 0;
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(0, diff);
  };

  // 1. Initiate Deposit Order on open
  useEffect(() => {
    if (!open || amount <= 0) return;

    let isMounted = true;
    setLoading(true);
    setError('');
    setIsSuccess(false);
    setIsTimerExpired(false);
    setTimeLeft(FIVE_MINUTES_SECONDS);
    setOrder(null);

    dynamicDepositApi
      .initiate(amount)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setOrder(res.data);
          setCreditedAmount(res.data.requestedAmount);

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
          setError(res.message || 'Failed to generate payment QR');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(getErrorMessage(err) || 'High traffic right now, please try again in a moment.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, amount]);

  // 2. Absolute Expiry Countdown Timer & Visibility/Focus Sync
  useEffect(() => {
    if (!order || isSuccess || isTimerExpired) return;

    const targetExpiry = order.expiresAt || order.timerExpiresAt;
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

    syncRemainingTime();
    countdownIntervalRef.current = setInterval(syncRemainingTime, 1000);

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

  // 3. Polling for payment match every 2.5 seconds (only while active and not expired)
  useEffect(() => {
    if (!order || isSuccess || isTimerExpired) return;

    const checkStatus = async () => {
      try {
        const res = await dynamicDepositApi.getStatus(order.transactionId);
        if (res.success && res.data) {
          if (res.data.isCompleted) {
            setIsSuccess(true);
            setCreditedAmount(res.data.requestedAmount);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            onSuccess(res.data.balance);
          } else if (res.data.isExpired || res.data.status === 'EXPIRED') {
            setIsTimerExpired(true);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          }
        }
      } catch (err) {
        // Silently continue polling on network blips
      }
    };

    pollTimerRef.current = setInterval(checkStatus, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [order, isSuccess, isTimerExpired, onSuccess]);

  if (!open) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / FIVE_MINUTES_SECONDS) * 100));

  const handleCopyDeepLink = async () => {
    if (!order?.upiDeepLink) return;
    try {
      await navigator.clipboard.writeText(order.upiDeepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isSuccess ? onClose : undefined}
        />

        {/* Modal Dialog */}
        <motion.div
          className="relative w-full max-w-md rounded-3xl bg-zinc-950/90 border border-white/10 p-6 sm:p-7 shadow-[0_16px_50px_rgba(0,0,0,0.8)] z-10 fire-glow overflow-hidden"
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-fire-500/10 border border-fire-500/20 text-fire-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Automated UPI Deposit</h3>
                <p className="text-[11px] text-zinc-400">Instant Verification &amp; Wallet Credit</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-fire-400 mx-auto" />
              <p className="text-sm font-semibold text-white">Generating Dedicated Payment QR...</p>
              <p className="text-xs text-zinc-500">Assigning unique verification slot from pool</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="py-10 text-center space-y-4">
              <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 w-12 h-12 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-sm text-rose-300 font-medium px-4">{error}</p>
              <button
                onClick={onClose}
                className="btn-fire px-6 py-2.5 rounded-xl text-xs font-bold text-white"
              >
                Close &amp; Try Again
              </button>
            </div>
          )}

          {/* SUCCESS State */}
          {!loading && !error && isSuccess && (
            <div className="py-8 text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 mx-auto flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
              >
                <CheckCircle className="w-9 h-9" />
              </motion.div>
              <div>
                <h4 className="text-xl font-black text-white">Payment Verified! ✅</h4>
                <p className="text-sm text-emerald-400 font-bold mt-1">
                  ₹{creditedAmount} Added to Your Wallet
                </p>
                <p className="text-xs text-zinc-400 mt-1">Your balance has been updated automatically.</p>
              </div>
              <button
                onClick={onClose}
                className="btn-fire w-full py-3.5 rounded-xl font-bold text-white shadow-lg"
              >
                Done
              </button>
            </div>
          )}

          {/* Expired State */}
          {!loading && !error && !isSuccess && order && isTimerExpired && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/25 mx-auto flex items-center justify-center text-orange-400 shadow-lg shadow-orange-500/10">
                <Clock className="w-7 h-7 stroke-[2.2]" />
              </div>

              <div>
                <h4 className="text-xl font-black text-white">Deposit request expired</h4>
                <div className="mt-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-200 text-xs leading-relaxed max-w-sm mx-auto">
                  <p className="font-semibold text-orange-300">
                    If you already paid, your wallet will be credited automatically within 15 minutes. Do not pay again.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn-fire w-full py-3.5 rounded-xl font-bold text-white shadow-lg"
              >
                Start New Deposit
              </button>
            </div>
          )}

          {/* Active QR & Countdown State */}
          {!loading && !error && !isSuccess && order && !isTimerExpired && (
            <div className="space-y-4 pt-3">
              {/* Amount Banner — Shows exact actual amount with paise offset */}
              <div className="text-center p-3 rounded-2xl bg-white/[0.04] border border-white/5">
                <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold block">
                  Scan to Pay
                </span>
                <span className="text-3xl font-black gradient-text tracking-tight mt-0.5 inline-block">
                  {formatCurrency(order.actualQrAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Explanatory note about dynamic paise matching */}
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-left flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  <strong className="text-blue-300 font-semibold">Why the extra paise?</strong>{' '}
                  This unique amount lets us verify and credit your payment instantly, without any manual approval delays. You&apos;ll always receive the exact amount you requested in your wallet.
                </p>
              </div>

              {/* Dynamic QR Display */}
              <div className="relative mx-auto w-56 h-56 p-3 rounded-2xl bg-white shadow-xl border-2 border-white/20 flex items-center justify-center">
                <img
                  src={order.qrCodeDataUrl}
                  alt="UPI Payment QR Code"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* 5-Minute Timer & Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-fire-400" />
                    <span>QR Valid For:</span>
                  </span>
                  <span className={`font-mono font-bold text-sm ${timeLeft < 60 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                    {formattedTime}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className={`h-full transition-all duration-1000 ${
                      timeLeft < 60 ? 'bg-rose-500' : 'bg-gradient-to-r from-fire-500 to-amber-400'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Verification in progress */}
              <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs text-zinc-300">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fire-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fire-500" />
                </span>
                <span className="font-medium">Waiting for payment verification...</span>
              </div>

              {/* Mobile 1-Click Pay via UPI Deep Link */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={order.upiDeepLink}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Pay via UPI App</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyDeepLink}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy UPI Link'}</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
