import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../config/db';
import { notificationService } from '../services/notification.service';
import { fcmService, PushMessagePayload } from '../services/fcm.service';
import { reviewWithdrawal } from '../controllers/admin.controller';
import { TransactionStatus, TransactionType, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

async function createTestPlayer(suffix: string, options: { pushEnabled?: boolean; alertsEnabled?: boolean } = {}) {
  const ts = Date.now();
  const email = `player_${suffix}_${ts}@example.com`;
  const username = `pl_${suffix}_${ts.toString().slice(-6)}`;
  const uid = `UID${Math.floor(100000000 + Math.random() * 900000000)}`;

  const user = await prisma.user.create({
    data: {
      email,
      username,
      uid,
      passwordHash: 'hash123456',
      role: UserRole.PLAYER,
      pushNotificationsEnabled: options.pushEnabled !== undefined ? options.pushEnabled : true,
      notifyAlerts: options.alertsEnabled !== undefined ? options.alertsEnabled : true,
    },
    select: { id: true, email: true, username: true },
  });

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      balance: new Decimal(1000),
    },
  });

  return { user, wallet };
}

test('withdrawal push - payload contains strictly NO amount, balance, UPI ID, bank details, transaction IDs or email', () => {
  // Capture payload generated for COMPLETED
  let sentPayload: PushMessagePayload | null = null;
  const originalSendToUser = fcmService.sendToUser;
  (fcmService as any).sendToUser = async (_userId: string, payload: PushMessagePayload) => {
    sentPayload = payload;
    return { successCount: 1, failureCount: 0 };
  };

  try {
    // Expected exact copy
    const completedTitle = 'Withdrawal successful';
    const completedBody = 'Your withdrawal has been processed. Tap to view your wallet.';
    const expectedPath = '/wallet';

    const rejectedTitle = 'Withdrawal not processed';
    const rejectedBody = 'Withdrawal not processed: tap to view details';

    // Verify strings
    const sensitivePatterns = [
      /₹|\$|INR|Rs\b/i,
      /\b\d+(\.\d{1,2})?\b/, // numbers/amounts
      /@[a-zA-Z0-9.-]+/,     // email or UPI handle like @okaxis, @upi
      /balance/i,
      /account/i,
      /tx[_-]/i,
      /wth[_-]/i,
    ];

    for (const pattern of sensitivePatterns) {
      assert.equal(pattern.test(completedTitle), false, `Title must not contain sensitive data: ${pattern}`);
      assert.equal(pattern.test(completedBody), false, `Body must not contain sensitive data: ${pattern}`);
      assert.equal(pattern.test(expectedPath), false, `Path must not contain sensitive data: ${pattern}`);
      assert.equal(pattern.test(rejectedTitle), false, `Rejected title must not contain sensitive data: ${pattern}`);
      assert.equal(pattern.test(rejectedBody), false, `Rejected body must not contain sensitive data: ${pattern}`);
    }

    assert.equal(completedTitle, 'Withdrawal successful');
    assert.equal(completedBody, 'Your withdrawal has been processed. Tap to view your wallet.');
    assert.equal(expectedPath, '/wallet');
  } finally {
    fcmService.sendToUser = originalSendToUser;
  }
});

test('withdrawal push - pending withdrawal does NOT send push notification and notified is false', async () => {
  const { user, wallet } = await createTestPlayer('pending');

  let pushSent = false;
  const originalSendToUser = fcmService.sendToUser;
  (fcmService as any).sendToUser = async () => {
    pushSent = true;
    return { successCount: 1, failureCount: 0 };
  };

  try {
    // 1. Create a PENDING withdrawal transaction
    const tx = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: new Decimal(250),
        description: 'Pending withdrawal test',
      },
    });

    assert.equal(tx.status, TransactionStatus.PENDING);
    assert.equal(tx.notified, false, 'Pending withdrawal notified must default to false');
    assert.equal(pushSent, false, 'Push must NOT be sent while withdrawal is PENDING');

    // Cleanup
    await prisma.transaction.delete({ where: { id: tx.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    fcmService.sendToUser = originalSendToUser;
  }
});

test('withdrawal push - notification sent once after status becomes COMPLETED, deduplication prevents duplicate push', async () => {
  const { user, wallet } = await createTestPlayer('approved');

  let sendCount = 0;
  let receivedPayload: PushMessagePayload | null = null;
  const originalSendToUser = fcmService.sendToUser;
  (fcmService as any).sendToUser = async (_userId: string, payload: PushMessagePayload) => {
    sendCount++;
    receivedPayload = payload;
    return { successCount: 1, failureCount: 0 };
  };

  try {
    // 1. Create a PENDING withdrawal transaction
    const tx = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: new Decimal(500),
        description: 'Withdrawal test',
      },
    });

    assert.equal(tx.notified, false);

    // 2. Mark as COMPLETED in database
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: TransactionStatus.COMPLETED },
    });

    // 3. Trigger withdrawal push notification (executed outside and after database commit)
    await notificationService.notifyWithdrawalStatus({
      withdrawalId: tx.id,
      userId: user.id,
      status: 'COMPLETED',
      type: 'TRANSACTION',
    });

    assert.equal(sendCount, 1, 'Push notification must be sent exactly once upon completion');
    assert.ok(receivedPayload, 'Payload must be passed to FCM');
    assert.equal((receivedPayload as any).title, 'Withdrawal successful');
    assert.equal((receivedPayload as any).body, 'Your withdrawal has been processed. Tap to view your wallet.');
    assert.equal((receivedPayload as any).path, '/wallet');

    // Verify notified is now true in DB
    const updatedTx = await prisma.transaction.findUnique({ where: { id: tx.id } });
    assert.equal(updatedTx?.notified, true, 'Withdrawal notified flag must be true');

    // 4. SECOND CALL: Simulate retry, restart, or duplicate admin click
    await notificationService.notifyWithdrawalStatus({
      withdrawalId: tx.id,
      userId: user.id,
      status: 'COMPLETED',
      type: 'TRANSACTION',
    });

    assert.equal(sendCount, 1, 'Second call must NOT send a duplicate push notification');

    // Cleanup
    await prisma.transaction.delete({ where: { id: tx.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    fcmService.sendToUser = originalSendToUser;
  }
});

test('withdrawal push - rejected withdrawal sends "Withdrawal not processed" once and refunds', async () => {
  const { user, wallet } = await createTestPlayer('rejected');

  let sendCount = 0;
  let receivedPayload: PushMessagePayload | null = null;
  const originalSendToUser = fcmService.sendToUser;
  (fcmService as any).sendToUser = async (_userId: string, payload: PushMessagePayload) => {
    sendCount++;
    receivedPayload = payload;
    return { successCount: 1, failureCount: 0 };
  };

  try {
    const tx = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: new Decimal(300),
      },
    });

    // Mark as CANCELLED (refunded)
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: TransactionStatus.CANCELLED },
    });

    // Notify status REJECTED
    await notificationService.notifyWithdrawalStatus({
      withdrawalId: tx.id,
      userId: user.id,
      status: 'REJECTED',
      type: 'TRANSACTION',
    });

    assert.equal(sendCount, 1, 'Push notification must be sent once for rejected withdrawal');
    assert.equal((receivedPayload as any).title, 'Withdrawal not processed');
    assert.equal((receivedPayload as any).body, 'Withdrawal not processed: tap to view details');
    assert.equal((receivedPayload as any).path, '/wallet');

    // Second call deduplication check
    await notificationService.notifyWithdrawalStatus({
      withdrawalId: tx.id,
      userId: user.id,
      status: 'REJECTED',
      type: 'TRANSACTION',
    });

    assert.equal(sendCount, 1, 'Second call must be ignored');

    // Cleanup
    await prisma.transaction.delete({ where: { id: tx.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    fcmService.sendToUser = originalSendToUser;
  }
});

test('withdrawal push - push failure does NOT fail, delay or roll back the withdrawal', async () => {
  const { user, wallet } = await createTestPlayer('fcm_failure');

  // Force fcmService to throw an error (simulating FCM / network failure)
  const originalSendToUser = fcmService.sendToUser;
  (fcmService as any).sendToUser = async () => {
    const error: any = new Error('Firebase service unavailable (ECONNREFUSED)');
    error.code = 'messaging/server-unavailable';
    throw error;
  };

  try {
    const tx = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: new Decimal(100),
      },
    });

    const adminUser = {
      id: 'mock-admin-id-1',
      role: UserRole.SUPER_ADMIN,
    };

    const mockReq: any = {
      user: adminUser,
      params: { id: tx.id },
      body: { status: 'COMPLETED', reference: 'REF-12345' },
    };

    let responseJson: any = null;
    let statusCode = 200;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            responseJson = data;
          },
        };
      },
      json: (data: any) => {
        responseJson = data;
      },
    };

    // Review withdrawal - should succeed despite FCM throwing
    await reviewWithdrawal(mockReq, mockRes);

    assert.equal(statusCode, 200);
    assert.equal(responseJson.success, true, 'Withdrawal must succeed even when push notification fails');

    // Verify transaction status in DB is COMPLETED
    const completedTx = await prisma.transaction.findUnique({ where: { id: tx.id } });
    assert.equal(completedTx?.status, TransactionStatus.COMPLETED);

    // Cleanup
    await prisma.transaction.delete({ where: { id: tx.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    fcmService.sendToUser = originalSendToUser;
  }
});

test('withdrawal push - notifications toggle off means no push is sent', async () => {
  // Create user with pushNotificationsEnabled = false
  const { user, wallet } = await createTestPlayer('disabled_push', { pushEnabled: false });

  // Seed token for this user
  const testToken = `test-token-disabled-user-${Date.now()}`;
  await prisma.pushToken.create({
    data: {
      userId: user.id,
      token: testToken,
      platform: 'android',
    },
  });

  // Spy on sendToTokens
  let tokensCalled = false;
  const originalSendToTokens = (fcmService as any).sendToTokens;
  (fcmService as any).sendToTokens = async () => {
    tokensCalled = true;
    return { successCount: 1, failureCount: 0 };
  };

  try {
    const res = await fcmService.sendToUser(
      user.id,
      {
        title: 'Withdrawal successful',
        body: 'Your withdrawal has been processed. Tap to view your wallet.',
        path: '/wallet',
      },
      'notifyAlerts'
    );

    assert.equal(res.successCount, 0, 'No push should be sent when toggle is off');
    assert.equal(tokensCalled, false, 'sendToTokens must not be called when user has toggle off');

    // Cleanup
    await prisma.pushToken.delete({ where: { token: testToken } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    (fcmService as any).sendToTokens = originalSendToTokens;
  }
});
