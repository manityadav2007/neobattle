import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../config/db';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionType, TransactionStatus, UserRole } from '@prisma/client';
import * as depositController from '../controllers/deposit.controller';
import { privateStorageService } from '../services/privateStorage.service';
import { paymentMatchingService } from '../services/paymentMatchingService';
import { notificationService } from '../services/notification.service';
import sharp from 'sharp';

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    data: null,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.data = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    send(body: any) {
      this.data = body;
      return this;
    },
  };
  return res;
}

// Helper to create a valid 1x1 test PNG buffer
async function createValidTestPngBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// Helper to create a valid 1x1 test JPEG buffer
async function createValidTestJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 0, g: 255, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
}

// Helper to create a valid 1x1 test WebP buffer
async function createValidTestWebpBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: { r: 0, g: 0, b: 255, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();
}

// ============================================================================
// 1. File Validation & Magic Bytes Tests
// ============================================================================

test('File Validation - rejects invalid magic bytes disguised as image', () => {
  const fakePng = Buffer.from('FAKE-IMAGE-HEADER-NOT-A-PNG-OR-JPG');
  const result = privateStorageService.validateImageMagicBytes(fakePng);
  assert.equal(result.valid, false);
  assert.match(result.error || '', /Invalid file format/i);
});

test('File Validation - accepts valid PNG, JPEG, and WebP magic bytes and strips EXIF', async () => {
  const pngBuf = await createValidTestPngBuffer();
  const pngCheck = privateStorageService.validateImageMagicBytes(pngBuf);
  assert.equal(pngCheck.valid, true);
  assert.equal(pngCheck.format, 'png');

  const sanitizedPng = await privateStorageService.stripExifAndSanitize(pngBuf);
  assert.equal(sanitizedPng.format, 'png');
  assert.ok(sanitizedPng.buffer.length > 0);

  const jpegBuf = await createValidTestJpegBuffer();
  const jpegCheck = privateStorageService.validateImageMagicBytes(jpegBuf);
  assert.equal(jpegCheck.valid, true);
  assert.equal(jpegCheck.format, 'jpeg');

  const webpBuf = await createValidTestWebpBuffer();
  const webpCheck = privateStorageService.validateImageMagicBytes(webpBuf);
  assert.equal(webpCheck.valid, true);
  assert.equal(webpCheck.format, 'webp');
});

// ============================================================================
// 2. Duplicate UTR Tests
// ============================================================================

test('Deposit Claim - rejects duplicate UTR already in another claim', async () => {
  const userId = 'user-claim-dup-utr';
  const pngBuf = await createValidTestPngBuffer();

  const originalCount = prisma.depositRequest.count;
  const originalTxFindUnique = prisma.transaction.findUnique;
  const originalClaimFindFirst = prisma.depositRequest.findFirst;

  try {
    (prisma.depositRequest.count as any) = async () => 0;
    (prisma.transaction.findUnique as any) = async () => ({
      id: 'tx-expired-1',
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.AWAITING_LATE_MATCH,
      amount: new Decimal(100),
      actualQrAmount: new Decimal(100.05),
      requestedAmount: new Decimal(100),
      timerExpiresAt: new Date(Date.now() - 60000),
    });

    // Mock finding existing claim with same UTR
    (prisma.depositRequest.findFirst as any) = async (args: any) => {
      if (args?.where?.utrNumber === '123456789012') {
        return { id: 'claim-existing', utrNumber: '123456789012' };
      }
      return null;
    };

    const req: any = {
      user: { id: userId, role: UserRole.PLAYER },
      body: {
        depositTransactionId: 'tx-expired-1',
        utrNumber: '123456789012',
      },
      file: {
        buffer: pngBuf,
        size: pngBuf.length,
      },
    };
    const res = createMockResponse();

    await depositController.submitDepositClaim(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /already been submitted in another claim/i);
  } finally {
    prisma.depositRequest.count = originalCount;
    prisma.transaction.findUnique = originalTxFindUnique;
    prisma.depositRequest.findFirst = originalClaimFindFirst;
  }
});

test('Deposit Claim - rejects duplicate UTR already credited in a completed transaction', async () => {
  const userId = 'user-claim-dup-utr-credited';
  const pngBuf = await createValidTestPngBuffer();

  const originalCount = prisma.depositRequest.count;
  const originalTxFindUnique = prisma.transaction.findUnique;
  const originalClaimFindFirst = prisma.depositRequest.findFirst;
  const originalTxFindFirst = prisma.transaction.findFirst;

  try {
    (prisma.depositRequest.count as any) = async () => 0;
    (prisma.transaction.findUnique as any) = async () => ({
      id: 'tx-expired-2',
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.AWAITING_LATE_MATCH,
      amount: new Decimal(200),
      actualQrAmount: new Decimal(200.08),
      requestedAmount: new Decimal(200),
      timerExpiresAt: new Date(Date.now() - 60000),
    });

    (prisma.depositRequest.findFirst as any) = async () => null;

    // Mock transaction matching UTR reference
    (prisma.transaction.findFirst as any) = async (args: any) => {
      return { id: 'tx-completed-earlier', status: TransactionStatus.COMPLETED, reference: '999888777666' };
    };

    const req: any = {
      user: { id: userId, role: UserRole.PLAYER },
      body: {
        depositTransactionId: 'tx-expired-2',
        utrNumber: '999888777666',
      },
      file: {
        buffer: pngBuf,
        size: pngBuf.length,
      },
    };
    const res = createMockResponse();

    await depositController.submitDepositClaim(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /already been matched and credited/i);
  } finally {
    prisma.depositRequest.count = originalCount;
    prisma.transaction.findUnique = originalTxFindUnique;
    prisma.depositRequest.findFirst = originalClaimFindFirst;
    prisma.transaction.findFirst = originalTxFindFirst;
  }
});

// ============================================================================
// 3. Rate Limit & Repeated Rejection Block Tests
// ============================================================================

test('Deposit Claim - rate limit rejects user exceeding 3 claims per 24 hours', async () => {
  const userId = 'user-rate-limited';
  const originalCount = prisma.depositRequest.count;

  try {
    // 3 claims already submitted in last 24h
    (prisma.depositRequest.count as any) = async (args: any) => {
      if (args?.where?.createdAt) return 3;
      return 0;
    };

    const req: any = {
      user: { id: userId, role: UserRole.PLAYER },
      body: {
        depositTransactionId: 'tx-any',
        utrNumber: '111222333444',
      },
    };
    const res = createMockResponse();

    await depositController.submitDepositClaim(req, res);
    assert.equal(res.statusCode, 429);
    assert.match(res.data.message, /Daily claim limit reached/i);
  } finally {
    prisma.depositRequest.count = originalCount;
  }
});

test('Deposit Claim - blocks users with repeated rejected claims (>= 3 rejected)', async () => {
  const userId = 'user-blocked-rejections';
  const originalCount = prisma.depositRequest.count;

  try {
    (prisma.depositRequest.count as any) = async (args: any) => {
      if (args?.where?.status === 'REJECTED') return 3;
      return 0;
    };

    const req: any = {
      user: { id: userId, role: UserRole.PLAYER },
      body: {
        depositTransactionId: 'tx-any',
        utrNumber: '111222333444',
      },
    };
    const res = createMockResponse();

    await depositController.submitDepositClaim(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.data.message, /restricted from submitting deposit claims due to multiple rejected claims/i);
  } finally {
    prisma.depositRequest.count = originalCount;
  }
});

// ============================================================================
// 4. Double Credit Prevention Tests
// ============================================================================

test('Double Credit - admin cannot approve claim if transaction was already completed', async () => {
  const adminId = 'admin-user-1';
  const originalTransaction = prisma.$transaction;

  try {
    (prisma.$transaction as any) = async (cb: any) => {
      const txMock = {
        depositRequest: {
          findUnique: async () => ({
            id: 'claim-double-credit',
            userId: 'user-1',
            status: 'PENDING',
            depositTransactionId: 'tx-already-done',
            amount: new Decimal(100),
            baseAmount: new Decimal(100),
          }),
        },
        transaction: {
          findUnique: async () => ({
            id: 'tx-already-done',
            status: TransactionStatus.COMPLETED, // Already completed!
          }),
        },
      };
      return cb(txMock);
    };

    const req: any = {
      user: { id: adminId, role: UserRole.ADMIN },
      params: { id: 'claim-double-credit' },
      body: { status: 'APPROVED' },
    };
    const res = createMockResponse();

    await depositController.reviewDepositRequest(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /already completed and credited/i);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test('Double Credit - admin cannot approve claim that is already APPROVED or AUTO_RESOLVED', async () => {
  const adminId = 'admin-user-2';
  const originalTransaction = prisma.$transaction;

  try {
    (prisma.$transaction as any) = async (cb: any) => {
      const txMock = {
        depositRequest: {
          findUnique: async () => ({
            id: 'claim-already-approved',
            userId: 'user-1',
            status: 'AUTO_RESOLVED', // Already resolved
            amount: new Decimal(100),
          }),
        },
      };
      return cb(txMock);
    };

    const req: any = {
      user: { id: adminId, role: UserRole.ADMIN },
      params: { id: 'claim-already-approved' },
      body: { status: 'APPROVED' },
    };
    const res = createMockResponse();

    await depositController.reviewDepositRequest(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /already auto_resolved/i);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

// ============================================================================
// 5. Auto-Resolve on Late SMS Match Tests
// ============================================================================

test('Auto-Resolve - incoming SMS match marks pending claim as AUTO_RESOLVED and credits once', async () => {
  const userId = 'user-auto-resolve';
  const originalFindMany = prisma.transaction.findMany;
  const originalTransaction = prisma.$transaction;
  const originalNotifySend = notificationService.sendToUser;

  let walletIncrement = 0;
  let claimUpdatedStatus: string | null = null;
  let txUpdatedStatus: string | null = null;

  try {
    (notificationService.sendToUser as any) = async () => {};
    (prisma.transaction.findMany as any) = async (args: any) => [
      {
        id: 'tx-order-match-1',
        walletId: 'wallet-auto-1',
        userId,
        amount: new Decimal(100),
        requestedAmount: new Decimal(100),
        actualQrAmount: new Decimal(100.05),
        status: TransactionStatus.AWAITING_LATE_MATCH,
        expiresAt: new Date(Date.now() + 600000),
        user: { id: userId, username: 'player_one', email: 'one@test.com' },
      },
    ];

    (prisma.$transaction as any) = async (cb: any) => {
      const txMock = {
        wallet: {
          update: async (args: any) => {
            walletIncrement += Number(args.data.balance.increment);
            return { id: 'wallet-auto-1', balance: new Decimal(walletIncrement) };
          },
        },
        transaction: {
          update: async (args: any) => {
            txUpdatedStatus = args.data.status;
            return { id: args.where.id, ...args.data };
          },
        },
        depositRequest: {
          findFirst: async () => ({
            id: 'claim-for-tx-1',
            depositTransactionId: 'tx-order-match-1',
            status: 'PENDING',
          }),
          update: async (args: any) => {
            claimUpdatedStatus = args.data.status;
            return { id: args.where.id, ...args.data };
          },
        },
      };
      return cb(txMock);
    };

    const result = await paymentMatchingService.processIncomingPayment({
      amount: 100.05,
      isCredit: true,
      rawMessage: '₹100.05 received from Test Sender',
      sender: 'Test Sender',
      utrNumber: '428901234567',
    });

    assert.equal(result.matched, true);
    assert.equal(txUpdatedStatus, TransactionStatus.COMPLETED);
    assert.equal(claimUpdatedStatus, 'AUTO_RESOLVED');
    assert.equal(walletIncrement, 100); // Credited base amount
  } finally {
    prisma.transaction.findMany = originalFindMany;
    prisma.$transaction = originalTransaction;
    notificationService.sendToUser = originalNotifySend;
  }
});

// ============================================================================
// 6. Admin Permissions: Moderator Forbidden
// ============================================================================

test('Permissions - Moderator role is forbidden from reviewing deposit claims', async () => {
  const req: any = {
    user: { id: 'mod-1', role: UserRole.MODERATOR }, // Moderator
    params: { id: 'claim-1' },
    body: { status: 'APPROVED' },
  };
  const res = createMockResponse();

  await depositController.reviewDepositRequest(req, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.data.message, /Admin or Super Admin access required/i);
});

test('Permissions - Moderator role is forbidden from listing pending deposit queue', async () => {
  const req: any = {
    user: { id: 'mod-1', role: UserRole.MODERATOR },
  };
  const res = createMockResponse();

  await depositController.listDepositRequests(req, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.data.message, /Admin or Super Admin access required/i);
});
