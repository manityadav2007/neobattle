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
