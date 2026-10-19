/**
 * Deposit Countdown Timer & Grace Period Evaluation Utilities
 * 
 * Provides pure, deterministic calculation functions based on absolute timestamps.
 * Eliminates interval drift / background tab throttling issues.
 */

/**
 * Computes remaining milliseconds until expiry, clamped at 0.
 * Pure function based strictly on absolute timestamps.
 */
export function computeRemainingMs(
  targetExpiry: Date | string | number | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!targetExpiry) return 0;
  const expiryMs = typeof targetExpiry === 'number'
    ? targetExpiry
    : new Date(targetExpiry).getTime();
  
  if (isNaN(expiryMs)) return 0;
  return Math.max(0, expiryMs - nowMs);
}

/**
 * Computes remaining seconds until expiry, clamped at 0.
 */
export function computeRemainingSeconds(
  targetExpiry: Date | string | number | null | undefined,
  nowMs: number = Date.now()
): number {
  return Math.floor(computeRemainingMs(targetExpiry, nowMs) / 1000);
}

/**
 * Formats remaining seconds as MM:SS string (e.g. 300 -> "05:00", 18 -> "00:18").
 */
export function formatCountdown(remainingSeconds: number): string {
  const clamped = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Checks whether the timer has expired (remaining <= 0).
 */
export function isTimerExpired(
  targetExpiry: Date | string | number | null | undefined,
  nowMs: number = Date.now()
): boolean {
  return computeRemainingMs(targetExpiry, nowMs) <= 0;
}

export type DepositPhase = 'ACTIVE_TIMER' | 'GRACE_PERIOD' | 'EXPIRED';

export interface LateMatchEligibilityResult {
  eligible: boolean;
  phase: DepositPhase;
  remainingTimerMs: number;
  remainingGraceMs: number;
}

/**
 * Determines whether a deposit order is matchable, distinguishing:
 * - ACTIVE_TIMER: Within the initial 5-minute UI countdown
 * - GRACE_PERIOD: Within the 15-minute grace period after timerExpiresAt (late-match active)
 * - EXPIRED: After the 15-minute grace period has passed (cannot match)
 */
export function evaluateDepositEligibility(params: {
  status: string;
  timerExpiresAt: Date | string | number;
  graceExpiresAt: Date | string | number;
  nowMs?: number;
}): LateMatchEligibilityResult {
  const now = params.nowMs ?? Date.now();
  const timerMs = new Date(params.timerExpiresAt).getTime();
  const graceMs = new Date(params.graceExpiresAt).getTime();

  const remainingTimerMs = Math.max(0, timerMs - now);
  const remainingGraceMs = Math.max(0, graceMs - now);

  // If already COMPLETED or CANCELLED, not eligible for matching
  if (params.status === 'COMPLETED' || params.status === 'CANCELLED') {
    return {
      eligible: false,
      phase: 'EXPIRED',
      remainingTimerMs,
      remainingGraceMs,
    };
  }

  if (now <= timerMs) {
    return {
      eligible: true,
      phase: 'ACTIVE_TIMER',
      remainingTimerMs,
      remainingGraceMs,
    };
  }

  if (now <= graceMs) {
    // Within 15-minute grace period after timerExpiresAt
    return {
      eligible: true,
      phase: 'GRACE_PERIOD',
      remainingTimerMs: 0,
      remainingGraceMs,
    };
  }

  return {
    eligible: false,
    phase: 'EXPIRED',
    remainingTimerMs: 0,
    remainingGraceMs: 0,
  };
}

/**
 * Evaluates whether a deposit order qualifies as an "active deposit" to resume.
 * Criteria:
 * 1. Must be PENDING (not COMPLETED, CANCELLED, AWAITING_LATE_MATCH, or EXPIRED)
 * 2. Must be strictly within the 5-minute payment window (now < timerExpiresAt)
 */
export function isDepositActive(params: {
  status: string;
  timerExpiresAt: Date | string | number;
  nowMs?: number;
}): boolean {
  const now = params.nowMs ?? Date.now();
  const timerMs = new Date(params.timerExpiresAt).getTime();

  if (params.status !== 'PENDING') {
    return false;
  }

  return now < timerMs;
}
