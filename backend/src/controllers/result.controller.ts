import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { notificationService } from '../services/notification.service';
import { detectKillsForTestFeed } from '../services/killDetectionService';
import { findBestPlayerMatch, PlayerCandidate } from '../utils/stringSimilarity';

const resultUploadDir = path.join(process.cwd(), 'uploads', 'kill-counter');
if (!fs.existsSync(resultUploadDir)) {
  fs.mkdirSync(resultUploadDir, { recursive: true });
}

const resultVideoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, resultUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `result-${uuidv4().slice(0, 8)}-${Date.now()}${ext}`);
  },
});

const resultVideoFilter = (_req: any, file: any, cb: any) => {
  const allowed = /\.(mp4|mkv|mov|webm|avi|jpg|jpeg|png|webp)$/i;
  if (allowed.test(file.originalname) || file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files or images are allowed'));
  }
};

const resultUpload = multer({
  storage: resultVideoStorage,
  fileFilter: resultVideoFilter,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

export const uploadResultVideoMiddleware = (req: any, res: any, next: any) => {
  resultUpload(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
    }
    if (req.files) {
      if (req.files.video?.[0]) {
        req.file = req.files.video[0];
      } else if (req.files.file?.[0]) {
        req.file = req.files.file[0];
      }
    }
    next();
  });
};

interface ResolvedWinner {
  placement: number;
  label: string;
  amount: number;
  userId: string;
  username: string;
}

async function resolveWinners(tournament: {
  id: string;
  format: string;
  prizeFirst: Decimal;
  prizeSecond: Decimal | null;
  prizeThird: Decimal | null;
}, firstUid: string, secondUid: string | null, thirdUid: string | null): Promise<ResolvedWinner[]> {
  const isTeam = tournament.format === 'DUO' || tournament.format === 'SQUAD';
  const candidates = [
    { placement: 1, label: isTeam ? '1st Winning Team' : '1st Place', amount: Math.max(0, Number(tournament.prizeFirst) || 0), uid: firstUid?.trim() },
    { placement: 2, label: isTeam ? '2nd Winning Team' : '2nd Place', amount: Math.max(0, Number(tournament.prizeSecond) || 0), uid: secondUid?.trim() || null },
    { placement: 3, label: isTeam ? '3rd Winning Team' : '3rd Place', amount: Math.max(0, Number(tournament.prizeThird) || 0), uid: thirdUid?.trim() || null },
  ].filter((c) => Boolean(c.uid));

  const resolved: ResolvedWinner[] = [];

  for (const c of candidates) {
    const rawVal = c.uid!;
    const cleanTag = rawVal.replace(/^[\[\(<]+|[\]\)>]+$/g, '').trim();

    const entry = await prisma.tournamentEntry.findFirst({
      where: {
        tournamentId: tournament.id,
        OR: [
          { team: { tag: { equals: cleanTag, mode: 'insensitive' } } },
          { team: { tag: { equals: rawVal, mode: 'insensitive' } } },
          { team: { name: { equals: rawVal, mode: 'insensitive' } } },
          { team: { name: { equals: cleanTag, mode: 'insensitive' } } },
          { user: { freeFireId: rawVal } },
          { user: { freeFireUid: rawVal } },
          { team: { members: { some: { user: { freeFireId: rawVal } } } } },
          { team: { members: { some: { user: { freeFireUid: rawVal } } } } },
        ],
      },
      include: {
        user: { select: { id: true, username: true, freeFireId: true } },
        team: {
          include: {
            leader: { select: { id: true, username: true, freeFireId: true } },
            members: {
              include: {
                user: { select: { id: true, username: true, freeFireId: true } },
              },
            },
          },
        },
      },
    });

    if (!entry) {
      throw new Error(
        `${c.label}: "${rawVal}" is not a registered ${isTeam ? 'team tag or participant' : 'Free Fire UID'} in this tournament.`
      );
    }

    const teamLeader = entry.user || entry.team?.leader || entry.team?.members.find((m) => m.role === 'LEADER')?.user || entry.team?.members[0]?.user;
    if (entry.team && teamLeader) {
      // Duo/Squad registration: full placement prize credited exclusively to captain/leader's wallet
      resolved.push({
        placement: c.placement,
        label: `${c.label} (${entry.team.name || entry.team.tag || 'Team'})`,
        amount: c.amount,
        userId: teamLeader.id,
        username: teamLeader.username,
      });
    } else if (entry.user) {
      resolved.push({
        placement: c.placement,
        label: c.label,
        amount: c.amount,
        userId: entry.user.id,
        username: entry.user.username,
      });
    } else {
      throw new Error(`${c.label}: Registered entry has no associated user or team leader.`);
    }
  }

  return resolved;
}

/**
 * POST /api/results/tournament/:id/process-ai
 * Accepts host gameplay video, detects kill feed with AI vision/OCR,
 * matches killers with registered roster candidates, and returns aggregated kills-per-player.
 */
export async function processAiVideo(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id;
  const hostId = req.user!.id;
  const file = req.file;

  if (!file) {
    res.status(400).json({
      success: false,
      message: 'No video file uploaded. Please upload a gameplay video recording (.mp4, .mkv, .mov, .webm).',
    });
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      entries: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              ign: true,
              inGameNickname: true,
              freeFireId: true,
              gameLevel: true,
            },
          },
          team: {
            include: {
              leader: {
                select: {
                  id: true,
                  username: true,
                  ign: true,
                  inGameNickname: true,
                  freeFireId: true,
                  gameLevel: true,
                },
              },
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      ign: true,
                      inGameNickname: true,
                      freeFireId: true,
                      gameLevel: true,
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

  if (tournament.creatorId !== hostId && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Only the tournament host can run AI kill counter' });
    return;
  }

  if (tournament.status !== TournamentStatus.COMPLETED && tournament.status !== TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Tournament must be active or completed to process video' });
    return;
  }

  // Flatten registered roster candidates (Solo users + Team members)
  const playerCandidates: PlayerCandidate[] = [];
  const playerMap = new Map<string, {
    id: string;
    username: string;
    ign: string | null;
    inGameNickname: string | null;
    freeFireId: string | null;
    teamName: string | null;
  }>();

  for (const entry of tournament.entries) {
    if (entry.user) {
      playerCandidates.push({
        id: entry.user.id,
        username: entry.user.username,
        ign: entry.user.ign,
        inGameNickname: entry.user.inGameNickname,
        freeFireId: entry.user.freeFireId,
        gameLevel: entry.user.gameLevel,
      });
      playerMap.set(entry.user.id, {
        id: entry.user.id,
        username: entry.user.username,
        ign: entry.user.ign,
        inGameNickname: entry.user.inGameNickname,
        freeFireId: entry.user.freeFireId,
        teamName: null,
      });
    } else if (entry.team) {
      const team = entry.team;
      const allMembers = [
        ...(team.leader ? [{ user: team.leader }] : []),
        ...(team.members || []),
      ];
      for (const m of allMembers) {
        if (!m.user || playerMap.has(m.user.id)) continue;
        playerCandidates.push({
          id: m.user.id,
          username: m.user.username,
          ign: m.user.ign,
          inGameNickname: m.user.inGameNickname,
          freeFireId: m.user.freeFireId,
          gameLevel: m.user.gameLevel,
          teamId: team.id,
          teamName: team.name,
          teamTag: team.tag,
        });
        playerMap.set(m.user.id, {
          id: m.user.id,
          username: m.user.username,
          ign: m.user.ign,
          inGameNickname: m.user.inGameNickname,
          freeFireId: m.user.freeFireId,
          teamName: team.name || team.tag,
        });
      }
    }
  }

  const startTime = Date.now();
  const videoPath = file.path;
  const relativeVideoUrl = `/uploads/kill-counter/${path.basename(file.path)}`;

  try {
    const aiResult = await detectKillsForTestFeed(videoPath);
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    const killsCountMap = new Map<string, { kills: number; details: any[] }>();
    for (const p of playerCandidates) {
      killsCountMap.set(p.id, { kills: 0, details: [] });
    }

    const unmatchedDetections: any[] = [];

    for (const rawKill of aiResult.kills) {
      const match = findBestPlayerMatch(rawKill.killer, playerCandidates);
      if (match.matched && match.player) {
        const current = killsCountMap.get(match.player.id) || { kills: 0, details: [] };
        current.kills += 1;
        current.details.push({
          killerDetected: rawKill.killer,
          victim: rawKill.victim,
          weapon: rawKill.weapon,
          timestamp: rawKill.timestamp,
          formattedTime: rawKill.formattedTime,
          confidence: match.confidence,
          similarityScore: match.score,
        });
        killsCountMap.set(match.player.id, current);
      } else {
        unmatchedDetections.push({
          ...rawKill,
          unmatchedReason: 'No matching participant IGN found in roster',
        });
      }
    }

    const perKillRate = Number(tournament.perKillRate) || 0;
    const booyahPrize = Number(tournament.booyahPrize) || 0;

    const killsPerPlayer = Array.from(playerMap.values()).map((p) => {
      const stats = killsCountMap.get(p.id) || { kills: 0, details: [] };
      return {
        userId: p.id,
        username: p.username,
        ign: p.inGameNickname || p.ign || p.username,
        freeFireId: p.freeFireId,
        teamName: p.teamName,
        kills: stats.kills,
        isBooyah: false,
        perKillRate,
        calculatedPrize: stats.kills * perKillRate,
        killDetails: stats.details,
      };
    }).sort((a, b) => b.kills - a.kills);

    res.json({
      success: true,
      message: `AI analysis finished in ${durationSeconds}s. Found ${aiResult.totalKillsFound} kill event(s).`,
      data: {
        totalKillsFound: aiResult.totalKillsFound,
        videoUrl: relativeVideoUrl,
        videoDetails: {
          fileName: file.originalname,
          fileSize: file.size,
          durationSeconds,
          framesAnalyzed: aiResult.framesAnalyzed,
        },
        killsPerPlayer,
        unmatchedDetections,
        rawDetections: aiResult.kills,
        perKillRate,
        booyahPrize,
      },
    });
  } catch (err: any) {
    console.error('[ProcessAiVideo] Error analyzing video:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to process gameplay video with AI Kill Counter',
    });
  }
}

export async function submitResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id ?? req.body.tournamentId;
  const { firstUid, secondUid, thirdUid, screenshotUrl, videoUrl, killList, booyahUid } = req.body;
  const hostId = req.user!.id;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { entries: { select: { userId: true } } },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }
  if (tournament.creatorId !== hostId && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Only the tournament host can submit results' });
    return;
  }
  const existing = await prisma.resultSubmission.findUnique({ where: { tournamentId } });
  if (existing && existing.status === 'PENDING') {
    res.status(409).json({ success: false, message: 'Results for this tournament are already pending admin review' });
    return;
  }
  if (tournament.status === TournamentStatus.PAID || (existing && existing.status === 'APPROVED')) {
    res.status(400).json({ success: false, message: 'Prizes were already distributed for this tournament' });
    return;
  }
  if (tournament.status !== TournamentStatus.COMPLETED && tournament.status !== TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Results can be submitted once the tournament has started/ended' });
    return;
  }

  const isPerKill = tournament.tournamentFormat === 'PER_KILL';

  if (isPerKill) {
    if (!killList || !Array.isArray(killList) || killList.length === 0) {
      res.status(400).json({ success: false, message: 'A valid kills list is required for Per-Kill tournaments' });
      return;
    }
    if (!screenshotUrl && !videoUrl) {
      res.status(400).json({ success: false, message: 'Gameplay video or screenshot proof is required' });
      return;
    }

    const submission = existing
      ? await prisma.resultSubmission.update({
          where: { id: existing.id },
          data: {
            hostId,
            firstUid: booyahUid?.trim() || firstUid?.trim() || null,
            screenshotUrl: screenshotUrl || null,
            videoUrl: videoUrl || null,
            killList,
            status: 'PENDING',
            rejectionReason: null,
            reviewedBy: null,
            reviewedAt: null,
          },
        })
      : await prisma.resultSubmission.create({
          data: {
            tournamentId,
            hostId,
            firstUid: booyahUid?.trim() || firstUid?.trim() || null,
            screenshotUrl: screenshotUrl || null,
            videoUrl: videoUrl || null,
            killList,
            status: 'PENDING',
          },
        });

    res.status(existing ? 200 : 201).json({
      success: true,
      data: submission,
      message: 'Per-Kill AI results submitted — awaiting admin approval & payout',
    });
    return;
  }

  // PLACEMENT tournament branch
  if (!firstUid?.trim() || !screenshotUrl) {
    res.status(400).json({ success: false, message: "1st place identifier (Team Tag or UID) and proof screenshot are required" });
    return;
  }

  try {
    await resolveWinners(tournament as any, firstUid, secondUid ?? null, thirdUid ?? null);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  const submission = existing
    ? await prisma.resultSubmission.update({
        where: { id: existing.id },
        data: {
          hostId,
          firstUid: firstUid.trim(),
          secondUid: secondUid?.trim() || null,
          thirdUid: thirdUid?.trim() || null,
          screenshotUrl,
          videoUrl: videoUrl || null,
          killList: null,
          status: 'PENDING',
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      })
    : await prisma.resultSubmission.create({
        data: {
          tournamentId,
          hostId,
          firstUid: firstUid.trim(),
          secondUid: secondUid?.trim() || null,
          thirdUid: thirdUid?.trim() || null,
          screenshotUrl,
          videoUrl: videoUrl || null,
          killList: null,
          status: 'PENDING',
        },
      });

  res.status(existing ? 200 : 201).json({
    success: true,
    data: submission,
    message: 'Results submitted — awaiting admin approval & payout',
  });
}

export async function listMyResultSubmissions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const subs = await prisma.resultSubmission.findMany({
    where: { hostId: req.user!.id },
    include: { tournament: { select: { id: true, title: true, uid: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: subs });
}

export async function listPendingResults(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const subs = await prisma.resultSubmission.findMany({
    where: { status: 'PENDING' },
    include: {
      host: { select: { id: true, username: true, email: true } },
      tournament: {
        select: {
          id: true, uid: true, title: true, status: true, format: true, tournamentFormat: true, gameMode: true, entryFee: true, prizePool: true,
          prizeFirst: true, prizeSecond: true, prizeThird: true,
          perKillRate: true, booyahPrize: true, finalKillList: true,
          platformCommission: true, hostCommission: true, maxParticipants: true,
          creator: { select: { id: true, username: true } },
          entries: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  ign: true,
                  inGameNickname: true,
                  freeFireId: true,
                  gameLevel: true,
                },
              },
              team: {
                select: {
                  id: true,
                  name: true,
                  tag: true,
                  leaderId: true,
                  members: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          username: true,
                          ign: true,
                          inGameNickname: true,
                          freeFireId: true,
                          gameLevel: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { registeredAt: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    success: true,
    data: subs.map((s) => ({
      ...s,
      killList: s.killList,
      videoUrl: s.videoUrl,
      participants: s.tournament.entries.map((e) => ({
        userId: e.user?.id,
        uid: e.user?.freeFireId,
        username: e.user?.username,
        ign: e.user?.inGameNickname || e.user?.ign,
        level: e.user?.gameLevel,
        team: e.team,
      })),
      teams: s.tournament.entries
        .filter((e) => Boolean(e.team))
        .map((e) => e.team),
    })),
  });
}

export async function reviewResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { action, rejectionReason } = req.body;
  const submissionId = req.params.id;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    res.status(400).json({ success: false, message: 'action must be APPROVE or REJECT' });
    return;
  }

  const submission = await prisma.resultSubmission.findUnique({
    where: { id: submissionId },
    include: { tournament: true },
  });

  if (!submission) {
    res.status(404).json({ success: false, message: 'Result submission not found' });
    return;
  }
  if (submission.status !== 'PENDING') {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  if (action === 'REJECT') {
    if (!rejectionReason?.trim()) {
      res.status(400).json({ success: false, message: 'Rejection reason is required' });
      return;
    }
    await prisma.resultSubmission.update({
      where: { id: submissionId },
      data: { status: 'REJECTED', rejectionReason: rejectionReason.trim(), reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    res.json({ success: true, message: 'Result rejected — host can edit and resubmit' });
    return;
  }

  // APPROVE → resolve winners and atomically distribute payouts
  const t = submission.tournament;
  if (t.status === TournamentStatus.PAID) {
    res.status(400).json({ success: false, message: 'Prizes already distributed for this tournament' });
    return;
  }
  if (t.status !== TournamentStatus.COMPLETED && t.status !== TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Tournament must be active or completed before approving payouts' });
    return;
  }

  // Handle PER_KILL tournament approval
  if (t.tournamentFormat === 'PER_KILL') {
    const rawKillList: any[] = Array.isArray(submission.killList) ? (submission.killList as any[]) : [];
    if (rawKillList.length === 0) {
      res.status(400).json({ success: false, message: 'No kills data found on this submission' });
      return;
    }

    const perKillRate = Number(t.perKillRate) || 0;
    const booyahPrize = Number(t.booyahPrize) || 0;

    const allEntries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: t.id },
      include: {
        user: { select: { id: true, username: true, freeFireId: true } },
        team: {
          include: {
            leader: { select: { id: true, username: true, freeFireId: true } },
            members: { include: { user: { select: { id: true, username: true, freeFireId: true } } } },
          },
        },
      },
    });

    const participantMap = new Map<string, { id: string; username: string; freeFireId: string | null }>();
    for (const e of allEntries) {
      if (e.user) {
        participantMap.set(e.user.id, e.user);
      }
      if (e.team) {
        if (e.team.leader) participantMap.set(e.team.leader.id, e.team.leader);
        for (const m of e.team.members) {
          if (m.user) participantMap.set(m.user.id, m.user);
        }
      }
    }

    interface PerKillPayout {
      userId: string;
      username: string;
      kills: number;
      isBooyah: boolean;
      payoutAmount: number;
    }

    const payouts: PerKillPayout[] = [];
    let totalPrize = 0;

    for (const item of rawKillList) {
      const u = participantMap.get(item.userId);
      if (!u) continue;
      const kills = Math.max(0, Number(item.kills) || 0);
      const isBooyah = Boolean(
        item.isBooyah ||
        (submission.firstUid && (item.userId === submission.firstUid || u.freeFireId === submission.firstUid))
      );
      const payoutAmount = (kills * perKillRate) + (isBooyah ? booyahPrize : 0);
      payouts.push({
        userId: u.id,
        username: u.username,
        kills,
        isBooyah,
        payoutAmount,
      });
      totalPrize += payoutAmount;
    }

    const hostAmount = Math.round(Number(t.hostCommission) || 0);
    const totalCollection = Math.round(Number(t.entryFee) * t.maxParticipants);
    const platformAmount = totalCollection > 0
      ? Math.max(0, totalCollection - hostAmount - totalPrize)
      : Math.round(Number(t.platformCommission) || 0);

    const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
    const adminWallet = adminUser ? await prisma.wallet.findUnique({ where: { userId: adminUser.id } }) : null;
    const hostWallet = await prisma.wallet.findUnique({ where: { userId: t.creatorId } });

    const winPoints = t.gameMode === 'CLASH_SQUAD' ? 2 : 4;

    try {
      await prisma.$transaction(async (tx) => {
        for (const p of payouts) {
          const pointsToAdd = (p.isBooyah ? winPoints : 0) + (p.kills * 1);

          const existingEntry = await tx.tournamentEntry.findUnique({
            where: {
              tournamentId_userId: {
                tournamentId: t.id,
                userId: p.userId,
              },
            },
          });

          if (existingEntry) {
            await tx.tournamentEntry.update({
              where: { id: existingEntry.id },
              data: {
                kills: p.kills,
                placement: p.isBooyah ? 1 : existingEntry.placement,
                points: { increment: pointsToAdd },
              },
            });
          } else {
            await tx.tournamentEntry.create({
              data: {
                tournamentId: t.id,
                userId: p.userId,
                placement: p.isBooyah ? 1 : null,
                kills: p.kills,
                points: pointsToAdd,
                isPaid: true,
              },
            });
          }

          if (p.payoutAmount > 0) {
            const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
            if (wallet) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: p.payoutAmount } },
              });
              await tx.transaction.create({
                data: {
                  walletId: wallet.id,
                  userId: p.userId,
                  type: TransactionType.PRIZE,
                  status: TransactionStatus.COMPLETED,
                  amount: new Decimal(p.payoutAmount),
                  description: `Per-Kill prize (${p.kills} kill${p.kills === 1 ? '' : 's'}${p.isBooyah ? ' + Booyah' : ''}) — ${t.title}`,
                  reference: `RESULT-${submission.id.slice(0, 8)}-K${p.kills}-${p.userId.slice(-4)}`,
                },
              });
            }
          }
        }

        if (hostAmount > 0 && hostWallet) {
          await tx.wallet.update({ where: { id: hostWallet.id }, data: { balance: { increment: hostAmount } } });
          await tx.transaction.create({
            data: {
              walletId: hostWallet.id,
              userId: t.creatorId,
              type: TransactionType.PRIZE,
              status: TransactionStatus.COMPLETED,
              amount: new Decimal(hostAmount),
              description: `Host commission — ${t.title}`,
              reference: `RESULT-${submission.id.slice(0, 8)}-HOST`,
            },
          });
        }

        if (platformAmount > 0 && adminWallet && adminUser) {
          await tx.wallet.update({ where: { id: adminWallet.id }, data: { balance: { increment: platformAmount } } });
          await tx.transaction.create({
            data: {
              walletId: adminWallet.id,
              userId: adminUser.id,
              type: TransactionType.PRIZE,
              status: TransactionStatus.COMPLETED,
              amount: new Decimal(platformAmount),
              description: `Platform commission — ${t.title}`,
              reference: `RESULT-${submission.id.slice(0, 8)}-PLAT`,
            },
          });
        }

        await tx.tournament.update({
          where: { id: t.id },
          data: {
            status: TournamentStatus.PAID,
            finalKillList: rawKillList,
          },
        });

        await tx.resultSubmission.update({
          where: { id: submissionId },
          data: { status: 'APPROVED', reviewedBy: req.user!.id, reviewedAt: new Date() },
        });
      });

      // Send notifications to players
      for (const p of payouts) {
        if (p.payoutAmount > 0) {
          notificationService.notifyWinnerPayout(
            p.userId,
            t.title,
            p.payoutAmount,
            `${p.kills} kill(s)${p.isBooyah ? ' + Booyah' : ''}`
          ).catch((err) => console.error(`[Notification] Failed to notify ${p.userId}:`, err));
        }
      }

      if (hostAmount > 0 && t.creatorId) {
        notificationService.notifyHostCommission(t.creatorId, t.title, hostAmount).catch((err) => {
          console.error(`[Notification] Failed to notify host ${t.creatorId}:`, err);
        });
      }

      const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
      res.json({
        success: true,
        message:
          `Approved & distributed: ${fmt(totalPrize)} across ${payouts.filter((p) => p.payoutAmount > 0).length} player(s)` +
          (hostAmount > 0 ? ` + ${fmt(hostAmount)} host commission` : '') +
          (platformAmount > 0 ? ` (+${fmt(platformAmount)} platform revenue)` : ''),
      });
      return;
    } catch (err: any) {
      console.error('[Admin] reviewResult Per-Kill approve error:', err);
      res.status(400).json({ success: false, message: err.message || 'Per-Kill payout distribution failed' });
      return;
    }
  }

  let winners: ResolvedWinner[];
  try {
    winners = await resolveWinners(t as any, submission.firstUid, submission.secondUid, submission.thirdUid);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  // Verify each winner is an actual participant (either individual or team member)
  const allEntries = await prisma.tournamentEntry.findMany({
    where: { tournamentId: t.id },
    include: {
      team: { include: { members: { select: { userId: true } } } },
    },
  });
  const participantUserIds = new Set<string>();
  for (const e of allEntries) {
    if (e.userId) participantUserIds.add(e.userId);
    if (e.team) {
      if (e.team.leaderId) participantUserIds.add(e.team.leaderId);
      for (const m of e.team.members) {
        participantUserIds.add(m.userId);
      }
    }
  }

  const outsiders = winners.filter((w) => !participantUserIds.has(w.userId));
  if (outsiders.length > 0) {
    res.status(400).json({ success: false, message: `Not a registered participant of this tournament: ${outsiders.map((o) => `${o.username} (${o.label})`).join(', ')}` });
    return;
  }

  const hostAmount = Math.round(Number(t.hostCommission) || 0);
  const totalPrize = winners.reduce((sum, w) => sum + w.amount, 0);
  const totalCollection = Math.round(Number(t.entryFee) * t.maxParticipants);
  const platformAmount = totalCollection > 0
    ? Math.max(0, totalCollection - hostAmount - totalPrize)
    : Math.round(Number(t.platformCommission) || 0);

  const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const adminWallet = adminUser ? await prisma.wallet.findUnique({ where: { userId: adminUser.id } }) : null;
  const hostWallet = await prisma.wallet.findUnique({ where: { userId: t.creatorId } });

  // Game Mode Points Mapping: Clash Squad Win: +2 points, Full Map Win: +4 points
  const winPoints = t.gameMode === 'CLASH_SQUAD' ? 2 : 4;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Stamp placements on the entries for record-keeping
      for (const w of winners) {
        await tx.tournamentEntry.updateMany({
          where: {
            tournamentId: t.id,
            OR: [
              { userId: w.userId },
              { team: { leaderId: w.userId } },
              { team: { members: { some: { userId: w.userId } } } },
            ],
          },
          data: { placement: w.placement },
        });
      }

      // 2. Award leaderboard points & ensure individual entries exist for each winning player / team member
      for (const w of winners) {
        const isWinner = w.placement === 1;
        const pointsToAdd = isWinner ? winPoints : 0;

        const existingEntry = await tx.tournamentEntry.findUnique({
          where: {
            tournamentId_userId: {
              tournamentId: t.id,
              userId: w.userId,
            },
          },
        });

        if (existingEntry) {
          await tx.tournamentEntry.update({
            where: { id: existingEntry.id },
            data: {
              placement: w.placement,
              ...(pointsToAdd > 0 ? { points: { increment: pointsToAdd } } : {}),
            },
          });
        } else {
          // For Duo/Squad team members who did not have their own TournamentEntry record
          await tx.tournamentEntry.create({
            data: {
              tournamentId: t.id,
              userId: w.userId,
              placement: w.placement,
              points: pointsToAdd,
              isPaid: true,
            },
          });
        }
      }

      for (const w of winners) {
        if (w.amount > 0) {
          const wallet = await tx.wallet.findUnique({ where: { userId: w.userId } });
          if (!wallet) throw new Error(`Wallet missing for ${w.username}`);
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: w.amount } } });
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              userId: w.userId,
              type: TransactionType.PRIZE,
              status: TransactionStatus.COMPLETED,
              amount: new Decimal(w.amount),
              description: `${w.label} prize — ${t.title}`,
              reference: `RESULT-${submission.id.slice(0, 8)}-P${w.placement}-${w.userId.slice(-4)}`,
            },
          });
        }
      }

      if (hostAmount > 0 && hostWallet) {
        await tx.wallet.update({ where: { id: hostWallet.id }, data: { balance: { increment: hostAmount } } });
        await tx.transaction.create({
          data: {
            walletId: hostWallet.id,
            userId: t.creatorId,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(hostAmount),
            description: `Host commission — ${t.title}`,
            reference: `RESULT-${submission.id.slice(0, 8)}-HOST`,
          },
        });
      }

      if (platformAmount > 0 && adminWallet && adminUser) {
        await tx.wallet.update({ where: { id: adminWallet.id }, data: { balance: { increment: platformAmount } } });
        await tx.transaction.create({
          data: {
            walletId: adminWallet.id,
            userId: adminUser.id,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(platformAmount),
            description: `Platform commission — ${t.title}`,
            reference: `RESULT-${submission.id.slice(0, 8)}-PLAT`,
          },
        });
      }

      await tx.tournament.update({ where: { id: t.id }, data: { status: TournamentStatus.PAID } });
      await tx.resultSubmission.update({
        where: { id: submissionId },
        data: { status: 'APPROVED', reviewedBy: req.user!.id, reviewedAt: new Date() },
      });
    });

    // Notify winners and host
    for (const w of winners) {
      notificationService.notifyWinnerPayout(w.userId, t.title, w.amount, w.label).catch((err) => {
        console.error(`[Notification] Failed to notify winner ${w.userId}:`, err);
      });
    }
    if (hostAmount > 0 && t.creatorId) {
      notificationService.notifyHostCommission(t.creatorId, t.title, hostAmount).catch((err) => {
        console.error(`[Notification] Failed to notify host ${t.creatorId}:`, err);
      });
    }

    const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    res.json({
      success: true,
      message:
        `Approved & distributed: ${fmt(totalPrize)} to ${winners.length} winner(s)` +
        (hostAmount > 0 ? ` + ${fmt(hostAmount)} host commission` : '') +
        (platformAmount > 0 ? ` (+${fmt(platformAmount)} platform revenue)` : ''),
    });
  } catch (err: any) {
    console.error('[Admin] reviewResult approve error:', err);
    res.status(400).json({ success: false, message: err.message || 'Distribution failed — no changes were saved' });
  }
}
