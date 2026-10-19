import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRemainingMs,
  computeRemainingSeconds,
  formatCountdown,
  isTimerExpired,
  evaluateDepositEligibility,
} from '../services/depositTimer';

// ============================================================================
// 1. Absolute Expiry Timer Calculation Tests
// ============================================================================

test('Timer Calculation - Initial 5-minute countdown precision', () => {
  const now = 1700000000000;
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300,000 ms
  const expiresAt = new Date(now + FIVE_MINUTES_MS);

  // At start
  const remainingMs = computeRemainingMs(expiresAt, now);
  const remainingSec = computeRemainingSeconds(expiresAt, now);
  const formatted = formatCountdown(remainingSec);

  assert.equal(remainingMs, 300000);
  assert.equal(remainingSec, 300);
  assert.equal(formatted, '05:00');
  assert.equal(isTimerExpired(expiresAt, now), false);
});

test('Timer Calculation - Progression after 2 minutes (180 seconds remaining)', () => {
  const now = 1700000000000;
  const expiresAt = new Date(now + 5 * 60 * 1000);

  // Advance clock by 2 minutes (120 seconds)
  const current = now + 2 * 60 * 1000;
  const remainingMs = computeRemainingMs(expiresAt, current);
  const remainingSec = computeRemainingSeconds(expiresAt, current);
  const formatted = formatCountdown(remainingSec);

  assert.equal(remainingMs, 180000);
  assert.equal(remainingSec, 180);
  assert.equal(formatted, '03:00');
  assert.equal(isTimerExpired(expiresAt, current), false);
});

test('Timer Calculation - Clamping at 0 when expired', () => {
  const now = 1700000000000;
  const expiresAt = new Date(now + 5 * 60 * 1000);

  // Advance clock exactly to expiry
  const currentAtExpiry = now + 5 * 60 * 1000;
  assert.equal(computeRemainingMs(expiresAt, currentAtExpiry), 0);
  assert.equal(computeRemainingSeconds(expiresAt, currentAtExpiry), 0);
  assert.equal(formatCountdown(0), '00:00');
  assert.equal(isTimerExpired(expiresAt, currentAtExpiry), true);

  // Advance clock 30 seconds past expiry
  const currentPastExpiry = currentAtExpiry + 30 * 1000;
  assert.equal(computeRemainingMs(expiresAt, currentPastExpiry), 0);
  assert.equal(computeRemainingSeconds(expiresAt, currentPastExpiry), 0);
  assert.equal(isTimerExpired(expiresAt, currentPastExpiry), true);
});

test('Timer Calculation - Simulated 10-minute background gap (mobile throttle)', () => {
  // Scenario from user prompt:
  // Browser tab in mobile background pauses/throttles timers.
  // With setInterval counter, a 5-min timer was still showing 00:18 after 10 minutes.
  // With absolute timestamp calculation, upon visibilitychange/focus/pageshow:
  const orderCreatedAt = 1700000000000;
  const timerExpiresAt = new Date(orderCreatedAt + 5 * 60 * 1000); // 5 minutes

  // User puts phone in pocket / switches tab for 10 minutes
  const backgroundResumeTime = orderCreatedAt + 10 * 60 * 1000; // 10 minutes elapsed

  const remainingMs = computeRemainingMs(timerExpiresAt, backgroundResumeTime);
  const remainingSec = computeRemainingSeconds(timerExpiresAt, backgroundResumeTime);
  const expired = isTimerExpired(timerExpiresAt, backgroundResumeTime);

  // Must NOT show 00:18 or any non-zero countdown
  assert.equal(remainingMs, 0);
  assert.equal(remainingSec, 0);
  assert.equal(formatCountdown(remainingSec), '00:00');
  assert.equal(expired, true);
});

test('Timer Calculation - Simulated 2-minute tab switch returns correct remaining time', () => {
  const orderCreatedAt = 1700000000000;
  const timerExpiresAt = new Date(orderCreatedAt + 5 * 60 * 1000); // 5 minutes (300s)

  // User leaves tab at t = 1 min and returns at t = 3 mins (2 minutes background gap)
  const tabReopenTime = orderCreatedAt + 3 * 60 * 1000;

  const remainingMs = computeRemainingMs(timerExpiresAt, tabReopenTime);
  const remainingSec = computeRemainingSeconds(timerExpiresAt, tabReopenTime);

  // 300s - 180s = 120s (02:00) exactly
  assert.equal(remainingMs, 120000);
  assert.equal(remainingSec, 120);
  assert.equal(formatCountdown(remainingSec), '02:00');
  assert.equal(isTimerExpired(timerExpiresAt, tabReopenTime), false);
});

// ============================================================================
// 2. Late Payment Matching & 15-Minute Grace Period Tests
// ============================================================================

test('Grace Period - Payment arrives during initial 5-minute UI countdown', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000);

  // Payment notification arrives at t = 2 mins
  const paymentTime = t0 + 2 * 60 * 1000;

  const result = evaluateDepositEligibility({
    status: 'PENDING',
    timerExpiresAt,
    graceExpiresAt,
    nowMs: paymentTime,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.phase, 'ACTIVE_TIMER');
  assert.equal(result.remainingTimerMs, 3 * 60 * 1000);
  assert.equal(result.remainingGraceMs, 18 * 60 * 1000);
});

test('Grace Period - Late payment arrives 5 minutes after UI timer expiry (within 15-min grace period)', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000); // Expires at t0 + 5m
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000); // Grace cutoff at t0 + 20m

  // Payment notification arrives at t0 + 10 mins (5 mins after timerExpiresAt)
  const paymentTime = t0 + 10 * 60 * 1000;

  const result = evaluateDepositEligibility({
    status: 'AWAITING_LATE_MATCH',
    timerExpiresAt,
    graceExpiresAt,
    nowMs: paymentTime,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.phase, 'GRACE_PERIOD');
  assert.equal(result.remainingTimerMs, 0); // UI timer has expired
  assert.equal(result.remainingGraceMs, 10 * 60 * 1000); // 10 mins of grace period remaining
});

test('Grace Period - Late payment arrives 14 minutes after UI timer expiry (last minute of grace period)', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000); // t0 + 20m

  // Payment arrives at t0 + 19 mins
  const paymentTime = t0 + 19 * 60 * 1000;

  const result = evaluateDepositEligibility({
    status: 'AWAITING_LATE_MATCH',
    timerExpiresAt,
    graceExpiresAt,
    nowMs: paymentTime,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.phase, 'GRACE_PERIOD');
  assert.equal(result.remainingGraceMs, 1 * 60 * 1000);
});

test('Grace Period - Payment arrives AFTER the 15-minute grace period has ended (cannot match)', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000); // t0 + 20m

  // Payment arrives at t0 + 21 mins (grace period expired)
  const paymentTime = t0 + 21 * 60 * 1000;

  const result = evaluateDepositEligibility({
    status: 'AWAITING_LATE_MATCH',
    timerExpiresAt,
    graceExpiresAt,
    nowMs: paymentTime,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.phase, 'EXPIRED');
  assert.equal(result.remainingTimerMs, 0);
  assert.equal(result.remainingGraceMs, 0);
});

test('Grace Period - Single credit idempotency: COMPLETED orders cannot match again', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000);

  // Even if within grace window, already COMPLETED transaction is not eligible
  const result = evaluateDepositEligibility({
    status: 'COMPLETED',
    timerExpiresAt,
    graceExpiresAt,
    nowMs: t0 + 8 * 60 * 1000,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.phase, 'EXPIRED');
});

test('Grace Period - Cancelled orders cannot be matched', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000);

  const result = evaluateDepositEligibility({
    status: 'CANCELLED',
    timerExpiresAt,
    graceExpiresAt,
    nowMs: t0 + 2 * 60 * 1000,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.phase, 'EXPIRED');
});
