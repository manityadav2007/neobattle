import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import passport from '../config/passport';
import depositRoutes from '../routes/deposit.routes';
import paymentRoutes from '../routes/payment.routes';
import { prisma } from '../config/db';
import { generateAccessToken } from '../utils/auth.utils';
import { UserRole } from '@prisma/client';

// ============================================================================
// Route Ordering & Path Collision Tests
// ============================================================================

test('deposit.routes - static /pending route is registered before /:id parameterized route', () => {
  const stack = (depositRoutes as any).stack;
  assert.ok(Array.isArray(stack), 'depositRoutes must have a route stack');

  // Find index of /pending and /:id in the layer stack
  let pendingIndex = -1;
  let idIndex = -1;
  let activeIndex = -1;

  stack.forEach((layer: any, idx: number) => {
    if (layer.route) {
      if (layer.route.path === '/pending' && layer.route.methods.get) {
        pendingIndex = idx;
      }
      if (layer.route.path === '/active' && layer.route.methods.get) {
        activeIndex = idx;
      }
      if (layer.route.path === '/:id' && layer.route.methods.get) {
        idIndex = idx;
      }
    }
  });

  assert.ok(pendingIndex !== -1, 'GET /pending route must exist in depositRoutes');
  assert.ok(activeIndex !== -1, 'GET /active route must exist in depositRoutes');
  assert.ok(idIndex !== -1, 'GET /:id route must exist in depositRoutes');

  // Assert that /pending comes strictly BEFORE /:id so Express never treats "pending" as an id
  assert.ok(
    pendingIndex < idIndex,
    `GET /pending (index ${pendingIndex}) must be registered BEFORE GET /:id (index ${idIndex})`
  );

  // Assert that /active comes strictly BEFORE /:id
  assert.ok(
    activeIndex < idIndex,
    `GET /active (index ${activeIndex}) must be registered BEFORE GET /:id (index ${idIndex})`
  );
});

test('deposit.routes - GET /pending routes to listDepositRequests and never 404s via getResumableDepositOrder', async () => {
  const adminUser = {
    id: 'admin-route-test-1',
    email: 'admin@neobattle.live',
    username: 'admin',
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    isVerified: true,
  };

  const originalFindUnique = prisma.user.findUnique;
  const originalFindMany = prisma.depositRequest.findMany;

  try {
    (prisma.user.findUnique as any) = async () => adminUser;
    (prisma.depositRequest.findMany as any) = async () => [];

    const token = generateAccessToken(adminUser);

    const app = express();
    app.use(express.json());
    app.use(passport.initialize());
    app.use('/deposits', depositRoutes);

    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/deposits/pending`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json: any = await res.json();

      // Must NOT return 404 with "Deposit request not found, expired, or superseded"
      assert.notEqual(
        res.status,
        404,
        `GET /deposits/pending must not return 404. Got: ${JSON.stringify(json)}`
      );
      assert.notEqual(
        json.message,
        'Deposit request not found, expired, or superseded',
        'GET /deposits/pending must not be intercepted by getResumableDepositOrder'
      );
      assert.equal(res.status, 200, 'GET /deposits/pending must return 200 OK');
      assert.ok(Array.isArray(json.data), 'GET /deposits/pending must return array of deposit requests');
    } finally {
      server.close();
    }
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.depositRequest.findMany = originalFindMany;
  }
});

test('payment.routes - /deposit/status/:transactionId is registered before /deposit/:id', () => {
  const stack = (paymentRoutes as any).stack;
  assert.ok(Array.isArray(stack), 'paymentRoutes must have a route stack');

  let statusIndex = -1;
  let idIndex = -1;

  stack.forEach((layer: any, idx: number) => {
    if (layer.route) {
      if (layer.route.path === '/deposit/status/:transactionId' && layer.route.methods.get) {
        statusIndex = idx;
      }
      if (layer.route.path === '/deposit/:id' && layer.route.methods.get) {
        idIndex = idx;
      }
    }
  });

  assert.ok(statusIndex !== -1, 'GET /deposit/status/:transactionId route must exist');
  assert.ok(idIndex !== -1, 'GET /deposit/:id route must exist');
  assert.ok(
    statusIndex < idIndex,
    `GET /deposit/status/:transactionId (index ${statusIndex}) must be before /deposit/:id (index ${idIndex})`
  );
});
