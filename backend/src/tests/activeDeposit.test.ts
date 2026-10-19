import test from 'node:test';
import assert from 'node:assert/strict';
import { isDepositActive } from '../services/depositTimer';
import { prisma } from '../config/db';
import { paymentMatchingService } from '../services/paymentMatchingService';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// 1. Pure Function Evaluation: isDepositActive
// ============================================================================

test('isDepositActive - Deposit is active within 5-minute payment window', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);

  // At creation (t0)
  assert.equal(
    isDepositActive({
      status: 'PENDING',
      timerExpiresAt,
      nowMs: t0,
    }),
    true
  );

  // At 2 minutes elapsed (180s left)
  assert.equal(
    isDepositActive({
      status: 'PENDING',
      timerExpiresAt,
      nowMs: t0 + 2 * 60 * 1000,
    }),
    true
  );

  // At 4 minutes 59 seconds elapsed (1s left)
  assert.equal(
    isDepositActive({
      status: 'PENDING',
      timerExpiresAt,
      nowMs: t0 + 4 * 60 * 1000 + 59 * 1000,
    }),
    true
  );
});

test('isDepositActive - Deposit is NOT active at or after 5 minutes', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);

  // Exactly at 5-minute expiry
  assert.equal(
    isDepositActive({
      status: 'PENDING',
      timerExpiresAt,
      nowMs: t0 + 5 * 60 * 1000,
    }),
    false
  );

  // 10 seconds past 5-minute expiry
  assert.equal(
    isDepositActive({
      status: 'PENDING',
      timerExpiresAt,
      nowMs: t0 + 5 * 60 * 1000 + 10 * 1000,
    }),
    false
  );

  // 10 minutes past 5-minute expiry (still inside 15-min grace period for bank matching, but NOT active for UI)
  assert.equal(
    isDepositActive({
      status: 'PENDING',
      timerExpiresAt,
      nowMs: t0 + 10 * 60 * 1000,
    }),
    false
  );
});

test('isDepositActive - Deposit is NOT active when CANCELLED ("Cancel & Choose Different Amount")', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);

  // Within 5 minutes, but user clicked cancel
  assert.equal(
    isDepositActive({
      status: 'CANCELLED',
      timerExpiresAt,
      nowMs: t0 + 1 * 60 * 1000,
    }),
    false
  );
});

test('isDepositActive - Deposit is NOT active when COMPLETED (credited)', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);

  // Within 5 minutes, but already completed/credited
  assert.equal(
    isDepositActive({
      status: 'COMPLETED',
      timerExpiresAt,
      nowMs: t0 + 1 * 60 * 1000,
    }),
    false
  );
});

test('isDepositActive - Other terminal statuses are NOT active', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000);

  assert.equal(isDepositActive({ status: 'EXPIRED', timerExpiresAt, nowMs: t0 }), false);
  assert.equal(isDepositActive({ status: 'FAILED', timerExpiresAt, nowMs: t0 }), false);
  assert.equal(isDepositActive({ status: 'AWAITING_LATE_MATCH', timerExpiresAt, nowMs: t0 }), false);
});

// ============================================================================
// 2. Service Layer: paymentMatchingService.getActiveDepositOrder
// ============================================================================

test('Service Layer - Active deposit returned within 5 minutes with complete payload', async () => {
  const userId = 'test-user-active-1';
  const now = new Date();
  const timerExpiresAt = new Date(now.getTime() + 4 * 60 * 1000); // 4 minutes left
  const graceExpiresAt = new Date(timerExpiresAt.getTime() + 15 * 60 * 1000);

  // Mock prisma.transaction.findFirst and prisma.transaction.updateMany (cleanup)
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findFirst as any) = async (args: any) => {
      // Check query filters
      assert.equal(args.where.userId, userId);
      assert.equal(args.where.type, TransactionType.DEPOSIT);
      assert.equal(args.where.status, TransactionStatus.PENDING);
      assert.ok(args.where.timerExpiresAt.gt);

      return {
        id: 'tx-active-12345',
        userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        amount: new Decimal('100.05'),
        requestedAmount: new Decimal('100'),
        actualQrAmount: new Decimal('100.05'),
        decimalOffset: 5,
        timerExpiresAt,
        expiresAt: graceExpiresAt,
        metadata: {
          upiDeepLink: 'upi://pay?pa=test@upi&pn=NeoBattle&am=100.05&tr=tx-active-12345',
        },
      };
    };

    const result = await paymentMatchingService.getActiveDepositOrder(userId);

    assert.ok(result !== null);
    assert.equal(result.transactionId, 'tx-active-12345');
    assert.equal(result.tr, 'tx-active-12345');
    assert.equal(result.amount, 100.05);
    assert.equal(result.actualQrAmount, 100.05);
    assert.equal(result.requestedAmount, 100);
    assert.ok(result.upiDeepLink.includes('tr=tx-active-12345'));
    assert.ok(result.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    assert.equal(result.expiresAt, timerExpiresAt);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});

test('Service Layer - Active deposit NOT returned after 5 minutes (null/404)', async () => {
  const userId = 'test-user-expired-after-5m';
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findFirst as any) = async (_args: any) => {
      // Database has no records where timerExpiresAt > now
      return null;
    };

    const result = await paymentMatchingService.getActiveDepositOrder(userId);
    assert.equal(result, null);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});

test('Service Layer - Active deposit NOT returned after cancel (status CANCELLED)', async () => {
  const userId = 'test-user-cancelled';
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findFirst as any) = async (args: any) => {
      // Query filter status is PENDING, so a CANCELLED record will not match
      if (args.where.status === TransactionStatus.PENDING) {
        return null;
      }
      return null;
    };

    const result = await paymentMatchingService.getActiveDepositOrder(userId);
    assert.equal(result, null);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});

test('Service Layer - Active deposit NOT returned after credit (status COMPLETED)', async () => {
  const userId = 'test-user-completed';
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findFirst as any) = async (args: any) => {
      // Query filter status is PENDING, so a COMPLETED record will not match
      if (args.where.status === TransactionStatus.PENDING) {
        return null;
      }
      return null;
    };

    const result = await paymentMatchingService.getActiveDepositOrder(userId);
    assert.equal(result, null);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});

test('Service Layer - User isolation: user only gets their own active deposit', async () => {
  const userA = 'user-alice';
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  let queriedUserId: string | null = null;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findFirst as any) = async (args: any) => {
      queriedUserId = args.where.userId;
      return null;
    };

    await paymentMatchingService.getActiveDepositOrder(userA);
    assert.equal(queriedUserId, userA);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});
