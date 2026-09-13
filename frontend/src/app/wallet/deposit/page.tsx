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
  Smartphone,
  ShieldCheck,
  Clock,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  Wallet,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { dynamicDepositApi, DynamicDepositOrder, formatCurrency } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

const FIVE_MINUTES_SECONDS = 300;
const PRESET_AMOUNTS = [50, 100, 200, 500, 1000];

function DepositContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Query parameter amount if provided
  const queryAmount = searchParams.get('amount');
  const initialAmount = queryAmount ? Math.max(1, parseFloat(queryAmount) || 0) : 0;

  const [inputAmount, setInputAmount] = useState<string>(initialAmount > 0 ? String(initialAmount) : '100');
  const [order, setOrder] = useState<DynamicDepositOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(FIVE_MINUTES_SECONDS);
  const [isTimerExpired, setIsTimerExpired] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [creditedAmount, setCreditedAmount] = useState<number>(initialAmount || 100);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/wallet/deposit');
    }
  }, [user, authLoading, router]);

  // Initiate deposit order
  const startDeposit = async (amt: number) => {
    if (amt <= 0 || loading) return;

    setLoading(true);
    setError('');
    setIsSuccess(false);
    setIsTimerExpired(false);
    setTimeLeft(FIVE_MINUTES_SECONDS);
    setOrder(null);

    try {
      const res = await dynamicDepositApi.initiate(amt);
      if (res.success && res.data) {
        setOrder(res.data);
        setCreditedAmount(res.data.requestedAmount);

        // Calculate remaining seconds if timerExpiresAt is returned
        if (res.data.timerExpiresAt) {
          const diffMs = new Date(res.data.timerExpiresAt).getTime() - Date.now();
          const sec = Math.max(0, Math.floor(diffMs / 1000));
          setTimeLeft(sec > 0 ? sec : FIVE_MINUTES_SECONDS);
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

  // Automatically start order if initialAmount was in URL params
  useEffect(() => {
    if (initialAmount > 0 && !order && !loading && !isSuccess) {
      startDeposit(initialAmount);
    }
  }, [initialAmount]);

  // 5-minute Countdown Interval
  useEffect(() => {
    if (!order || isSuccess) return;

    countdownIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsTimerExpired(true);
          clearInterval(countdownIntervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [order, isSuccess]);

  // Status Polling every 2.5 seconds
  useEffect(() => {
    if (!order || isSuccess) return;

    const checkStatus = async () => {
      try {
        const res = await dynamicDepositApi.getStatus(order.transactionId);
        if (res.success && res.data) {
          if (res.data.isCompleted) {
            setIsSuccess(true);
            setCreditedAmount(res.data.requestedAmount);
            if (typeof res.data.balance === 'number') {
              setNewBalance(res.data.balance);
            }
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          } else if (res.data.isLateMatch || res.data.status === 'AWAITING_LATE_MATCH') {
            setIsTimerExpired(true);
          }
        }
      } catch {
        // Silently continue polling
      }
    };

    pollTimerRef.current = setInterval(checkStatus, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [order, isSuccess]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / FIVE_MINUTES_SECONDS) * 100));

  const handleCopyDeepLink = async () => {
    if (!order?.upiDeepLink) return;
    try {
      await navigator.clipboard.writeText(order.upiDeepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback ignore
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-fire-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center py-10 px-4 sm:px-6">
      <div className="w-full max-w-xl mx-auto">
        {/* Top Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Back to Wallet
          </Link>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Automated UPI Verification
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
              className="glass-card rounded-3xl p-8 sm:p-10 border border-emerald-500/30 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-fire-500/10 rounded-full blur-3xl pointer-events-none" />

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.1 }}
                className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black shadow-xl shadow-emerald-500/25"
              >
                <Check className="w-10 h-10 stroke-[3]" />
              </motion.div>

              <h1 className="text-3xl font-display font-black text-white mb-2 tracking-tight">
                Payment Verified! 🎉
              </h1>
              <p className="text-emerald-400 font-semibold text-lg mb-4">
                +{formatCurrency(creditedAmount)} added to your wallet
              </p>

              {newBalance !== null && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 mb-6 text-sm">
                  <Wallet className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-400">New Balance:</span>
                  <span className="font-bold text-white">{formatCurrency(newBalance)}</span>
                </div>
              )}

              <p className="text-zinc-400 text-xs max-w-sm mx-auto mb-8">
                Your deposit was instantly verified and credited. You can now use your balance to enter tournaments.
              </p>

              <button
                onClick={() => router.push('/wallet')}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
              >
                Return to Wallet
              </button>
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
              className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl relative"
            >
              {/* Header Details */}
              <div className="text-center mb-6">
                <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold mb-1">
                  UPI Instant Deposit
                </p>
                <h1 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">
                  Scan to Pay{' '}
                  <span className="gradient-text font-black">
                    {formatCurrency(order.requestedAmount)}
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                  Scan using Google Pay, PhonePe, Paytm, or BHIM. Pay the exact requested amount.
                </p>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center my-6">
                <div className="relative group">
                  <div className="absolute -inset-2 bg-gradient-to-r from-fire-500/30 to-amber-500/30 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition-opacity" />
                  <div className="relative p-4 sm:p-5 bg-white rounded-3xl shadow-2xl border-4 border-white/10 flex items-center justify-center">
                    <img
                      src={order.qrCodeDataUrl}
                      alt="UPI QR Code"
                      className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl block select-none"
                    />
                  </div>
                </div>

                {/* Mobile Direct Pay Button */}
                <div className="w-full max-w-sm mt-5 space-y-2">
                  <a
                    href={order.upiDeepLink}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-fire-500 to-amber-500 hover:from-fire-600 hover:to-amber-600 text-white font-bold text-xs tracking-wide shadow-lg shadow-fire-500/25 transition-all active:scale-[0.98]"
                  >
                    <Smartphone className="w-4 h-4" />
                    Pay via UPI App (GPay / PhonePe / Paytm)
                  </a>

                  <button
                    onClick={handleCopyDeepLink}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">UPI Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy UPI Payment Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Polished 5-Minute Timer & Progress Bar */}
              <div className="mt-6 mb-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                    <Clock className="w-4 h-4 text-fire-400" />
                    QR Code Expiry
                  </span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      timeLeft <= 60 ? 'text-red-400 animate-pulse' : 'text-white'
                    }`}
                  >
                    {formattedTime}
                  </span>
                </div>

                {/* Animated Linear Progress Bar */}
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
                  <motion.div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      timeLeft <= 60
                        ? 'bg-gradient-to-r from-red-500 to-amber-500'
                        : 'bg-gradient-to-r from-fire-500 to-amber-400'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Waiting for verification indicator OR Late Match Transition */}
              <div className="mt-4 pt-4 border-t border-white/5">
                {!isTimerExpired ? (
                  <div className="flex items-center justify-center gap-3 py-2 text-xs text-zinc-300">
                    <div className="relative flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-amber-400/30 animate-ping absolute" />
                      <Loader2 className="w-4 h-4 text-amber-400 animate-spin relative" />
                    </div>
                    <span>
                      Waiting for payment verification...{' '}
                      <strong className="text-zinc-400 font-normal">Listening for bank SMS</strong>
                    </span>
                  </div>
                ) : (
                  /* Requirement 5: Timer Expired / Late Match State */
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-200 leading-relaxed">
                          Taking a bit longer than usual. If you&apos;ve already paid, please don&apos;t pay again — it will be verified automatically. If it doesn&apos;t reflect within 15 minutes, contact support with your UTR.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-amber-500/10 text-xs">
                      <div className="flex items-center gap-2 text-amber-400/90 text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Still checking for your bank credit in the background...
                      </div>
                      <Link
                        href="/wallet"
                        className="text-xs font-semibold text-zinc-300 hover:text-white underline"
                      >
                        Return to Wallet
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Security note */}
              <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80" />
                <span>Protected by NeoBattle automated UPI bank credit verification</span>
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
              className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-fire-500/10 border border-fire-500/20 text-fire-400 flex items-center justify-center mx-auto mb-3">
                  <Wallet className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                  Add Tournament Balance
                </h1>
                <p className="text-xs text-zinc-400 mt-1">
                  Enter the amount you wish to deposit to generate your dynamic UPI QR code.
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
                      min="1"
                      step="1"
                      value={inputAmount}
                      onChange={(e) => {
                        setInputAmount(e.target.value);
                        setError('');
                      }}
                      placeholder="e.g. 100"
                      className="w-full pl-9 pr-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white font-display font-bold text-xl outline-none focus:border-fire-500/50 transition-colors"
                      autoFocus
                    />
                  </div>
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
                            ? 'bg-gradient-to-r from-fire-500 to-amber-500 text-white shadow-md shadow-fire-500/20 scale-[1.02]'
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
                  disabled={loading || !inputAmount || parseFloat(inputAmount) <= 0}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-fire-500 to-amber-500 hover:from-fire-600 hover:to-amber-600 text-white font-bold text-sm tracking-wide shadow-xl shadow-fire-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
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

              <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Zero convenience fees • Instant 24/7 wallet credit</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function DepositPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-fire-500 animate-spin" />
        </div>
      }
    >
      <DepositContent />
    </Suspense>
  );
}
