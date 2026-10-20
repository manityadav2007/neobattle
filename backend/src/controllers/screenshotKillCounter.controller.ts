import { Response } from 'express';
import multer from 'multer';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { privateStorageService } from '../services/privateStorage.service';
import {
  scanTournamentScreenshots,
  PlayerCandidate,
} from '../services/screenshotKillDetectionService';
import { notificationService } from '../services/notification.service';

// Multer memory storage for 1 to 8 screenshots, max 5 MB each
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 8,
  },
});

export const screenshotUploadMiddleware = upload.array('screenshots', 8);

/**
 * POST /api/results/tournament/:id/submit-screenshots
 * Host-facing endpoint: Upload 1-8 scoreboard screenshots and required Winner UID.
 * No AI runs on host side; no kill results are seen by host.
 */
export async function submitHostScreenshots(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id;
  const hostId = req.user?.id;

  if (!hostId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      entries: {
        include: {
          user: true,
          team: {
            include: {
              members: {
                include: { user: true },
              },
            },
          },
        },
      },
      resultSubmission: true,
    },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  // 1. Permission check: Caller must be the host of this tournament
  const isHost = tournament.creatorId === hostId;
  const isStaff = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
  if (!isHost && !isStaff) {
    res.status(403).json({ success: false, message: 'Only the tournament host can submit match results' });
    return;
  }

  // 2. Format check: Only for PER_KILL tournaments
  if (tournament.tournamentFormat !== 'PER_KILL') {
    res.status(400).json({ success: false, message: 'Screenshot kill counter is only for PER_KILL tournaments' });
    return;
  }

  // 3. Status check: Disallow re-submitting if already approved/paid
  if (tournament.status === TournamentStatus.PAID || tournament.resultSubmission?.status === 'APPROVED') {
    res.status(400).json({ success: false, message: 'Tournament results have already been approved and paid' });
    return;
  }

  // 4. Winner UID check (required and must belong to a registered player)
  const winnerUid = String(req.body.winnerUid || '').trim();
  if (!winnerUid) {
    res.status(400).json({ success: false, message: 'Winner UID is required' });
    return;
  }

  const registeredPlayerUids = new Set<string>();
  for (const entry of tournament.entries) {
    if (entry.user) {
      if (entry.user.freeFireId) registeredPlayerUids.add(entry.user.freeFireId.trim());
      if (entry.user.uid) registeredPlayerUids.add(entry.user.uid.trim());
    }
    if (entry.team?.members) {
      for (const m of entry.team.members) {
        if (m.user?.freeFireId) registeredPlayerUids.add(m.user.freeFireId.trim());
        if (m.user?.uid) registeredPlayerUids.add(m.user.uid.trim());
      }
    }
  }

  if (!registeredPlayerUids.has(winnerUid)) {
    res.status(400).json({
      success: false,
      message: `Winner UID "${winnerUid}" does not belong to any player registered in this tournament.`,
    });
    return;
  }

  // 5. File upload validation (1 to 8 images, max 5MB, genuine magic bytes)
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    res.status(400).json({ success: false, message: 'Please upload at least 1 match screenshot' });
    return;
  }
  if (files.length > 8) {
    res.status(400).json({ success: false, message: 'Maximum 8 screenshots allowed per submission' });
    return;
  }

  const processedImages: Array<{ buffer: Buffer; format: 'jpeg' | 'png' | 'webp'; hash: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 5 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        message: `Screenshot #${i + 1} (${file.originalname}) exceeds the 5MB size limit`,
      });
      return;
    }

    const magicCheck = privateStorageService.validateImageMagicBytes(file.buffer);
    if (!magicCheck.valid) {
      res.status(400).json({
        success: false,
        message: `Screenshot #${i + 1} (${file.originalname}) has invalid file content. Only genuine JPG, PNG, and WebP are allowed.`,
      });
      return;
    }

    // Strip EXIF metadata cleanly
    const sanitized = await privateStorageService.stripExifAndSanitize(file.buffer);
    const hash = privateStorageService.computeSha256(sanitized.buffer);

    // Reject screenshot if hash is already used in ANY tournament
    const existingHash = await prisma.screenshotHash.findUnique({
      where: { hash },
    });

    if (existingHash && existingHash.tournamentId !== tournament.id) {
      res.status(400).json({
        success: false,
        message: `Screenshot #${i + 1} has already been submitted in another tournament. Duplicate proof is rejected.`,
      });
      return;
    }

    processedImages.push({ buffer: sanitized.buffer, format: sanitized.format, hash });
  }

  // 6. Upload processed images to private storage
  const storageKeys: string[] = [];
  for (const img of processedImages) {
    const stored = await privateStorageService.uploadTournamentScreenshot(img.buffer, tournament.id, img.format);
    storageKeys.push(stored.storageKey);
  }

  // 7. Store in DB inside a single atomic transaction
  await prisma.$transaction(async (tx) => {
    // Upsert ResultSubmission: One active submission per tournament (status: PENDING, pays nothing)
    await tx.resultSubmission.upsert({
      where: { tournamentId: tournament.id },
      create: {
        tournamentId: tournament.id,
        hostId: tournament.creatorId,
        firstUid: winnerUid,
        screenshotUrls: storageKeys,
        status: 'PENDING',
        killList: null, // Host sees NO kills
      },
      update: {
        firstUid: winnerUid,
        screenshotUrls: storageKeys,
        status: 'PENDING',
        killList: null,
        rejectionReason: null,
      },
    });

    // Save screenshot hashes for duplicate rejection
    for (let i = 0; i < processedImages.length; i++) {
      const img = processedImages[i];
      const storageKey = storageKeys[i];
      await tx.screenshotHash.upsert({
        where: { hash: img.hash },
        create: {
          hash: img.hash,
          tournamentId: tournament.id,
          uploadedById: hostId,
          storageKey,
        },
        update: {
          tournamentId: tournament.id,
          storageKey,
        },
      });
    }
  });

  res.json({
    success: true,
    message: 'Match screenshots submitted successfully. Your submission is now pending admin review.',
  });
}

/**
 * GET /api/admin/kill-counter/tournament/:id/screenshot-data
 * Admin-only: Fetch tournament details, registered player roster, host-given Winner UID, and host screenshots.
 */
export async function getTournamentScreenshotData(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      creator: { select: { id: true, username: true } },
      resultSubmission: true,
      entries: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              inGameNickname: true,
              ign: true,
              freeFireId: true,
              gameLevel: true,
              isVerified: true,
            },
          },
          team: {
            include: {
              leader: { select: { id: true, username: true } },
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      inGameNickname: true,
                      ign: true,
                      freeFireId: true,
                      gameLevel: true,
                      isVerified: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  // Build candidate roster
  const candidateMap = new Map<string, PlayerCandidate>();
  const teamsMap = new Map<string, any>();

  for (const entry of tournament.entries) {
    if (entry.user) {
      candidateMap.set(entry.user.id, {
        id: entry.user.id,
        inGameNickname: entry.user.inGameNickname,
        ign: entry.user.ign,
        username: entry.user.username,
        freeFireId: entry.user.freeFireId,
        teamId: entry.teamId || null,
        teamName: entry.team?.name || null,
        teamTag: entry.team?.tag || null,
      });
    }

    if (entry.team) {
      teamsMap.set(entry.team.id, {
        id: entry.team.id,
        name: entry.team.name,
        tag: entry.team.tag,
        members: entry.team.members.map((m) => ({
          id: m.id,
          role: m.role,
          user: m.user,
        })),
      });

      for (const m of entry.team.members) {
        if (m.user) {
          candidateMap.set(m.user.id, {
            id: m.user.id,
            inGameNickname: m.user.inGameNickname,
            ign: m.user.ign,
            username: m.user.username,
            freeFireId: m.user.freeFireId,
            teamId: entry.team.id,
            teamName: entry.team.name,
            teamTag: entry.team.tag,
          });
        }
      }
    }
  }

  // Generate short-lived signed URLs for host screenshots
  const rawUrls = (tournament.resultSubmission?.screenshotUrls as string[]) || [];
  const signedScreenshots: Array<{ storageKey: string; signedUrl: string }> = [];

  for (const key of rawUrls) {
    const signedUrl = await privateStorageService.getAdminSignedUrl(key, 900);
    signedScreenshots.push({ storageKey: key, signedUrl });
  }

  res.json({
    success: true,
    data: {
      tournament: {
        id: tournament.id,
        uid: tournament.uid,
        title: tournament.title,
        format: tournament.format,
        gameMode: tournament.gameMode,
        tournamentFormat: tournament.tournamentFormat,
        perKillRate: tournament.perKillRate ? Number(tournament.perKillRate) : 0,
        booyahPrize: tournament.booyahPrize ? Number(tournament.booyahPrize) : 0,
        entryFee: Number(tournament.entryFee),
        prizePool: Number(tournament.prizePool),
        maxParticipants: tournament.maxParticipants,
        hostCommission: Number(tournament.hostCommission),
        platformCommission: Number(tournament.platformCommission),
        status: tournament.status,
        creator: tournament.creator,
      },
      submission: tournament.resultSubmission
        ? {
            id: tournament.resultSubmission.id,
            status: tournament.resultSubmission.status,
            firstUid: tournament.resultSubmission.firstUid,
            submittedAt: tournament.resultSubmission.createdAt,
            screenshotCount: signedScreenshots.length,
          }
        : null,
      screenshots: signedScreenshots,
      candidates: Array.from(candidateMap.values()),
      teams: Array.from(teamsMap.values()),
    },
  });
}

/**
 * POST /api/admin/kill-counter/scan-screenshots
 * Admin-only: Send loaded screenshots to Gemini AI, extract scoreboard rows,
 * normalize names and fuzzy-match to registered players.
 */
export async function scanScreenshots(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { tournamentId, storageKeys } = req.body;

  if (!tournamentId) {
    res.status(400).json({ success: false, message: 'Tournament ID is required' });
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      entries: {
        include: {
          user: true,
          team: {
            include: {
              members: {
                include: { user: true },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  // Extract candidate players
  const candidateMap = new Map<string, PlayerCandidate>();
  for (const entry of tournament.entries) {
    if (entry.user) {
      candidateMap.set(entry.user.id, {
        id: entry.user.id,
        inGameNickname: entry.user.inGameNickname,
        ign: entry.user.ign,
        username: entry.user.username,
        freeFireId: entry.user.freeFireId,
        teamId: entry.teamId || null,
        teamName: entry.team?.name || null,
        teamTag: entry.team?.tag || null,
      });
    }
    if (entry.team?.members) {
      for (const m of entry.team.members) {
        if (m.user) {
          candidateMap.set(m.user.id, {
            id: m.user.id,
            inGameNickname: m.user.inGameNickname,
            ign: m.user.ign,
            username: m.user.username,
            freeFireId: m.user.freeFireId,
            teamId: entry.team.id,
            teamName: entry.team.name,
            teamTag: entry.team.tag,
          });
        }
      }
    }
  }

  const candidates = Array.from(candidateMap.values());

  // Collect screenshot sources from storage keys and/or newly uploaded files
  const sources: Array<{ storageKey?: string; buffer?: Buffer; format?: string }> = [];

  if (Array.isArray(storageKeys)) {
    for (const key of storageKeys) {
      if (typeof key === 'string' && key.trim()) {
        sources.push({ storageKey: key.trim() });
      }
    }
  }

  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  for (const f of uploadedFiles) {
    const magicCheck = privateStorageService.validateImageMagicBytes(f.buffer);
    if (magicCheck.valid && magicCheck.format) {
      const sanitized = await privateStorageService.stripExifAndSanitize(f.buffer);
      const stored = await privateStorageService.uploadTournamentScreenshot(sanitized.buffer, tournamentId, sanitized.format);
      sources.push({ storageKey: stored.storageKey });
    }
  }

  if (sources.length === 0) {
    res.status(400).json({ success: false, message: 'No valid screenshots provided to scan' });
    return;
  }

  try {
    const scanResult = await scanTournamentScreenshots(sources, candidates);
    res.json({ success: true, data: scanResult });
  } catch (err: any) {
    console.error('[Admin] scanScreenshots error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to scan screenshots with Gemini AI',
    });
  }
}

/**
 * POST /api/admin/kill-counter/distribute-per-kill
 * Admin-only: Atomically distribute per-kill prizes, booyah prize, host commission, and platform commission.
 * Uses atomic row locks, idempotency checks, and creates an audit log.
 */
export async function distributePerKillPrizes(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { tournamentId, confirmedWinnerUid, kills } = req.body;
  const adminId = req.user?.id;

  if (!adminId) {
    res.status(401).json({ success: false, message: 'Admin authentication required' });
    return;
  }

  if (!tournamentId) {
    res.status(400).json({ success: false, message: 'Tournament ID is required' });
    return;
  }

  if (!confirmedWinnerUid) {
    res.status(400).json({ success: false, message: 'Confirmed Winner UID is required' });
    return;
  }

  if (!Array.isArray(kills)) {
    res.status(400).json({ success: false, message: 'Kills list must be an array' });
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      resultSubmission: true,
      entries: {
        include: {
          user: true,
          team: {
            include: {
              members: {
                include: { user: true },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.tournamentFormat !== 'PER_KILL') {
    res.status(400).json({ success: false, message: 'This distribution endpoint is only for PER_KILL tournaments' });
    return;
  }

  if (tournament.status === TournamentStatus.PAID) {
    res.status(400).json({ success: false, message: 'Prizes for this tournament have already been distributed' });
    return;
  }

  // Map registered players
  const registeredPlayerMap = new Map<string, { userId: string; username: string; freeFireId: string }>();
  for (const entry of tournament.entries) {
    if (entry.user) {
      registeredPlayerMap.set(entry.user.id, {
        userId: entry.user.id,
        username: entry.user.username,
        freeFireId: entry.user.freeFireId || '',
      });
      if (entry.user.freeFireId) {
        registeredPlayerMap.set(entry.user.freeFireId, {
          userId: entry.user.id,
          username: entry.user.username,
          freeFireId: entry.user.freeFireId,
        });
      }
    }
    if (entry.team?.members) {
      for (const m of entry.team.members) {
        if (m.user) {
          registeredPlayerMap.set(m.user.id, {
            userId: m.user.id,
            username: m.user.username,
            freeFireId: m.user.freeFireId || '',
          });
          if (m.user.freeFireId) {
            registeredPlayerMap.set(m.user.freeFireId, {
              userId: m.user.id,
              username: m.user.username,
              freeFireId: m.user.freeFireId,
            });
          }
        }
      }
    }
  }

  // Find winner
  const winnerInfo = registeredPlayerMap.get(confirmedWinnerUid);
  if (!winnerInfo) {
    res.status(400).json({
      success: false,
      message: `Confirmed Winner UID "${confirmedWinnerUid}" is not registered in this tournament`,
    });
    return;
  }

  const perKillRate = Number(tournament.perKillRate) || 0;
  const booyahPrize = Number(tournament.booyahPrize) || 0;

  // Calculate payouts for registered players
  const playerPayouts: Array<{
    userId: string;
    username: string;
    kills: number;
    killPrize: number;
    booyahPrize: number;
    totalAmount: number;
  }> = [];

  let totalKillsAwarded = 0;
  let totalPrizeAwarded = 0;

  for (const k of kills) {
    const pId = String(k.playerId || '');
    const killCount = Math.max(0, parseInt(k.kills, 10) || 0);
    const reg = registeredPlayerMap.get(pId);

    if (reg) {
      const isWinner = reg.userId === winnerInfo.userId;
      const killPrize = killCount * perKillRate;
      const booyah = isWinner ? booyahPrize : 0;
      const totalAmount = killPrize + booyah;

      totalKillsAwarded += killCount;
      totalPrizeAwarded += totalAmount;

      playerPayouts.push({
        userId: reg.userId,
        username: reg.username,
        kills: killCount,
        killPrize,
        booyahPrize: booyah,
        totalAmount,
      });
    }
  }

  // Ensure winner is in playerPayouts even if 0 kills
  if (!playerPayouts.some((p) => p.userId === winnerInfo.userId)) {
    totalPrizeAwarded += booyahPrize;
    playerPayouts.push({
      userId: winnerInfo.userId,
      username: winnerInfo.username,
      kills: 0,
      killPrize: 0,
      booyahPrize,
      totalAmount: booyahPrize,
    });
  }

  // Commission calculations (reusing existing platform logic)
  const hostAmount = Math.round(Number(tournament.hostCommission) || 0);
  const totalCollection = Math.round(Number(tournament.entryFee) * tournament.maxParticipants);
  const platformAmount =
    totalCollection > 0
      ? Math.max(0, totalCollection - hostAmount - totalPrizeAwarded)
      : Math.round(Number(tournament.platformCommission) || 0);

  const adminUser = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  const adminWallet = adminUser ? await prisma.wallet.findUnique({ where: { userId: adminUser.id } }) : null;
  const hostWallet = await prisma.wallet.findUnique({ where: { userId: tournament.creatorId } });

  // Execute atomic payout in a single database transaction with row locks
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Atomic status transition - prevents concurrent double payouts
      const tTransition = await tx.tournament.updateMany({
        where: {
          id: tournament.id,
          status: { not: TournamentStatus.PAID },
        },
        data: {
          status: TournamentStatus.PAID,
          finalKillList: playerPayouts as any,
        },
      });

      if (tTransition.count === 0) {
        throw new Error('Tournament prizes have already been distributed');
      }

      // Update submission status to APPROVED
      if (tournament.resultSubmission) {
        const subTransition = await tx.resultSubmission.updateMany({
          where: {
            id: tournament.resultSubmission.id,
            status: { not: 'APPROVED' },
          },
          data: {
            status: 'APPROVED',
            reviewedBy: adminId,
            reviewedAt: new Date(),
            killList: playerPayouts as any,
          },
        });

        if (subTransition.count === 0) {
          throw new Error('Result submission has already been approved');
        }
      }

      // 2. Credit player prizes (kills + booyah)
      for (const p of playerPayouts) {
        if (p.totalAmount > 0) {
          const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
          if (!wallet) throw new Error(`Wallet not found for player ${p.username}`);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: p.totalAmount } },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              userId: p.userId,
              type: TransactionType.PRIZE,
              status: TransactionStatus.COMPLETED,
              amount: new Decimal(p.totalAmount),
              description: `Per-Kill prize (${p.kills} kill(s)${p.booyahPrize > 0 ? ' + Booyah' : ''}) — ${tournament.title}`,
              reference: `PERKILL-${tournament.id.slice(0, 8)}-${p.userId.slice(-4)}`,
            },
          });
        }
      }

      // 3. Credit Host Commission
      if (hostAmount > 0 && hostWallet) {
        await tx.wallet.update({
          where: { id: hostWallet.id },
          data: { balance: { increment: hostAmount } },
        });

        await tx.transaction.create({
          data: {
            walletId: hostWallet.id,
            userId: tournament.creatorId,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(hostAmount),
            description: `Host commission — ${tournament.title}`,
            reference: `HOSTCOMM-${tournament.id.slice(0, 8)}`,
          },
        });
      }

      // 4. Credit Platform Commission
      if (platformAmount > 0 && adminWallet && adminUser) {
        await tx.wallet.update({
          where: { id: adminWallet.id },
          data: { balance: { increment: platformAmount } },
        });

        await tx.transaction.create({
          data: {
            walletId: adminWallet.id,
            userId: adminUser.id,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(platformAmount),
            description: `Platform commission — ${tournament.title}`,
            reference: `PLATCOMM-${tournament.id.slice(0, 8)}`,
          },
        });
      }

      // 5. Write Audit Log
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'DISTRIBUTE_PER_KILL_PRIZES',
          targetId: tournament.id,
          details: {
            adminUsername: req.user?.username,
            winnerUid: confirmedWinnerUid,
            totalKills: totalKillsAwarded,
            totalPrize: totalPrizeAwarded,
            hostCommission: hostAmount,
            platformCommission: platformAmount,
            playerPayouts,
            distributedAt: new Date().toISOString(),
          },
        },
      });
    });

    // Notify winner and host
    notificationService.notifyWinnerPayout(winnerInfo.userId, tournament.title, booyahPrize, 'Booyah Champion').catch((err) => {
      console.error('[Notification] Failed to notify champion:', err);
    });

    if (hostAmount > 0) {
      notificationService.notifyHostCommission(tournament.creatorId, tournament.title, hostAmount).catch((err) => {
        console.error('[Notification] Failed to notify host commission:', err);
      });
    }

    res.json({
      success: true,
      message: `Prizes successfully distributed: ₹${totalPrizeAwarded} to players, ₹${hostAmount} to host, ₹${platformAmount} to platform revenue.`,
      data: {
        totalKills: totalKillsAwarded,
        totalPrize: totalPrizeAwarded,
        hostCommission: hostAmount,
        platformCommission: platformAmount,
        winner: winnerInfo.username,
      },
    });
  } catch (txErr: any) {
    console.error('[Admin] distributePerKillPrizes error:', txErr);
    res.status(400).json({
      success: false,
      message: txErr.message || 'Prize distribution failed — no changes were saved.',
    });
  }
}

/**
 * GET /api/admin/kill-counter/screenshot/view
 * Admin-only: Stream an in-memory or private storage screenshot.
 */
export async function viewAdminScreenshot(req: any, res: Response): Promise<void> {
  const { key, exp, sig } = req.query;

  if (!key || typeof key !== 'string') {
    res.status(400).send('Key is required');
    return;
  }

  try {
    const img = privateStorageService.getFallbackImage(key, parseInt(exp as string, 10), sig as string);
    if (!img) {
      res.status(404).send('Screenshot expired or signature invalid');
      return;
    }

    res.setHeader('Content-Type', img.contentType);
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.send(img.buffer);
  } catch (err: any) {
    res.status(500).send('Failed to serve screenshot');
  }
}
