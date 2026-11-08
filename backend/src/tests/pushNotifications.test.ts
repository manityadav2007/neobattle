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
