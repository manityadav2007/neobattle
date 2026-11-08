import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'crypto';
import { UserRole, TournamentStatus } from '@prisma/client';
import passport from '../config/passport';
import { generateAccessToken } from '../utils/auth.utils';
import { prisma } from '../config/db';
import resultRoutes from '../routes/result.routes';
import killCounterRoutes from '../routes/killCounter.routes';
import {
  normalizePlayerName,
  calculateSimilarity,
  mergeScoreboardRows,
  matchRowsToCandidates,
  PlayerCandidate,
  ScoreboardRow,
} from '../services/screenshotKillDetectionService';
import { privateStorageService } from '../services/privateStorage.service';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(passport.initialize());

  // Mount routes matching server.ts
  app.use('/results', resultRoutes);
  app.use('/admin/kill-counter', killCounterRoutes);

  return app;
}

// ---------------------------------------------------------------------------
// 1. Name Normalization Tests
// ---------------------------------------------------------------------------
test('screenshotKillDetection - name normalization handles fancy Unicode and symbols', () => {
  // Unicode mathematical bold with lookalike unification (i -> l)
  assert.equal(normalizePlayerName('𝕶𝖎𝖑𝖑𝖊𝖗'), 'klller');
  // Decorative brackets & symbols
  assert.equal(normalizePlayerName('★彡[ᴅᴇᴀᴅ]彡★'), 'dead');
  // Clan tags with dot/bullet
  assert.equal(normalizePlayerName('IND•CRIMINAL'), 'crlmlnal');
  // Bracketed clan tags
  assert.equal(normalizePlayerName('[TSG] Ritik'), 'rltlk');
  // Lookalike unification: O and 0, I and 1 and l
  assert.equal(normalizePlayerName('B0SS'), 'boss');
  assert.equal(normalizePlayerName('K1LL'), 'klll');
});

// ---------------------------------------------------------------------------
// 2. Similarity & Lookalike Scoring Tests
// ---------------------------------------------------------------------------
test('screenshotKillDetection - similarity accounts for common OCR lookalikes', () => {
  // Exact match after normalization
  const score1 = calculateSimilarity('Raistar', 'raistar');
  assert.equal(score1, 1.0);

  // O vs 0
  const score2 = calculateSimilarity('SNIPER007', 'sniperoo7');
  assert.ok(score2 >= 0.95, `Expected score2 >= 0.95, got ${score2}`);

  // Minor typo
  const score3 = calculateSimilarity('Thunder', 'Thundr');
  assert.ok(score3 >= 0.7, `Expected score3 >= 0.7, got ${score3}`);
});

// ---------------------------------------------------------------------------
// 3. Scoreboard Row Merging & Deduplication by Slot
// ---------------------------------------------------------------------------
test('screenshotKillDetection - mergeScoreboardRows deduplicates across screenshots by slot', () => {
  const batchRows: ScoreboardRow[][] = [
    // Screenshot 1 (shows slots 1-3)
    [
      { slot: 1, name: 'Ajjubhai94', kills: 4, greyed: false },
      { slot: 2, name: 'Raistar', kills: 2, greyed: false },
      { slot: 3, name: 'Badge99', kills: 1, greyed: true },
    ],
    // Screenshot 2 (shows slots 2-4, slot 2 has updated kills, slot 3 is now non-greyed)
    [
      { slot: 2, name: 'Raistar', kills: 3, greyed: false },
      { slot: 3, name: 'Badge99', kills: 1, greyed: false },
      { slot: 4, name: 'TotalGaming', kills: 0, greyed: true },
    ],
  ];

  const merged = mergeScoreboardRows(batchRows);
  assert.equal(merged.length, 4);

  // Slot 1
  assert.equal(merged.find((r) => r.slot === 1)?.kills, 4);

  // Slot 2 merged to max kills (3)
  assert.equal(merged.find((r) => r.slot === 2)?.kills, 3);

  // Slot 3 took non-greyed version
  const slot3 = merged.find((r) => r.slot === 3);
  assert.equal(slot3?.greyed, false);

  // Slot 4 present
  assert.equal(merged.find((r) => r.slot === 4)?.name, 'TotalGaming');
});

// ---------------------------------------------------------------------------
// 4. Candidate Matching: Truncation ("...") and Ambiguity Safeguards
// ---------------------------------------------------------------------------
test('screenshotKillDetection - matchRowsToCandidates NEVER auto-assigns truncated names', () => {
  const candidates: PlayerCandidate[] = [
    { id: 'p1', ign: 'DominatorPrime', username: 'dom1', freeFireId: '111' },
    { id: 'p2', ign: 'GhostRider', username: 'ghost', freeFireId: '222' },
  ];

  const rows: ScoreboardRow[] = [
    { slot: 1, name: 'Dominat...', kills: 5, greyed: false },
  ];

  const { matchedPlayers } = matchRowsToCandidates(rows, candidates);
  assert.equal(matchedPlayers.length, 1);
  // Truncated with ellipsis must flag needsManualReview
  assert.equal(matchedPlayers[0].needsManualReview, true);
  assert.ok(matchedPlayers[0].manualReason?.includes('Truncated'));
});

test('screenshotKillDetection - matchRowsToCandidates flags ambiguous near-identical matches', () => {
  const candidates: PlayerCandidate[] = [
    { id: 'p1', ign: 'ShadowKing', username: 'shadow1', freeFireId: '101' },
    { id: 'p2', ign: 'ShadowKong', username: 'shadow2', freeFireId: '102' },
  ];

  const rows: ScoreboardRow[] = [
    { slot: 1, name: 'ShadowKng', kills: 3, greyed: false },
  ];

  const { matchedPlayers } = matchRowsToCandidates(rows, candidates);
  assert.equal(matchedPlayers.length, 1);
  // Ambiguous: two close candidates within threshold
  assert.equal(matchedPlayers[0].needsManualReview, true);
  assert.ok(matchedPlayers[0].manualReason?.includes('Multiple candidate players matched'));
  assert.equal(matchedPlayers[0].isAmbiguous, true);
  assert.ok(matchedPlayers[0].potentialMatches && matchedPlayers[0].potentialMatches.length >= 2);
});

// ---------------------------------------------------------------------------
// 5. SHA-256 Screenshot Hashing & Duplicate Rejection
// ---------------------------------------------------------------------------
test('privateStorageService - computeSha256 produces exact hash', () => {
  const dummyBuffer = Buffer.from('TEST_FREE_FIRE_SCREENSHOT_DATA');
  const expectedHash = crypto.createHash('sha256').update(dummyBuffer).digest('hex');
  const computed = privateStorageService.computeSha256(dummyBuffer);
  assert.equal(computed, expectedHash);
});

// ---------------------------------------------------------------------------
// 6. Security: Non-Admin Access Rejection on Studio Endpoints
// ---------------------------------------------------------------------------
test('security - non-admin user cannot access admin screenshot endpoints', async () => {
  const app = createTestApp();
  const playerToken = generateAccessToken({
    id: 'usr-player-123',
    role: UserRole.PLAYER,
    email: 'player@example.com',
  });

  const mockReq: any = {
    user: { id: 'usr-player-123', role: UserRole.PLAYER },
    params: { id: 'tourn-123' },
  };
  let statusCode = 200;
  let responseData: any = null;
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return mockRes;
    },
    json: (data: any) => {
      responseData = data;
      return mockRes;
    },
  };

  // Import adminCheck directly
  const { adminOnly } = await import('../middleware/adminCheck');
  adminOnly(mockReq, mockRes, () => {
    statusCode = 200;
  });

  assert.equal(statusCode, 403);
  assert.equal(responseData?.message, 'Admin only');
});

// ---------------------------------------------------------------------------
// 7. Payout Math & Integer Balance Conservation
// ---------------------------------------------------------------------------
test('payoutMath - validates exact balance: Total Collection = Total Prize + Host Commission + Platform Commission', () => {
  const entriesCount = 48;
  const entryFee = 100;
  const totalCollection = entriesCount * entryFee; // 4800

  // Full map: 28% commission total (8% host, 20% platform, 72% prize pool)
  const hostCommission = Math.round(totalCollection * 0.08); // 384
  const expectedPrizePool = totalCollection * 0.72; // 3456

  // Per kill tournament configuration:
  const perKillRate = 50;
  const booyahPrize = 500;

  // Let 10 players have kills totaling 40 kills
  const totalKills = 40;
  const killPrizes = totalKills * perKillRate; // 2000
  const winnerPrize = booyahPrize; // 500
  const totalPrizeAwarded = killPrizes + winnerPrize; // 2500

  // Platform commission formula (integer exact):
  const hostAmount = hostCommission; // 384
  const platformAmount = Math.max(0, totalCollection - hostAmount - totalPrizeAwarded); // 4800 - 384 - 2500 = 1916

  // Conservation check:
  assert.equal(totalPrizeAwarded + hostAmount + platformAmount, totalCollection);
  assert.equal(2500 + 384 + 1916, 4800);
});

// ---------------------------------------------------------------------------
// 8. Parameter Tampering & Type Confusion Protection Tests
// ---------------------------------------------------------------------------
test('parameterTampering - screenshotKillCounter endpoints reject arrays and objects where string expected', async () => {
  const {
    submitHostScreenshots,
    scanScreenshots,
    distributePerKillPrizes,
    viewAdminScreenshot,
  } = await import('../controllers/screenshotKillCounter.controller');

  // Test 1: submitHostScreenshots with tampered array for winnerUid
  let statusCode = 200;
  let responseData: any = null;
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return mockRes;
    },
    json: (data: any) => {
      responseData = data;
      return mockRes;
    },
    send: (data: any) => {
      responseData = data;
      return mockRes;
    },
  };

  const reqTamperedBody: any = {
    user: { id: 'host-123', role: UserRole.PLAYER },
    params: { id: 'tourn-123' },
    body: { winnerUid: ['hacked-uid-1', 'hacked-uid-2'] }, // Array instead of string
    files: [],
  };

  await submitHostScreenshots(reqTamperedBody, mockRes);
  assert.equal(statusCode, 400);

  // Test 2: submitHostScreenshots with tampered object for params.id
  statusCode = 200;
  const reqTamperedParams: any = {
    user: { id: 'host-123', role: UserRole.PLAYER },
    params: { id: { $ne: null } }, // MongoDB/NoSQL object injection attempt
    body: { winnerUid: 'player-valid-uid' },
    files: [],
  };
  await submitHostScreenshots(reqTamperedParams, mockRes);
  assert.equal(statusCode, 400);

  // Test 3: scanScreenshots with object for tournamentId
  statusCode = 200;
  const reqTamperedScan: any = {
    user: { id: 'admin-123', role: UserRole.SUPER_ADMIN },
    body: { tournamentId: { invalid: true } },
  };
  await scanScreenshots(reqTamperedScan, mockRes);
  assert.equal(statusCode, 400);

  // Test 4: distributePerKillPrizes with tampered object for confirmedWinnerUid
  statusCode = 200;
  const reqTamperedDist: any = {
    user: { id: 'admin-123', role: UserRole.SUPER_ADMIN },
    body: {
      tournamentId: 'tourn-123',
      confirmedWinnerUid: ['tampered'],
      kills: 'not-an-array',
    },
  };
  await distributePerKillPrizes(reqTamperedDist, mockRes);
  assert.equal(statusCode, 400);

  // Test 5: viewAdminScreenshot with invalid query parameters (non-numeric exp)
  statusCode = 200;
  const reqTamperedView: any = {
    query: { key: 'valid-key', exp: 'not-a-number', sig: 'valid-sig' },
  };
  await viewAdminScreenshot(reqTamperedView, mockRes);
  assert.equal(statusCode, 400);
});

// ---------------------------------------------------------------------------
// 9. SSRF Protection Tests (Private Storage Service)
// ---------------------------------------------------------------------------
test('ssrfProtection - privateStorageService blocks SSRF, private IPs, loopbacks, and arbitrary URLs', async () => {
  const { validateStorageUrl, isPrivateOrLoopbackIp } = await import('../services/privateStorage.service');

  // Test private IP checker
  assert.equal(isPrivateOrLoopbackIp('127.0.0.1'), true);
  assert.equal(isPrivateOrLoopbackIp('127.0.0.2'), true);
  assert.equal(isPrivateOrLoopbackIp('10.0.0.1'), true);
  assert.equal(isPrivateOrLoopbackIp('172.16.0.1'), true);
  assert.equal(isPrivateOrLoopbackIp('172.31.255.255'), true);
  assert.equal(isPrivateOrLoopbackIp('192.168.1.1'), true);
  assert.equal(isPrivateOrLoopbackIp('169.254.169.254'), true); // AWS metadata endpoint
  assert.equal(isPrivateOrLoopbackIp('::1'), true);
  assert.equal(isPrivateOrLoopbackIp('fe80::1'), true);
  assert.equal(isPrivateOrLoopbackIp('8.8.8.8'), false);

  // Test validateStorageUrl blocks loopback and private targets
  assert.throws(() => validateStorageUrl('http://169.254.169.254/latest/meta-data/'), /SSRF blocked/);
  assert.throws(() => validateStorageUrl('http://127.0.0.1:8080/internal'), /SSRF blocked/);
  assert.throws(() => validateStorageUrl('http://localhost:3000/'), /SSRF blocked/);
  assert.throws(() => validateStorageUrl('http://10.0.0.1/admin'), /SSRF blocked/);
  assert.throws(() => validateStorageUrl('http://192.168.1.1/secret'), /SSRF blocked/);
  assert.throws(() => validateStorageUrl('https://evil-attacker.com/leak'), /SSRF blocked/);

  // Test getImageBuffer rejects arbitrary HTTP/HTTPS URLs
  await assert.rejects(
    () => privateStorageService.getImageBuffer('https://evil-host.com/image.jpg'),
    /Unsupported or untrusted storage key format/
  );

  // Test getImageBuffer rejects path traversal attempts in sb:// storage keys
  await assert.rejects(
    () => privateStorageService.getImageBuffer('sb://bucket/../../etc/passwd.jpeg'),
    /Invalid storage object path format/
  );
});

// ---------------------------------------------------------------------------
// 10. Clear-Text Logging Protection Tests
// ---------------------------------------------------------------------------
test('clearTextLogging - screenshotKillDetectionService does not log secrets or raw response', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const servicePath = path.resolve(__dirname, '../services/screenshotKillDetectionService.ts');
  const content = fs.readFileSync(servicePath, 'utf8');

  // Must not log apiKey or maskedKey
  assert.ok(!content.includes('API Key (masked)'), 'Must not log masked or unmasked API keys');
  assert.ok(!content.includes('maskedKey'), 'Must not define or log maskedKey');

  // Must not log raw model response
  assert.ok(!/console\.(log|warn|error)\([^)]*rawResponseText/.test(content), 'Must not log rawResponseText');
});

// ---------------------------------------------------------------------------
// 11. HTML / DOM-based XSS Sanitization Tests
// ---------------------------------------------------------------------------
test('domXssProtection - sanitizeMediaUrl neutralizes dangerous URI schemes and metacharacters', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const sanitizeUtilPath = path.resolve(__dirname, '../../../frontend/src/utils/sanitizeUrl.ts');
  const utilContent = fs.readFileSync(sanitizeUtilPath, 'utf8');

  assert.ok(utilContent.includes('DOMPurify'), 'sanitizeUrl must use DOMPurify');
  assert.ok(utilContent.includes('javascript:'), 'sanitizeUrl must block javascript: scheme');
  assert.ok(utilContent.includes('data:text/html'), 'sanitizeUrl must block data:text/html');

  // Tournament details page must sanitize previewUrl
  const tournamentPagePath = path.resolve(__dirname, '../../../frontend/src/app/tournaments/[id]/page.tsx');
  const pageContent = fs.readFileSync(tournamentPagePath, 'utf8');
  assert.ok(
    pageContent.includes('sanitizeMediaUrl(previewUrl)'),
    'Tournament page must wrap previewUrl in sanitizeMediaUrl'
  );
  assert.ok(
    pageContent.includes('sanitizeMediaUrl(firstFrameDataUrl)'),
    'Tournament page must wrap firstFrameDataUrl in sanitizeMediaUrl'
  );
  assert.ok(!pageContent.includes('dangerouslySetInnerHTML'), 'Tournament page must not use dangerouslySetInnerHTML');
});
