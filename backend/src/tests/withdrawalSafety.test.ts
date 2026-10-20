import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { UserRole, TransactionStatus, TransactionType } from '@prisma/client';
import passport from '../config/passport';
import { generateAccessToken } from '../utils/auth.utils';
import { prisma } from '../config/db';
import adminRoutes from '../routes/admin.routes';
import redeemRoutes from '../routes/redeem.routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(passport.initialize());

  app.use('/admin', adminRoutes);
  app.use('/redeem', redeemRoutes);

  return app;
}

const adminUser1 = {
  id: 'usr-admin-test-1',
  role: UserRole.SUPER_ADMIN,
  email: 'admin1@neobattle.live',
  username: 'superAdmin1',
  isActive: true,
  isVerified: true,
};

const adminUser2 = {
  id: 'usr-admin-test-2',
  role: UserRole.SUPER_ADMIN,
  email: 'admin2@neobattle.live',
  username: 'superAdmin2',
  isActive: true,
  isVerified: true,
};

test('Withdrawal Safety - clicking Approve on an already COMPLETED request is refused with 400', async () => {
  const origFindUniqueUser = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === adminUser1.id) return adminUser1;
    return null;
  };

  // Mock $transaction returning already completed error
  (prisma as any).$transaction = async (callback: any) => {
    const mockTxClient = {
      $queryRaw: async () => [{
        id: 'tx_completed_1',
        status: TransactionStatus.COMPLETED,
        type: TransactionType.WITHDRAWAL,
        amount: 10,
        walletId: 'w_1',
        userId: 'u_1',
        reference: '12455218',
        metadata: {},
      }],
      transaction: {
        findUnique: async () => ({
          id: 'tx_completed_1',
          status: TransactionStatus.COMPLETED,
          type: TransactionType.WITHDRAWAL,
          amount: 10,
        }),
      },
    };
    return callback(mockTxClient);
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token = generateAccessToken(adminUser1);

    const res = await fetch(`${baseUrl}/admin/withdrawals/tx_completed_1/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });

    assert.equal(res.status, 400, 'Must refuse review on already completed withdrawal with 400');
    const body: any = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /already been completed/i);
  } finally {
    server.close();
    prisma.user.findUnique = origFindUniqueUser;
    prisma.$transaction = origTransaction;
  }
});

test('Withdrawal Safety - clicking Reject on an already COMPLETED request is refused and does NOT refund', async () => {
  const origFindUniqueUser = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;
  let walletUpdateCalled = false;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === adminUser1.id) return adminUser1;
    return null;
  };

  (prisma as any).$transaction = async (callback: any) => {
    const mockTxClient = {
      $queryRaw: async () => [{
        id: 'tx_completed_2',
        status: TransactionStatus.COMPLETED,
        type: TransactionType.WITHDRAWAL,
        amount: 10,
        walletId: 'w_1',
        userId: 'u_1',
        reference: '12455218',
        metadata: {},
      }],
      wallet: {
        update: async () => {
          walletUpdateCalled = true;
        },
      },
      transaction: {
        findUnique: async () => ({
          id: 'tx_completed_2',
          status: TransactionStatus.COMPLETED,
          type: TransactionType.WITHDRAWAL,
          amount: 10,
        }),
      },
    };
    return callback(mockTxClient);
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token = generateAccessToken(adminUser1);

    const res = await fetch(`${baseUrl}/admin/withdrawals/tx_completed_2/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Fraud' }),
    });

    assert.equal(res.status, 400, 'Must refuse reject on completed withdrawal');
    const body: any = await res.json();
    assert.equal(body.success, false);
    assert.equal(walletUpdateCalled, false, 'Wallet must NEVER be refunded for already completed request');
  } finally {
    server.close();
    prisma.user.findUnique = origFindUniqueUser;
    prisma.$transaction = origTransaction;
  }
});

test('Withdrawal Safety - double-click concurrent approve calls: exactly one succeeds, one fails with 400', async () => {
  const origFindUniqueUser = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === adminUser1.id) return adminUser1;
    return null;
  };

  // State machine simulation with lock
  let currentStatus: TransactionStatus = TransactionStatus.PENDING;
  let updateCount = 0;

  (prisma as any).$transaction = async (callback: any) => {
    // Simulate transactional lock
    const mockTxClient = {
      $queryRaw: async () => [{
        id: 'tx_concurrent_1',
        status: currentStatus,
        type: TransactionType.WITHDRAWAL,
        amount: 50,
        walletId: 'w_1',
        userId: 'u_1',
        reference: null,
        metadata: {},
      }],
      transaction: {
        update: async ({ data }: any) => {
          currentStatus = data.status;
          updateCount++;
          return { id: 'tx_concurrent_1', status: data.status, amount: 50, reference: data.reference };
        },
      },
      redeemRequest: {
        updateMany: async () => ({ count: 0 }),
      },
      giftCardRedemption: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    return callback(mockTxClient);
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token = generateAccessToken(adminUser1);

    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/admin/withdrawals/tx_concurrent_1/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', reference: 'UTR-TEST-1' }),
      }),
      fetch(`${baseUrl}/admin/withdrawals/tx_concurrent_1/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', reference: 'UTR-TEST-2' }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 400], 'One request must succeed (200) and one must be rejected (400)');
    assert.equal(updateCount, 1, 'Transaction must be updated exactly once');
    assert.equal(currentStatus, TransactionStatus.COMPLETED);
  } finally {
    server.close();
    prisma.user.findUnique = origFindUniqueUser;
    prisma.$transaction = origTransaction;
  }
});

test('Withdrawal Safety - two admins simultaneously approving and rejecting: exactly one succeeds and refund is atomic', async () => {
  const origFindUniqueUser = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === adminUser1.id) return adminUser1;
    if (where.id === adminUser2.id) return adminUser2;
    return null;
  };

  let currentStatus: any = TransactionStatus.PENDING;
  let walletRefundCount = 0;

  (prisma as any).$transaction = async (callback: any) => {
    const mockTxClient = {
      $queryRaw: async (query: any) => {
        return [{
          id: 'tx_race_1',
          status: currentStatus,
          type: TransactionType.WITHDRAWAL,
          amount: 25,
          walletId: 'w_1',
          userId: 'u_1',
          reference: null,
          metadata: {},
        }];
      },
      wallet: {
        update: async () => {
          walletRefundCount++;
          return { id: 'w_1', balance: 125 };
        },
      },
      transaction: {
        update: async ({ data }: any) => {
          currentStatus = data.status;
          return { id: 'tx_race_1', status: data.status, amount: 25 };
        },
        create: async () => ({ id: 'tx_ref_1' }),
      },
      redeemRequest: {
        updateMany: async () => ({ count: 0 }),
      },
      giftCardRedemption: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    return callback(mockTxClient);
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token1 = generateAccessToken(adminUser1);
    const token2 = generateAccessToken(adminUser2);

    const [resAdmin1, resAdmin2] = await Promise.all([
      fetch(`${baseUrl}/admin/withdrawals/tx_race_1/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', reference: 'PAYOUT-A' }),
      }),
      fetch(`${baseUrl}/admin/withdrawals/tx_race_1/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Denied' }),
      }),
    ]);

    const statuses = [resAdmin1.status, resAdmin2.status].sort();
    assert.deepEqual(statuses, [200, 400], 'One admin action must win (200), other must be rejected (400)');

    if (currentStatus === TransactionStatus.COMPLETED) {
      assert.equal(walletRefundCount, 0, 'No wallet refund should occur if Approve won');
    } else {
      assert.equal(walletRefundCount, 1, 'Exactly one wallet refund should occur if Reject won');
    }
  } finally {
    server.close();
    prisma.user.findUnique = origFindUniqueUser;
    prisma.$transaction = origTransaction;
  }
});

test('Withdrawal Safety - two admins simultaneously rejecting: refund occurs exactly once, second call fails with 400', async () => {
  const origFindUniqueUser = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === adminUser1.id) return adminUser1;
    if (where.id === adminUser2.id) return adminUser2;
    return null;
  };

  let currentStatus: any = TransactionStatus.PENDING;
  let walletRefundCount = 0;

  (prisma as any).$transaction = async (callback: any) => {
    const mockTxClient = {
      $queryRaw: async () => [{
        id: 'tx_double_reject',
        status: currentStatus,
        type: TransactionType.WITHDRAWAL,
        amount: 10,
        walletId: 'w_1',
        userId: 'u_1',
        reference: null,
        metadata: {},
      }],
      wallet: {
        update: async () => {
          walletRefundCount++;
          return { id: 'w_1', balance: 100 };
        },
      },
      transaction: {
        update: async ({ data }: any) => {
          currentStatus = data.status;
          return { id: 'tx_double_reject', status: data.status, amount: 10 };
        },
        create: async () => ({ id: 'tx_ref_2' }),
      },
      redeemRequest: {
        updateMany: async () => ({ count: 0 }),
      },
      giftCardRedemption: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    return callback(mockTxClient);
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token1 = generateAccessToken(adminUser1);
    const token2 = generateAccessToken(adminUser2);

    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/admin/withdrawals/tx_double_reject/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Admin 1 reject' }),
      }),
      fetch(`${baseUrl}/admin/withdrawals/tx_double_reject/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Admin 2 reject' }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 400], 'Only one reject succeeds (200), the second gets 400');
    assert.equal(walletRefundCount, 1, 'Wallet must be refunded EXACTLY ONCE, never twice');
    assert.equal(currentStatus, TransactionStatus.CANCELLED);
  } finally {
    server.close();
    prisma.user.findUnique = origFindUniqueUser;
    prisma.$transaction = origTransaction;
  }
});

test('Withdrawal Safety - GET /redeem/pending enforces PENDING filter and never returns COMPLETED items', async () => {
  const origFindUniqueUser = prisma.user.findUnique;
  const origFindManyTx = prisma.transaction.findMany;
  const origFindManyRedeem = prisma.redeemRequest.findMany;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === adminUser1.id) return adminUser1;
    return null;
  };

  let capturedTxWhere: any = null;
  (prisma.transaction as any).findMany = async (args: any) => {
    capturedTxWhere = args?.where;
    return [];
  };

  let capturedRedeemWhere: any = null;
  (prisma.redeemRequest as any).findMany = async (args: any) => {
    capturedRedeemWhere = args?.where;
    return [];
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const token = generateAccessToken(adminUser1);

    const res = await fetch(`${baseUrl}/redeem/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(capturedTxWhere?.status, TransactionStatus.PENDING, 'Transaction query must filter status: PENDING');
    assert.equal(capturedRedeemWhere?.status, 'PENDING', 'RedeemRequest query must filter status: PENDING');
  } finally {
    server.close();
    prisma.user.findUnique = origFindUniqueUser;
    prisma.transaction.findMany = origFindManyTx;
    prisma.redeemRequest.findMany = origFindManyRedeem;
  }
});
