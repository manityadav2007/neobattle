import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { UserRole } from '@prisma/client';
import passport from '../config/passport';
import { generateAccessToken } from '../utils/auth.utils';
import { prisma } from '../config/db';
import adminRoutes from '../routes/admin.routes';
import paymentRoutes from '../routes/payment.routes';
import depositRoutes from '../routes/deposit.routes';
import storeRoutes from '../routes/store.routes';
import giftCardRoutes from '../routes/giftCard.routes';
import redeemRoutes from '../routes/redeem.routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(passport.initialize());

  app.use('/admin', adminRoutes);
  app.use('/payment', paymentRoutes);
  app.use('/deposits', depositRoutes);
  app.use('/store', storeRoutes);
  app.use('/gift-cards', giftCardRoutes);
  app.use('/redeem', redeemRoutes);

  return app;
}

test('consolidation - non-admin / moderator cannot approve payments or withdrawals (403)', async () => {
  const modUser = {
    id: 'usr-mod-1',
    role: UserRole.MODERATOR,
    email: 'mod@neobattle.live',
    username: 'modUser',
    isActive: true,
    isVerified: true,
  };

  const playerUser = {
    id: 'usr-player-1',
    role: UserRole.PLAYER,
    email: 'player@neobattle.live',
    username: 'playerUser',
    isActive: true,
    isVerified: true,
  };

  const origFindUnique = prisma.user.findUnique;
  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === 'usr-mod-1') return modUser;
    if (where.id === 'usr-player-1') return playerUser;
    return null;
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const modToken = generateAccessToken(modUser);
    const playerToken = generateAccessToken(playerUser);

    // 1. Moderator attempting to approve a payment -> 403 Forbidden
    const resModPay = await fetch(`${baseUrl}/payment/pay_fake_1/approve`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(resModPay.status, 403, 'Moderator must be denied (403) from approving payments');

    // 2. Player attempting to approve a payment -> 403 Forbidden
    const resPlayerPay = await fetch(`${baseUrl}/payment/pay_fake_1/approve`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${playerToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(resPlayerPay.status, 403, 'Player must be denied (403) from approving payments');

    // 3. Moderator attempting to review a deposit claim -> 403 Forbidden
    const resModDep = await fetch(`${baseUrl}/deposits/claim_fake_1/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert.equal(resModDep.status, 403, 'Moderator must be denied (403) from reviewing deposit claims');

    // 4. Moderator attempting to review a withdrawal -> 403 Forbidden
    const resModWd = await fetch(`${baseUrl}/admin/withdrawals/wd_fake_1/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    assert.equal(resModWd.status, 403, 'Moderator must be denied (403) from approving withdrawals');
  } finally {
    server.close();
    prisma.user.findUnique = origFindUnique;
  }
});

test('consolidation - dashboard stats includes both Transaction and RedeemRequest pending withdrawals', async () => {
  const adminUser = {
    id: 'usr-admin-1',
    role: UserRole.SUPER_ADMIN,
    email: 'admin@neobattle.live',
    username: 'superAdmin',
    isActive: true,
    isVerified: true,
  };

  const origFindUnique = prisma.user.findUnique;
  const origTxCount = prisma.transaction.count;
  const origRedeemCount = prisma.redeemRequest.count;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === 'usr-admin-1') return adminUser;
    return null;
  };

  // Mock 2 pending transactions and 1 pending redeemRequest
  (prisma.transaction as any).count = async (args?: any) => {
    if (args?.where?.type === 'WITHDRAWAL' && args?.where?.status === 'PENDING') return 2;
    return 10;
  };
  (prisma.redeemRequest as any).count = async (args?: any) => {
    if (args?.where?.status === 'PENDING') return 1;
    return 5;
  };

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adminToken = generateAccessToken(adminUser);

    const res = await fetch(`${baseUrl}/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    // 2 transaction withdrawals + 1 redeemRequest withdrawal = 3 total pending
    assert.equal(body.data.pendingRedeems, 3, 'Dashboard stats pendingRedeems must sum both tx and redeemRequest pending');
  } finally {
    server.close();
    prisma.user.findUnique = origFindUnique;
    prisma.transaction.count = origTxCount;
    prisma.redeemRequest.count = origRedeemCount;
  }
});
