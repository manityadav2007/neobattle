import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { UserRole } from '@prisma/client';
import passport from '../config/passport';
import { generateAccessToken } from '../utils/auth.utils';
import { prisma } from '../config/db';
import adminRoutes from '../routes/admin.routes';
import storeRoutes from '../routes/store.routes';
import notificationRoutes from '../routes/notification.routes';
import depositRoutes from '../routes/deposit.routes';
import { detectKillsForTestFeed } from '../services/killDetectionService';
import { getApiRateLimitKey } from '../middleware/rateLimiter';

// ---------------------------------------------------------------------------
// Smoke Test Suite: Verifying Key Endpoints & Resiliency
// ---------------------------------------------------------------------------

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(passport.initialize());

  // Mount routes under their normal API prefixes
  app.use('/admin', adminRoutes);
  app.use('/store', storeRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/deposits', depositRoutes);

  return app;
}

test('smoke - rate limiter keys authenticated users by user id and unauthenticated by IP', () => {
  // Authenticated req with req.user
  const reqWithUser = { user: { id: 'usr-123' }, ip: '192.168.1.1' };
  assert.equal(getApiRateLimitKey(reqWithUser), 'user_usr-123');

  // Authenticated req with Bearer token
  const token = generateAccessToken({ id: 'usr-456', role: UserRole.PLAYER, email: 'test@example.com' });
  const reqWithBearer = { headers: { authorization: `Bearer ${token}` }, ip: '192.168.1.1' };
  assert.equal(getApiRateLimitKey(reqWithBearer), 'user_usr-456');

  // Unauthenticated req falls back to IP
  const unauthReq = { ip: '10.0.0.5' };
  assert.equal(getApiRateLimitKey(unauthReq), 'ip_10.0.0.5');
});

test('smoke - admin users list endpoint loads successfully for admin', async () => {
  const adminUser = {
    id: 'smoke-admin-1',
    email: 'smokeadmin@neobattle.live',
    username: 'smokeAdmin',
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    isVerified: true,
  };

  const origFindUnique = prisma.user.findUnique;
  const origFindMany = prisma.user.findMany;
  const origCount = prisma.user.count;

  (prisma.user as any).findUnique = async () => adminUser;

  (prisma.user as any).findMany = async () => [
    { id: 'u1', username: 'PlayerOne', email: 'one@neobattle.live', role: UserRole.PLAYER, createdAt: new Date() },
    { id: 'u2', username: 'PlayerTwo', email: 'two@neobattle.live', role: UserRole.PLAYER, createdAt: new Date() },
  ];

  (prisma.user as any).count = async () => 2;

  try {
    const app = createTestApp();
    const token = generateAccessToken(adminUser);

    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    const res = await fetch(`http://127.0.0.1:${port}/admin/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json: any = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.users || json.data), 'Expected array of users');

    server.close();
  } finally {
    prisma.user.findUnique = origFindUnique;
    prisma.user.findMany = origFindMany;
    prisma.user.count = origCount;
  }
});

test('smoke - store codes list endpoint loads successfully for admin', async () => {
  const adminUser = {
    id: 'smoke-admin-2',
    email: 'smokeadmin2@neobattle.live',
    username: 'smokeAdmin2',
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    isVerified: true,
  };

  const origFindUnique = prisma.user.findUnique;
  const origStoreFindMany = (prisma as any).storeItem?.findMany;

  (prisma.user as any).findUnique = async () => adminUser;

  if ((prisma as any).storeItem) {
    (prisma as any).storeItem.findMany = async () => [
      { id: 'sc-1', code: 'GOOGLE-100-TEST', type: 'GOOGLE_PLAY', amount: 100, isRedeemed: false, createdAt: new Date() },
    ];
  }

  try {
    const app = createTestApp();
    const token = generateAccessToken(adminUser);

    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    const res = await fetch(`http://127.0.0.1:${port}/store/codes`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json: any = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data), 'Expected data to be an array of store codes');

    server.close();
  } finally {
    prisma.user.findUnique = origFindUnique;
    if ((prisma as any).storeItem && origStoreFindMany) {
      (prisma as any).storeItem.findMany = origStoreFindMany;
    }
  }
});

test('smoke - notifications endpoint loads successfully for authenticated user', async () => {
  const normalUser = {
    id: 'smoke-user-1',
    email: 'smokeuser@neobattle.live',
    username: 'smokeUser',
    role: UserRole.PLAYER,
    isActive: true,
    isVerified: true,
  };

  const origFindUnique = prisma.user.findUnique;
  const origNotifFindMany = (prisma as any).notification?.findMany;
  const origNotifCount = (prisma as any).notification?.count;

  (prisma.user as any).findUnique = async () => normalUser;

  if ((prisma as any).notification) {
    (prisma as any).notification.findMany = async () => [];
    (prisma as any).notification.count = async () => 0;
  }

  try {
    const app = createTestApp();
    const token = generateAccessToken(normalUser);

    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    const res = await fetch(`http://127.0.0.1:${port}/notifications?limit=10`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json: any = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(json.success, true);

    server.close();
  } finally {
    prisma.user.findUnique = origFindUnique;
    if ((prisma as any).notification && origNotifFindMany) {
      (prisma as any).notification.findMany = origNotifFindMany;
      (prisma as any).notification.count = origNotifCount;
    }
  }
});

test('smoke - pending deposits endpoint loads for admin and never collides with getResumableDepositOrder', async () => {
  const adminUser = {
    id: 'smoke-admin-3',
    email: 'smokeadmin3@neobattle.live',
    username: 'smokeAdmin3',
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    isVerified: true,
  };

  const origFindUnique = prisma.user.findUnique;
  const origDepositFindMany = (prisma as any).depositRequest?.findMany;

  (prisma.user as any).findUnique = async () => adminUser;

  if ((prisma as any).depositRequest) {
    (prisma as any).depositRequest.findMany = async () => [];
  }

  try {
    const app = createTestApp();
    const token = generateAccessToken(adminUser);

    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    const res = await fetch(`http://127.0.0.1:${port}/deposits/pending`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json: any = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(json.success, true);
    // Crucial check: Must not return the 404 message from getResumableDepositOrder
    assert.notEqual(
      json.message,
      'Deposit request not found, expired, or superseded'
    );

    server.close();
  } finally {
    prisma.user.findUnique = origFindUnique;
    if ((prisma as any).depositRequest && origDepositFindMany) {
      (prisma as any).depositRequest.findMany = origDepositFindMany;
    }
  }
});

test('smoke - test-ai-feed video path resolution finds file in uploads/kill-counter/ without path-stripping error', async () => {
  const killCounterDir = path.resolve(process.cwd(), 'uploads', 'kill-counter');
  if (!fs.existsSync(killCounterDir)) {
    fs.mkdirSync(killCounterDir, { recursive: true });
  }

  // Create a dummy video file inside uploads/kill-counter/
  const testFileName = `test_feed_smoke_${Date.now()}.mp4`;
  const testFilePath = path.join(killCounterDir, testFileName);
  fs.writeFileSync(testFilePath, 'fake video file content for smoke test');

  try {
    const prevApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-dummy-api-key';

    let errorThrown: any = null;
    try {
      await detectKillsForTestFeed(testFilePath);
    } catch (err: any) {
      errorThrown = err;
    } finally {
      process.env.GEMINI_API_KEY = prevApiKey;
    }

    // It is expected to fail on ffmpeg probe since it's a dummy text file,
    // but it MUST HAVE FOUND the file and NOT thrown "Video file not found" or "Access denied"
    assert.ok(errorThrown, 'Should throw due to dummy video / probe');
    assert.doesNotMatch(
      errorThrown.message,
      /Video file not found/i,
      'Video file must be found without path-stripping error'
    );
    assert.doesNotMatch(
      errorThrown.message,
      /Access denied/i,
      'Video file in uploads/kill-counter must not trigger access denied'
    );
  } finally {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
});

test('smoke - path traversal attempt is strictly rejected by killDetectionService', async () => {
  const prevApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-dummy-api-key';

  try {
    let errorThrown: any = null;
    try {
      await detectKillsForTestFeed(path.resolve(process.cwd(), '..', 'secrets.txt'));
    } catch (err: any) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Path traversal must be rejected');
    assert.match(errorThrown.message, /Access denied|Invalid videoFilePath/i);
  } finally {
    process.env.GEMINI_API_KEY = prevApiKey;
  }
});
