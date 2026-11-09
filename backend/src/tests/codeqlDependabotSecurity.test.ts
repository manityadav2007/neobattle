import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import express from 'express';
import passport from '../config/passport';
import { UserRole } from '@prisma/client';
import { generateAccessToken } from '../utils/auth.utils';
import { prisma } from '../config/db';
import { normalizePlayerName } from '../services/screenshotKillDetectionService';
import { detectKillsForTestFeed } from '../services/killDetectionService';
import { fcmService } from '../services/fcm.service';
import * as screenshotKillController from '../controllers/screenshotKillCounter.controller';

function createSecurityTestApp() {
  const app = express();
  app.use(express.json());
  app.use(passport.initialize());

  // Mount screenshot kill counter routes for parameter tampering testing
  app.post(
    '/api/results/tournament/:id/submit-screenshots',
    (req, res, next) => {
      // Mock authenticated host user
      req.user = { id: 'host-user-1', role: UserRole.HOST, username: 'host1' } as any;
      next();
    },
    screenshotKillController.submitHostScreenshots
  );

  app.get(
    '/api/admin/kill-counter/tournament/:id/screenshot-data',
    (req, res, next) => {
      req.user = { id: 'admin-user-1', role: UserRole.SUPER_ADMIN, username: 'admin1' } as any;
      next();
    },
    screenshotKillController.getTournamentScreenshotData
  );

  app.post(
    '/api/admin/kill-counter/scan-screenshots',
    (req, res, next) => {
      req.user = { id: 'admin-user-1', role: UserRole.SUPER_ADMIN, username: 'admin1' } as any;
      next();
    },
    screenshotKillController.scanScreenshots
  );

  app.post(
    '/api/admin/kill-counter/distribute-per-kill',
    (req, res, next) => {
      req.user = { id: 'admin-user-1', role: UserRole.SUPER_ADMIN, username: 'admin1' } as any;
      next();
    },
    screenshotKillController.distributePerKillPrizes
  );

  app.get('/api/admin/kill-counter/screenshot/view', screenshotKillController.viewAdminScreenshot);

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Parameter Tampering & Type Confusion Tests
// ─────────────────────────────────────────────────────────────────────────────
test('Parameter Tampering - submitHostScreenshots rejects tampered winnerUid (array, object, number) with 400', async () => {
  const app = createSecurityTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Array tampering: winnerUid = ['uid1', 'uid2']
    const resArray = await fetch(`${baseUrl}/api/results/tournament/t1/submit-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerUid: ['uid1', 'uid2'] }),
    });
    assert.equal(resArray.status, 400);

    // Object tampering: winnerUid = { $ne: null }
    const resObject = await fetch(`${baseUrl}/api/results/tournament/t1/submit-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerUid: { id: 'fake' } }),
    });
    assert.equal(resObject.status, 400);

    // Number tampering: winnerUid = 12345
    const resNumber = await fetch(`${baseUrl}/api/results/tournament/t1/submit-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerUid: 12345 }),
    });
    assert.equal(resNumber.status, 400);
  } finally {
    server.close();
  }
});

test('Parameter Tampering - scanScreenshots rejects non-string tournamentId or invalid storageKeys array', async () => {
  const app = createSecurityTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // tournamentId as array
    const resIdArray = await fetch(`${baseUrl}/api/admin/kill-counter/scan-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: ['t1', 't2'] }),
    });
    assert.equal(resIdArray.status, 400);

    // storageKeys as object rather than array
    const resKeysObj = await fetch(`${baseUrl}/api/admin/kill-counter/scan-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: 't1', storageKeys: { key: 'val' } }),
    });
    assert.equal(resKeysObj.status, 400);

    // storageKeys with array containing non-strings
    const resKeysTampered = await fetch(`${baseUrl}/api/admin/kill-counter/scan-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: 't1', storageKeys: [123, null] }),
    });
    assert.equal(resKeysTampered.status, 400);
  } finally {
    server.close();
  }
});

test('Parameter Tampering - distributePerKillPrizes rejects non-array or tampered kills list', async () => {
  const app = createSecurityTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // kills as object
    const res1 = await fetch(`${baseUrl}/api/admin/kill-counter/distribute-per-kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournamentId: 't1',
        confirmedWinnerUid: 'u1',
        kills: { 'player1': 5 },
      }),
    });
    assert.equal(res1.status, 400);

    // kills entry with tampered playerId (array)
    const res2 = await fetch(`${baseUrl}/api/admin/kill-counter/distribute-per-kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournamentId: 't1',
        confirmedWinnerUid: 'u1',
        kills: [{ playerId: ['p1'], kills: 2 }],
      }),
    });
    assert.equal(res2.status, 400);

    // kills entry with tampered kills count (object)
    const res3 = await fetch(`${baseUrl}/api/admin/kill-counter/distribute-per-kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournamentId: 't1',
        confirmedWinnerUid: 'u1',
        kills: [{ playerId: 'p1', kills: { value: 10 } }],
      }),
    });
    assert.equal(res3.status, 400);
  } finally {
    server.close();
  }
});

test('Parameter Tampering - viewAdminScreenshot rejects array/object in query parameters', async () => {
  const app = createSecurityTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Repeated parameter creating an array: ?key=k1&key=k2
    const resArray = await fetch(`${baseUrl}/api/admin/kill-counter/screenshot/view?key=k1&key=k2&exp=123&sig=sig1`);
    assert.equal(resArray.status, 400);

    // Missing required parameters
    const resMissing = await fetch(`${baseUrl}/api/admin/kill-counter/screenshot/view?key=k1`);
    assert.equal(resMissing.status, 400);
  } finally {
    server.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Path Traversal & Strict Video Path Resolution Tests
// ─────────────────────────────────────────────────────────────────────────────
test('Path Traversal - killDetectionService strictly rejects directory traversal, null bytes, and non-whitelisted paths', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-dummy-api-key';

  try {
    // 1. Relative dot-dot traversal
    await assert.rejects(
      detectKillsForTestFeed('../../../etc/passwd'),
      /Invalid videoFilePath|Access denied/i
    );

    // 2. Encoded dots %2e%2e
    await assert.rejects(
      detectKillsForTestFeed('%2e%2e/test_feed_123456789.mp4'),
      /Invalid videoFilePath|Access denied/i
    );

    // 3. Null byte injection
    await assert.rejects(
      detectKillsForTestFeed('test_feed_123456789.mp4\0.txt'),
      /Invalid videoFilePath|Access denied/i
    );

    // 4. Absolute path outside allowed directory
    await assert.rejects(
      detectKillsForTestFeed(path.resolve(process.cwd(), '..', 'secrets.txt')),
      /Access denied/i
    );

    // 5. Short ID or non-whitelisted extension (not a server-generated ID)
    await assert.rejects(
      detectKillsForTestFeed('test.exe'),
      /Access denied/i
    );
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FCM Logging & Sensitive Information Protection Tests
// ─────────────────────────────────────────────────────────────────────────────
test('FCM Logging - FCM error logging never leaks push tokens or service account data to stdout/stderr', async () => {
  const secretToken = 'fcm_secret_push_token_xyz987654321';
  let loggedOutput = '';

  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  console.error = (...args: any[]) => {
    loggedOutput += args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
  };
  console.log = (...args: any[]) => {
    loggedOutput += args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
  };

  try {
    // Attempt sendToTokens when FCM is not initialized or with invalid tokens
    await fcmService.sendToTokens([secretToken], {
      title: 'Tournament Alert',
      body: 'Your match starts now!',
      path: '/tournaments/t1',
    });

    // Attempt sendToUser with simulated error
    await fcmService.sendToUser('user-test-id-123', {
      title: 'Alert',
      body: 'Hello',
    });

    // Verify secret push token is never in log output
    assert.equal(
      loggedOutput.includes(secretToken),
      false,
      'FCM logger must NEVER log push tokens in stdout or stderr'
    );
    assert.equal(
      loggedOutput.includes('private_key'),
      false,
      'FCM logger must NEVER log private keys'
    );
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Multi-character Sanitization & Overlapping Input Tests
// ─────────────────────────────────────────────────────────────────────────────
test('Sanitization - normalizePlayerName cannot be bypassed by overlapping or nested input', () => {
  // Nested brackets [TS[NESTED]G] Ritik -> ritik
  const nested = normalizePlayerName('[TS[NESTED]G] Ritik');
  assert.equal(nested, 'rltlk', 'Nested clan brackets must be completely removed without leaving fragments');

  // Overlapping brackets [[CLAN]] Player -> player
  const overlapping = normalizePlayerName('[[CLAN]] Player');
  assert.equal(overlapping, 'player', 'Overlapping brackets must not bypass clan tag removal');

  // Multi-layer nested (OP(TAG)) Boss -> boss
  const multiLayer = normalizePlayerName('(OP(TAG)) Boss');
  assert.equal(multiLayer, 'boss', 'Multi-layer parenthesis must be completely removed');

  // HTML injection attempt <script>alert(1)</script> Player
  const htmlAttempt = normalizePlayerName('<script>alert(1)</script> Player');
  assert.equal(
    htmlAttempt.includes('<'),
    false,
    'Angle brackets must be completely eliminated'
  );
  assert.equal(
    htmlAttempt.includes('>'),
    false,
    'Angle brackets must be completely eliminated'
  );

  // Free Fire decorative character with clan name inside brackets and NO outside alphanumeric
  // [ᴅᴇᴀᴅ] -> dead (brackets stripped, name preserved)
  const deadPlayer = normalizePlayerName('★彡[ᴅᴇᴀᴅ]彡★');
  assert.equal(deadPlayer, 'dead', 'Single bracketed name without outside characters must preserve player name');
});
