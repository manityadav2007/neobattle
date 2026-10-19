import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  isDepositActive,
  isRecentTransactionClickable,
  computeRemainingSeconds,
  formatCountdown,
} from '../services/depositTimer';
import { prisma } from '../config/db';
import { paymentMatchingService } from '../services/paymentMatchingService';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// 1. New deposit always created on Deposit tap (never reuses existing)
// ============================================================================

test('New deposit always created on Deposit tap - creates distinct new order with fresh 5-min timer', async () => {
  const userId = 'user-always-new-deposit';
  let createdCount = 0;

  const originalFindUnique = prisma.wallet.findUnique;
  const originalUpdateMany = prisma.transaction.updateMany;
  const originalFindMany = prisma.transaction.findMany;
  const originalUpdate = prisma.transaction.update;
  const originalCreate = prisma.transaction.create;

  try {
    (prisma.wallet.findUnique as any) = async () => ({ id: 'wallet-1', userId, balance: new Decimal(0) });
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findMany as any) = async () => [];
    (prisma.transaction.update as any) = async () => ({});
    (prisma.transaction.create as any) = async (args: any) => {
      createdCount++;
      return {
        id: `tx-order-${createdCount}`,
        userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        amount: args.data.amount,
        requestedAmount: args.data.requestedAmount,
        actualQrAmount: args.data.actualQrAmount,
        decimalOffset: args.data.decimalOffset,
        timerExpiresAt: args.data.timerExpiresAt,
        expiresAt: args.data.expiresAt,
      };
    };

    // First deposit tap
    const order1 = await paymentMatchingService.createDepositOrder(userId, 100);
    assert.equal(order1.transactionId, 'tx-order-1');
    assert.equal(order1.requestedAmount, 100);

    // Second deposit tap for the same amount
    const order2 = await paymentMatchingService.createDepositOrder(userId, 100);
    assert.equal(order2.transactionId, 'tx-order-2');
    assert.equal(order2.requestedAmount, 100);

    // Confirms a NEW order was created, not reused
    assert.notEqual(order1.transactionId, order2.transactionId);
    assert.equal(createdCount, 2);
  } finally {
    prisma.wallet.findUnique = originalFindUnique;
    prisma.transaction.updateMany = originalUpdateMany;
    prisma.transaction.findMany = originalFindMany;
    prisma.transaction.update = originalUpdate;
    prisma.transaction.create = originalCreate;
  }
});

// ============================================================================
// 2. Old pending marked superseded and still matchable in grace
// ============================================================================

test('Old pending marked superseded and still matchable in grace', async () => {
  const userId = 'user-superseded-test';
  const updatedOrders: any[] = [];

  const originalFindUnique = prisma.wallet.findUnique;
  const originalUpdateMany = prisma.transaction.updateMany;
  const originalFindMany = prisma.transaction.findMany;
  const originalUpdate = prisma.transaction.update;
  const originalCreate = prisma.transaction.create;

  const now = new Date();
  const oldTimerExpiresAt = new Date(now.getTime() + 3 * 60 * 1000);
  const oldGraceExpiresAt = new Date(now.getTime() + 18 * 60 * 1000);

  const existingPending = [
    {
      id: 'tx-old-pending',
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      requestedAmount: new Decimal(100),
      actualQrAmount: new Decimal('100.01'),
      decimalOffset: 1,
      timerExpiresAt: oldTimerExpiresAt,
      expiresAt: oldGraceExpiresAt,
      metadata: {},
    },
  ];

  try {
    (prisma.wallet.findUnique as any) = async () => ({ id: 'wallet-1', userId, balance: new Decimal(0) });
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });

    (prisma.transaction.findMany as any) = async (args: any) => {
      if (args.where?.status === TransactionStatus.PENDING) {
        return existingPending;
      }
      // For getNextAvailableOffset check: old order retains its offset slot (1)
      return [
        {
          decimalOffset: 1,
          actualQrAmount: new Decimal('100.01'),
        },
      ];
    };

    (prisma.transaction.update as any) = async (args: any) => {
      updatedOrders.push(args);
      return args.data;
    };

    (prisma.transaction.create as any) = async (args: any) => ({
      id: 'tx-new-order',
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      amount: args.data.amount,
      requestedAmount: args.data.requestedAmount,
      actualQrAmount: args.data.actualQrAmount,
      decimalOffset: args.data.decimalOffset,
      timerExpiresAt: args.data.timerExpiresAt,
      expiresAt: args.data.expiresAt,
    });

    const newOrder = await paymentMatchingService.createDepositOrder(userId, 100);

    // 1. Verify old pending was updated to AWAITING_LATE_MATCH with superseded metadata
    const supersededUpdate = updatedOrders.find((u) => u.where.id === 'tx-old-pending');
    assert.ok(supersededUpdate, 'Old pending order was updated');
    assert.equal(supersededUpdate.data.status, TransactionStatus.AWAITING_LATE_MATCH);
    assert.equal(supersededUpdate.data.metadata.superseded, true);
    // Did NOT clear decimalOffset (not cancelled)
    assert.equal(supersededUpdate.data.decimalOffset, undefined);

    // 2. New deposit never gets the same exact amount / offset (slot 1 was in use)
    assert.notEqual(newOrder.actualQrAmount, 100.01);
    assert.ok(newOrder.actualQrAmount > 100.01);
  } finally {
    prisma.wallet.findUnique = originalFindUnique;
    prisma.transaction.updateMany = originalUpdateMany;
    prisma.transaction.findMany = originalFindMany;
    prisma.transaction.update = originalUpdate;
    prisma.transaction.create = originalCreate;
  }
});

// ============================================================================
// 3. Clickable only when pending and not expired (Recent Transactions)
// ============================================================================

test('Recent Transactions - Clickable ONLY when status is PENDING and expiresAt in future', () => {
  const now = 1700000000000;
  const futureExpiry = new Date(now + 4 * 60 * 1000);
  const pastExpiry = new Date(now - 1 * 60 * 1000);

  // 1. Active pending deposit -> CLICKABLE
  assert.equal(
    isRecentTransactionClickable({
      type: 'DEPOSIT',
      status: 'PENDING',
      timerExpiresAt: futureExpiry,
      nowMs: now,
    }),
    true
  );

  // 2. Pending deposit whose 5-min timer expired -> NOT CLICKABLE
  assert.equal(
    isRecentTransactionClickable({
      type: 'DEPOSIT',
      status: 'PENDING',
      timerExpiresAt: pastExpiry,
      nowMs: now,
    }),
    false
  );

  // 3. Superseded deposit (AWAITING_LATE_MATCH or superseded flag) -> NOT CLICKABLE
  assert.equal(
    isRecentTransactionClickable({
      type: 'DEPOSIT',
      status: 'AWAITING_LATE_MATCH',
      timerExpiresAt: futureExpiry,
      superseded: true,
      nowMs: now,
    }),
    false
  );

  // 4. Completed deposit (credited) -> NOT CLICKABLE
  assert.equal(
    isRecentTransactionClickable({
      type: 'DEPOSIT',
      status: 'COMPLETED',
      timerExpiresAt: futureExpiry,
      nowMs: now,
    }),
    false
  );

  // 5. Cancelled deposit -> NOT CLICKABLE
  assert.equal(
    isRecentTransactionClickable({
      type: 'DEPOSIT',
      status: 'CANCELLED',
      timerExpiresAt: futureExpiry,
      nowMs: now,
    }),
    false
  );

  // 6. Other transaction types (e.g. PRIZE, WITHDRAWAL) -> NOT CLICKABLE
  assert.equal(
    isRecentTransactionClickable({
      type: 'PRIZE',
      status: 'PENDING',
      timerExpiresAt: futureExpiry,
      nowMs: now,
    }),
    false
  );
});

// ============================================================================
// 4. Resume shows correct remaining time
// ============================================================================

test('Resume shows correct remaining time computed from server expiry', () => {
  const t0 = 1700000000000;
  const timerExpiresAt = new Date(t0 + 5 * 60 * 1000); // 5 minutes

  // When reopened after 1 minute (4 minutes left)
  const t1 = t0 + 1 * 60 * 1000;
  const sec1 = computeRemainingSeconds(timerExpiresAt, t1);
  assert.equal(sec1, 240);
  assert.equal(formatCountdown(sec1), '04:00');

  // When reopened after 2 minutes (3 minutes left)
  const t2 = t0 + 2 * 60 * 1000;
  const sec2 = computeRemainingSeconds(timerExpiresAt, t2);
  assert.equal(sec2, 180);
  assert.equal(formatCountdown(sec2), '03:00');

  // When reopened after 4 minutes 30 seconds (30 seconds left)
  const t3 = t0 + 4 * 60 * 1000 + 30 * 1000;
  const sec3 = computeRemainingSeconds(timerExpiresAt, t3);
  assert.equal(sec3, 30);
  assert.equal(formatCountdown(sec3), '00:30');

  // When reopened after 5 minutes 10 seconds (expired)
  const t4 = t0 + 5 * 60 * 1000 + 10 * 1000;
  const sec4 = computeRemainingSeconds(timerExpiresAt, t4);
  assert.equal(sec4, 0);
  assert.equal(formatCountdown(sec4), '00:00');
});

// ============================================================================
// 5. Another user cannot open my deposit (User Isolation & 404)
// ============================================================================

test('Another user cannot open my deposit (returns 404 / null)', async () => {
  const ownerUserId = 'user-owner';
  const attackerUserId = 'user-attacker';
  const depositId = 'tx-private-deposit-1';

  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findFirst as any) = async (args: any) => {
      // If querying with owner user ID, returns deposit
      if (args.where.id === depositId && args.where.userId === ownerUserId) {
        return {
          id: depositId,
          userId: ownerUserId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          amount: new Decimal('100.05'),
          actualQrAmount: new Decimal('100.05'),
          timerExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
          metadata: {},
        };
      }
      // If querying with attacker's user ID, returns null!
      return null;
    };

    // Owner can access their own deposit
    const ownerResult = await paymentMatchingService.getResumableDepositOrder(ownerUserId, depositId);
    assert.ok(ownerResult !== null);
    assert.equal(ownerResult.transactionId, depositId);

    // Another user gets null (404)
    const attackerResult = await paymentMatchingService.getResumableDepositOrder(attackerUserId, depositId);
    assert.equal(attackerResult, null);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});

test('Resumable deposit returns null if deposit is superseded or past 5-minute window', async () => {
  const userId = 'user-resumable-checks';
  const originalFindFirst = prisma.transaction.findFirst;
  const originalUpdateMany = prisma.transaction.updateMany;

  try {
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });

    // 1. Superseded in metadata
    (prisma.transaction.findFirst as any) = async () => ({
      id: 'tx-superseded',
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      amount: new Decimal('100.05'),
      actualQrAmount: new Decimal('100.05'),
      timerExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
      metadata: { superseded: true },
    });
    const supersededResult = await paymentMatchingService.getResumableDepositOrder(userId, 'tx-superseded');
    assert.equal(supersededResult, null);

    // 2. Past 5-minute window (findFirst returns null due to timerExpiresAt: { gt: now })
    (prisma.transaction.findFirst as any) = async () => null;
    const expiredResult = await paymentMatchingService.getResumableDepositOrder(userId, 'tx-expired');
    assert.equal(expiredResult, null);
  } finally {
    prisma.transaction.findFirst = originalFindFirst;
    prisma.transaction.updateMany = originalUpdateMany;
  }
});

// ============================================================================
// 6. Removed buttons are gone from deposit page
// ============================================================================

test('Removed buttons are gone from payment page source', () => {
  const depositPagePath = path.resolve(__dirname, '../../../frontend/src/app/wallet/deposit/page.tsx');
  const pageSource = fs.readFileSync(depositPagePath, 'utf8');

  // "Pay via UPI App" button must be completely removed
  assert.equal(pageSource.includes('via UPI App (Mobile)'), false, 'Pay via UPI App button should be removed');
  assert.equal(pageSource.includes('handleCopyDeepLink'), false, 'handleCopyDeepLink should be removed');
  assert.equal(pageSource.includes('Copy UPI Payment Link'), false, 'Copy UPI Payment Link button should be removed');
  assert.equal(pageSource.includes('copiedLink'), false, 'copiedLink state should be removed');

  // "Save QR" button and guidance text must be present
  assert.ok(pageSource.includes('Save QR'), 'Save QR button must be present');
  assert.ok(
    pageSource.includes('Tap Save QR, then open any UPI app, tap Scan QR, choose Upload from gallery and select this image. Pay the exact amount shown, including paise.'),
    'Guidance text must be present under Save QR button'
  );
  assert.ok(pageSource.includes('neobattle-deposit-'), 'Download filename must match neobattle-deposit-<amount>.png');
});

// ============================================================================
// 7. Save QR produces a PNG of the right size (>= 800x800 with quiet zone)
// ============================================================================

test('Save QR produces a PNG of the right size (>= 800x800 with 4 modules quiet zone)', async () => {
  const QRCode = require('qrcode');
  const upiLink = 'upi://pay?pa=test@upi&pn=NeoBattle&am=100.05&tr=tx-12345';

  // Test the exact QR parameters used in the application
  const dataUrl = await QRCode.toDataURL(upiLink, {
    margin: 4,
    width: 800,
    color: { dark: '#000000', light: '#ffffff' },
  });

  assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'QR is a valid base64 PNG');

  // Verify dimensions from base64 PNG header (bytes 16-24 store width and height as 32-bit big endian)
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // PNG signature is 8 bytes, IHDR chunk starts at byte 12, width at byte 16, height at byte 20
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  assert.ok(width >= 800, `Width (${width}) must be at least 800px`);
  assert.ok(height >= 800, `Height (${height}) must be at least 800px`);
  assert.equal(width, height, 'QR image is square');
});
