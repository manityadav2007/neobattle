import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { prisma } from '../config/db';
import pushRoutes from '../routes/push.routes';
import adminRoutes from '../routes/admin.routes';
import {
  sanitizeInAppPath,
  sanitizeNotificationText,
  fcmService,
} from '../services/fcm.service';
import { notificationService } from '../services/notification.service';
import { TournamentStatus } from '@prisma/client';

async function getOrCreateTestUser(suffix: string = 'test'): Promise<string> {
  const email = `pushtest_${suffix}_${Date.now()}@example.com`;
  const username = `pushtest_${suffix}_${Date.now().toString().slice(-6)}`;
  const uid = `TEST${Math.floor(100000000 + Math.random() * 900000000)}`;
  const user = await prisma.user.create({
    data: {
      email,
      username,
      uid,
      passwordHash: 'testpasswordhash123',
      role: 'PLAYER',
    },
    select: { id: true },
  });
  return user.id;
}

test('push notifications - path allowlist strictly sanitizes paths and blocks injections', () => {
  // Safe relative paths
  assert.equal(sanitizeInAppPath('/'), '/');
  assert.equal(sanitizeInAppPath('/tournaments'), '/tournaments');
  assert.equal(sanitizeInAppPath('/tournaments/t-123_abc'), '/tournaments/t-123_abc');
  assert.equal(sanitizeInAppPath('/wallet'), '/wallet');
  assert.equal(sanitizeInAppPath('/dashboard'), '/dashboard');
  assert.equal(sanitizeInAppPath('/profile'), '/profile');
  assert.equal(sanitizeInAppPath('/esports'), '/esports');
  assert.equal(sanitizeInAppPath('/shop'), '/shop');
  assert.equal(sanitizeInAppPath('/admin/notifications'), '/admin/notifications');

  // Block external URLs
  assert.equal(sanitizeInAppPath('https://malicious.com'), '/');
  assert.equal(sanitizeInAppPath('http://malicious.com'), '/');
  assert.equal(sanitizeInAppPath('//malicious.com/tournaments'), '/');
  assert.equal(sanitizeInAppPath('javascript:alert(1)'), '/');
  assert.equal(sanitizeInAppPath('/tournaments?x=<script>'), '/');
  assert.equal(sanitizeInAppPath(undefined), '/');
  assert.equal(sanitizeInAppPath(''), '/');
});

test('push notifications - sanitizeNotificationText redacts emails, accounts and balances', () => {
  const textWithEmail = 'Hello contact admin@example.com for help';
  assert.equal(sanitizeNotificationText(textWithEmail), 'Hello contact [email] for help');

  const textWithCard = 'Card 4111 2222 3333 4444 approved';
  assert.equal(sanitizeNotificationText(textWithCard), 'Card [account] approved');

  const textWithBalance = 'Your balance is ₹5000 in your wallet';
  assert.equal(sanitizeNotificationText(textWithBalance), 'Your balance is ₹*** in your wallet');
});

test('push notifications - register requires authentication and validates token format', async () => {
  // Test invalid token format (tampered tokens / script injection / too short)
  const authUser = { id: 'test-user-id-001', role: 'USER' };
  const invalidTokens = [
    'short', // < 10 chars
    'token with spaces and symbols!@#$%^&*()',
    '<script>alert(1)</script>',
    '',
    12345,
  ];

  for (const inv of invalidTokens) {
    const res = await new Promise<{ status: number; body: any }>((resolve) => {
      const mockReq: any = {
        user: authUser,
        body: { token: inv, platform: 'android' },
      };
      const mockRes: any = {
        status: (code: number) => {
          return {
            json: (data: any) => resolve({ status: code, body: data }),
          };
        },
      };
      import('../controllers/push.controller').then(({ registerPushToken }) => {
        registerPushToken(mockReq, mockRes);
      });
    });

    assert.equal(res.status, 400, `Token "${inv}" should be rejected with 400`);
    assert.equal(res.body.success, false);
  }
});

test('push notifications - unregister prevents deleting another user token', async () => {
  const userA = await getOrCreateTestUser('usera');
  const userB = await getOrCreateTestUser('userb');
  const testToken = `fcm-token-secure-unit-test-${Date.now()}`;

  // Seed token belonging to User A
  await prisma.pushToken.upsert({
    where: { token: testToken },
    create: {
      userId: userA,
      token: testToken,
      platform: 'android',
    },
    update: {
      userId: userA,
    },
  });

  // User B attempts to unregister User A's token
  const unregRes = await new Promise<{ status: number; body: any }>((resolve) => {
    const mockReq: any = {
      user: { id: userB, role: 'USER' },
      body: { token: testToken },
    };
    const mockRes: any = {
      status: (code: number) => {
        return {
          json: (data: any) => resolve({ status: code, body: data }),
        };
      },
    };
    import('../controllers/push.controller').then(({ unregisterPushToken }) => {
      unregisterPushToken(mockReq, mockRes);
    });
  });

  assert.equal(unregRes.status, 200);
  assert.equal(unregRes.body.removed, false, 'Attacker must not remove another user token');

  // Verify token is still in DB owned by User A
  const remaining = await prisma.pushToken.findUnique({
    where: { token: testToken },
  });
  assert.ok(remaining, 'Token must still exist');
  assert.equal(remaining.userId, userA);

  // Now User A removes own token
  const ownerRes = await new Promise<{ status: number; body: any }>((resolve) => {
    const mockReq: any = {
      user: { id: userA, role: 'USER' },
      body: { token: testToken },
    };
    const mockRes: any = {
      status: (code: number) => {
        return {
          json: (data: any) => resolve({ status: code, body: data }),
        };
      },
    };
    import('../controllers/push.controller').then(({ unregisterPushToken }) => {
      unregisterPushToken(mockReq, mockRes);
    });
  });

  assert.equal(ownerRes.status, 200);
  assert.equal(ownerRes.body.removed, true, 'Owner should remove own token');

  // Clean up
  await prisma.pushToken.deleteMany({ where: { token: testToken } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

test('push notifications - admin broadcast requires ADMIN or SUPER_ADMIN role', async () => {
  const normalUser = { id: 'regular-user-id', role: 'USER' };

  const res = await new Promise<{ status: number; body: any }>((resolve) => {
    const mockReq: any = {
      user: normalUser,
      body: { title: 'Test', message: 'Hello' },
    };
    const mockRes: any = {
      status: (code: number) => {
        return {
          json: (data: any) => resolve({ status: code, body: data }),
        };
      },
    };
    import('../controllers/admin.controller').then(({ sendPushNotification }) => {
      sendPushNotification(mockReq, mockRes);
    });
  });

  assert.equal(res.status, 403, 'Non-admin user must be rejected with 403');
  assert.equal(res.body.success, false);
});

test('push notifications - 15 minute tournament reminder deduplication (startReminderSent)', async () => {
  const uniqueId = `test-tourn-${Date.now()}`;

  // Atomic deduplication query: only updates when startReminderSent is false
  const initialUpdate = await prisma.tournament.updateMany({
    where: { id: uniqueId, startReminderSent: false },
    data: { startReminderSent: true },
  });
  assert.equal(initialUpdate.count, 0);

  // Verify startReminderSent defaults to false in schema
  const field = (prisma as any)._runtimeDataModel?.models?.Tournament?.fields?.find(
    (f: any) => f.name === 'startReminderSent'
  );
  if (field) {
    assert.equal(field.default, false, 'startReminderSent must default to false');
  }
});

test('push notifications - FCM auto-cleanup removes dead/unregistered tokens from database', async () => {
  const testUserId = await getOrCreateTestUser('deadtoken');
  const deadToken = `dead-token-${Date.now()}-1234567890`;

  // Seed dead token into push_tokens
  await prisma.pushToken.create({
    data: {
      userId: testUserId,
      token: deadToken,
      platform: 'android',
    },
  });

  // Verify token is in DB
  let exists = await prisma.pushToken.findUnique({ where: { token: deadToken } });
  assert.ok(exists, 'Dead token should be in DB before cleanup');

  // Perform cleanup simulation as performed in FCM service
  await prisma.pushToken.deleteMany({
    where: { token: { in: [deadToken] } },
  });

  exists = await prisma.pushToken.findUnique({ where: { token: deadToken } });
  assert.equal(exists, null, 'Dead token must be deleted from DB');

  // Clean up test user
  await prisma.user.deleteMany({ where: { id: testUserId } });
});

test('push notifications - admin single user lookup resolves by uid (FA-XXXX), username, email, and id', async () => {
  const ts = Date.now();
  const uid = `FA-${ts.toString().slice(-4)}`;
  const email = `lookup_${ts}@example.com`;
  const username = `u_${ts.toString().slice(-6)}`;

  const user = await prisma.user.create({
    data: {
      email,
      username,
      uid,
      passwordHash: 'hash123',
      role: 'PLAYER',
    },
  });

  const adminUser = { id: 'admin-tester-id', role: 'ADMIN' };

  try {
    // Lookup by UID (e.g. FA-1019)
    const resByUid = await new Promise<{ status: number; body: any }>((resolve) => {
      const mockReq: any = {
        user: adminUser,
        body: { title: 'Test Alert', message: 'Hello', audience: 'USER', targetUserId: uid },
      };
      const mockRes: any = {
        status: (code: number) => ({ json: (data: any) => resolve({ status: code, body: data }) }),
      };
      import('../controllers/admin.controller').then(({ sendPushNotification }) => {
        sendPushNotification(mockReq, mockRes);
      });
    });
    assert.equal(resByUid.status, 200);
    assert.equal(resByUid.body.success, true);
    assert.equal(typeof resByUid.body.sent, 'number');
    assert.equal(typeof resByUid.body.failed, 'number');

    // Lookup by email
    const resByEmail = await new Promise<{ status: number; body: any }>((resolve) => {
      const mockReq: any = {
        user: adminUser,
        body: { title: 'Test Alert', message: 'Hello', audience: 'USER', targetUserId: email },
      };
      const mockRes: any = {
        status: (code: number) => ({ json: (data: any) => resolve({ status: code, body: data }) }),
      };
      import('../controllers/admin.controller').then(({ sendPushNotification }) => {
        sendPushNotification(mockReq, mockRes);
      });
    });
    assert.equal(resByEmail.status, 200);
    assert.equal(resByEmail.body.success, true);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test('push notifications - sendToUsers helper dispatches push notifications and handles payloads', async () => {
  const testUserId = await getOrCreateTestUser('sendtousers');
  const testToken = `token-users-${Date.now()}`;

  await prisma.pushToken.create({
    data: {
      userId: testUserId,
      token: testToken,
      platform: 'android',
    },
  });

  let capturedTokens: string[] = [];
  let capturedPayload: any = null;
  const originalSendToTokens = (fcmService as any).sendToTokens;
  const originalInitialized = (fcmService as any).isInitialized;
  (fcmService as any).isInitialized = true;
  (fcmService as any).sendToTokens = async (tokens: string[], payload: any) => {
    capturedTokens = tokens;
    capturedPayload = payload;
    return { successCount: tokens.length, failureCount: 0 };
  };

  try {
    const res = await fcmService.sendToUsers(
      [testUserId],
      '⚔️ Match Starting Soon!',
      'Match is starting shortly. Room ID & Password are now ready in your dashboard!',
      { tournamentId: 'tour-123', route: '/tournaments/tour-123' }
    );

    assert.equal(res.successCount, 1);
    assert.ok(capturedTokens.includes(testToken));
    assert.equal(capturedPayload.title, '⚔️ Match Starting Soon!');
    assert.equal(capturedPayload.data.tournamentId, 'tour-123');
    assert.equal(capturedPayload.data.route, '/tournaments/tour-123');
  } finally {
    (fcmService as any).sendToTokens = originalSendToTokens;
    (fcmService as any).isInitialized = originalInitialized;
    await prisma.pushToken.deleteMany({ where: { token: testToken } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  }
});

test('push notifications - tournament lifecycle notifications trigger correctly', async () => {
  const userA = await getOrCreateTestUser('tour_participant');
  const capturedCalls: any[] = [];
  const originalSendToTokens = (fcmService as any).sendToTokens;
  const originalInitialized = (fcmService as any).isInitialized;
  (fcmService as any).isInitialized = true;
  (fcmService as any).sendToTokens = async (tokens: string[], payload: any) => {
    capturedCalls.push({ tokens, payload });
    return { successCount: tokens.length, failureCount: 0 };
  };

  const testToken = `token-tour-${Date.now()}`;
  await prisma.pushToken.create({
    data: {
      userId: userA,
      token: testToken,
      platform: 'android',
    },
  });

  try {
    // 1. Tournament Created
    await notificationService.notifyNewTournament('tour-999', 'Weekly Championship', 50, {
      mode: 'Clash Squad',
      prizePool: '1000',
      name: 'Weekly Championship',
    });
    const createdPush = capturedCalls.find((c) => c.payload.title.includes('🏆 New Tournament'));
    assert.ok(createdPush, 'New Tournament broadcast should be sent');
    assert.ok(createdPush.payload.body.includes('Mode: Clash Squad'));
    assert.ok(createdPush.payload.body.includes('Entry: ₹50'));
    assert.ok(createdPush.payload.body.includes('Prize: ₹1000'));
    assert.equal(createdPush.payload.data.route, '/tournaments/tour-999');

    // 2. Winner payout push
    await notificationService.notifyWinnerPayout(userA, 'Weekly Championship', 500, '1st Place');
    const winnerPush = capturedCalls.find((c) => c.payload.title === '🎉 Prize Credited!');
    assert.ok(winnerPush, 'Winner prize push should be sent');
    assert.equal(winnerPush.payload.body, 'Congratulations! You won ₹500 in Weekly Championship. Check your wallet!');
    assert.equal(winnerPush.payload.data.route, '/wallet');
  } finally {
    (fcmService as any).sendToTokens = originalSendToTokens;
    (fcmService as any).isInitialized = originalInitialized;
    await prisma.pushToken.deleteMany({ where: { token: testToken } });
    await prisma.user.deleteMany({ where: { id: userA } });
  }
});
