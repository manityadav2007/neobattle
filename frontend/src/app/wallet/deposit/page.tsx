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
  Copy,
  Check,
  Wallet,
  Sparkles,
  ChevronRight,
  CreditCard,
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
    // Always initialize timer at exactly 5 minutes (300 seconds)
    setTimeLeft(FIVE_MINUTES_SECONDS);
    setOrder(null);

    try {
      const res = await dynamicDepositApi.initiate(amt);
      if (res.success && res.data) {
        setOrder(res.data);
        setCreditedAmount(res.data.requestedAmount);
        // Start countdown from exactly 300 seconds
        setTimeLeft(FIVE_MINUTES_SECONDS);
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

  // 5-minute Countdown Interval: counts down by 1 second every 1000ms
  useEffect(() => {
    if (!order || isSuccess) return;

    countdownIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsTimerExpired(true);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
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
        // Silently continue polling on transient network issues
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
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center py-10 px-4 sm:px-6">
      <div className="w-full max-w-lg mx-auto">
        {/* Header Badge */}
        <div className="mb-6 flex items-center justify-end">
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
                    {formatCurrency(order.requestedAmount)}
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-1.5 max-w-xs mx-auto">
                  Scan the QR code using any UPI app to deposit instantly.
                </p>
              </div>

              {/* Seamless QR Code Display Card */}
              <div className="flex flex-col items-center justify-center my-4">
                <div className="p-1 rounded-2xl bg-gradient-to-br from-blue-500/30 via-white/10 to-orange-500/30 shadow-2xl">
                  <div className="bg-[#0f1017] rounded-xl p-4 flex flex-col items-center border border-white/5">
                    {/* Badge inside QR card */}
                    <div className="mb-3 px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300">
                      <Sparkles className="w-3 h-3 text-blue-400" />
                      <span>Any UPI App Accepted</span>
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

                {/* Mobile Direct Pay Buttons */}
                <div className="w-full max-w-sm mt-5 space-y-2">
                  <a
                    href={order.upiDeepLink}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl btn-fire text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                  >
                    <Smartphone className="w-4 h-4" />
                    Pay via UPI App (Mobile)
                  </a>

                  <button
                    onClick={handleCopyDeepLink}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/5 transition-colors"
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

              {/* Waiting for verification indicator OR Late Match Transition */}
              <div className="mt-5 pt-5 border-t border-white/5">
                {!isTimerExpired ? (
                  /* Visual rotating circular spinner (Razorpay / Stripe checkout style) */
                  <div className="flex flex-col items-center justify-center py-2 text-center">
                    {/* Continuous rotating dual-gradient SVG ring */}
                    <div className="relative w-12 h-12 mb-3 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/20 to-orange-500/20 blur-md animate-pulse" />
                      <svg className="w-12 h-12 -rotate-90 animate-spin" viewBox="0 0 48 48">
                        <circle
                          cx="24"
                          cy="24"
                          r="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          className="text-white/10"
                        />
                        <circle
                          cx="24"
                          cy="24"
                          r="18"
                          fill="none"
                          stroke="url(#verify-spinner-gradient)"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeDasharray="113"
                          strokeDashoffset="75"
                        />
                        <defs>
                          <linearGradient id="verify-spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#f97316" />
                          </linearGradient>
                        </defs>
                      </svg>
                      {/* Central pulsing core dot */}
                      <div className="absolute w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                      <div className="absolute w-2 h-2 rounded-full bg-blue-500" />
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
                ) : (
                  /* Requirement 5: Timer Expired / Late Match State */
                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/25 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-orange-300 mb-1">
                          Payment Taking Longer Than Usual
                        </h4>
                        <p className="text-xs text-orange-200/90 leading-relaxed">
                          Taking a bit longer than usual. If you&apos;ve already paid, please don&apos;t pay again — it will be verified automatically. If it doesn&apos;t reflect within 15 minutes, contact support with your UTR.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-orange-500/15 text-xs text-orange-400 font-medium">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                      </span>
                      <span>Still verifying your transfer in the background...</span>
                    </div>
                  </div>
                )}
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
                      min="1"
                      step="1"
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
                  disabled={loading || !inputAmount || parseFloat(inputAmount) <= 0}
                  className="w-full py-3.5 px-6 rounded-xl btn-fire text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
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
