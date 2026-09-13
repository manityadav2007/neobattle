import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { findBestPlayerMatch, PlayerCandidate, MatchResult } from '../utils/stringSimilarity';

// Re-export or import kill detection service
// eslint-disable-next-line @typescript-eslint/no-var-requires
const killDetectionService = require('../../services/killDetectionService');
const detectKillsFromVideo = killDetectionService.detectKillsFromVideo || killDetectionService;

// Setup upload directory for kill counter videos
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'kill-counter');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer disk storage for local video processing via fluent-ffmpeg
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `kc_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  },
});

const videoFilter = (_req: any, file: any, cb: any) => {
  const allowed = /\.(mp4|mkv|mov|webm|avi)$/i;
  if (allowed.test(file.originalname) || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files (.mp4, .mkv, .mov, .webm, .avi) are allowed'));
  }
};

export const uploadVideoMiddleware = multer({
  storage,
  fileFilter: videoFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB limit
}).single('video');

// In-memory job state store for background video analysis
export interface KillJob {
  id: string;
  tournamentId: string;
  videoPath: string;
  originalName: string;
  fileSize: number;
  status: 'ready' | 'processing' | 'completed' | 'failed';
  progress: {
    currentBatch: number;
    totalBatches: number;
    percent: number;
    statusText: string;
  };
  rawDetections: Array<{ eliminator: string; eliminated: string; timestamp: number }>;
  matchedKills: Record<
    string,
    {
      player: PlayerCandidate;
      kills: number;
      detections: Array<{ eliminated: string; timestamp: number; confidence: string; score: number }>;
    }
  >;
  unmatchedDetections: Array<{
    id: string;
    eliminator: string;
    eliminated: string;
    timestamp: number;
    bestCandidate?: PlayerCandidate | null;
    score: number;
  }>;
  error?: string | null;
  startedAt?: number;
  completedAt?: number;
}

const activeJobs = new Map<string, KillJob>();

/**
 * 1. Search for tournaments with tournamentFormat = "PER_KILL"
 */
export async function searchPerKillTournaments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = String(req.query.search || '').trim();

    const where: any = {
      tournamentFormat: 'PER_KILL',
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { uid: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tournaments = await prisma.tournament.findMany({
      where,
      select: {
        id: true,
        uid: true,
        title: true,
        description: true,
        format: true,
        platform: true,
        gameMode: true,
        status: true,
        entryFee: true,
        prizePool: true,
        tournamentFormat: true,
        perKillRate: true,
        booyahPrize: true,
        maxParticipants: true,
        teamSize: true,
        mapName: true,
        startTime: true,
        finalKillList: true,
        creator: { select: { id: true, username: true } },
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ success: true, data: tournaments });
  } catch (err: any) {
    console.error('[KillCounter] searchPerKillTournaments error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to search tournaments' });
  }
}

/**
 * 2. Get tournament details and full player roster with team grouping
 */
export async function getTournamentDetailsAndRoster(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { entries: true } },
      },
    });

    if (!tournament) {
      res.status(404).json({ success: false, message: 'Tournament not found' });
      return;
    }

    // Fetch entries
    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            ign: true,
            inGameNickname: true,
            freeFireId: true,
            freeFireUid: true,
            gameLevel: true,
            isVerified: true,
            displayName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            tag: true,
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    ign: true,
                    inGameNickname: true,
                    freeFireId: true,
                    freeFireUid: true,
                    gameLevel: true,
                    isVerified: true,
                    displayName: true,
                  },
                },
              },
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { registeredAt: 'asc' },
    });

    // Extract flat list of player candidates for matching
    const candidates: PlayerCandidate[] = [];

    const isTeamTournament = tournament.format === 'DUO' || tournament.format === 'SQUAD';

    for (const entry of entries) {
      if (isTeamTournament && entry.team) {
        const teamName = entry.team.name;
        const teamTag = entry.team.tag;
        const teamId = entry.team.id;

        for (const member of entry.team.members) {
          if (member.user) {
            candidates.push({
              id: member.user.id,
              inGameNickname: member.user.inGameNickname || member.user.ign,
              ign: member.user.ign || member.user.inGameNickname,
              username: member.user.username,
              freeFireId: member.user.freeFireId || member.user.freeFireUid,
              gameLevel: member.user.gameLevel,
              teamId,
              teamName,
              teamTag,
            });
          }
        }
      } else if (entry.user) {
        candidates.push({
          id: entry.user.id,
          inGameNickname: entry.user.inGameNickname || entry.user.ign,
          ign: entry.user.ign || entry.user.inGameNickname,
          username: entry.user.username,
          freeFireId: entry.user.freeFireId || entry.user.freeFireUid,
          gameLevel: entry.user.gameLevel,
        });
      }
    }

    res.json({
      success: true,
      data: {
        tournament,
        entries,
        candidates,
        isTeamTournament,
        finalKillList: tournament.finalKillList,
      },
    });
  } catch (err: any) {
    console.error('[KillCounter] getTournamentDetailsAndRoster error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to get tournament details' });
  }
}

/**
 * 3. Upload gameplay video for a tournament
 */
export async function uploadVideo(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    const tournamentId = req.body.tournamentId;

    if (!file) {
      res.status(400).json({ success: false, message: 'No video file uploaded' });
      return;
    }

    if (!tournamentId) {
      res.status(400).json({ success: false, message: 'tournamentId is required' });
      return;
    }

    const jobId = uuidv4();
    const job: KillJob = {
      id: jobId,
      tournamentId,
      videoPath: file.path,
      originalName: file.originalname,
      fileSize: file.size,
      status: 'ready',
      progress: {
        currentBatch: 0,
        totalBatches: 0,
        percent: 0,
        statusText: 'Video ready for analysis',
      },
      rawDetections: [],
      matchedKills: {},
      unmatchedDetections: [],
      error: null,
    };

    activeJobs.set(jobId, job);

    res.json({
      success: true,
      data: {
        jobId,
        tournamentId,
        fileName: file.originalname,
        fileSize: file.size,
      },
    });
  } catch (err: any) {
    console.error('[KillCounter] uploadVideo error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to upload video' });
  }
}

/**
 * Helper to process detected kills against player roster candidates
 */
function processDetectionsIntoJob(
  job: KillJob,
  allDetections: Array<{ eliminator: string; eliminated: string; timestamp: number }>,
  candidates: PlayerCandidate[]
) {
  job.rawDetections = allDetections;

  // Reset aggregated maps
  const matchedMap: Record<
    string,
    {
      player: PlayerCandidate;
      kills: number;
      detections: Array<{ eliminated: string; timestamp: number; confidence: string; score: number }>;
    }
  > = {};

  const unmatched: Array<{
    id: string;
    eliminator: string;
    eliminated: string;
    timestamp: number;
    bestCandidate?: PlayerCandidate | null;
    score: number;
  }> = [];

  for (let idx = 0; idx < allDetections.length; idx++) {
    const det = allDetections[idx];
    const match = findBestPlayerMatch(det.eliminator, candidates, 0.72);

    if (match.matched && match.player) {
      const pId = match.player.id;
      if (!matchedMap[pId]) {
        matchedMap[pId] = {
          player: match.player,
          kills: 0,
          detections: [],
        };
      }
      matchedMap[pId].kills += 1;
      matchedMap[pId].detections.push({
        eliminated: det.eliminated,
        timestamp: det.timestamp,
        confidence: match.confidence,
        score: match.score,
      });
    } else {
      unmatched.push({
        id: `unm_${idx}_${det.timestamp}`,
        eliminator: det.eliminator,
        eliminated: det.eliminated,
        timestamp: det.timestamp,
        bestCandidate: match.player,
        score: match.score,
      });
    }
  }

  job.matchedKills = matchedMap;
  job.unmatchedDetections = unmatched;
}

/**
 * 4. Start AI Kill Analysis for an uploaded video job
 */
export async function startAnalysis(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    res.status(404).json({ success: false, message: 'Analysis job not found' });
    return;
  }

  if (job.status === 'processing') {
    res.json({ success: true, message: 'Analysis already in progress', data: job });
    return;
  }

  // Load registered player candidates for this tournament
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId: job.tournamentId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          ign: true,
          inGameNickname: true,
          freeFireId: true,
          freeFireUid: true,
          gameLevel: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          tag: true,
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  ign: true,
                  inGameNickname: true,
                  freeFireId: true,
                  freeFireUid: true,
                  gameLevel: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const candidates: PlayerCandidate[] = [];
  for (const entry of entries) {
    if (entry.team) {
      for (const m of entry.team.members) {
        if (m.user) {
          candidates.push({
            id: m.user.id,
            inGameNickname: m.user.inGameNickname || m.user.ign,
            ign: m.user.ign || m.user.inGameNickname,
            username: m.user.username,
            freeFireId: m.user.freeFireId || m.user.freeFireUid,
            gameLevel: m.user.gameLevel,
            teamId: entry.team.id,
            teamName: entry.team.name,
            teamTag: entry.team.tag,
          });
        }
      }
    } else if (entry.user) {
      candidates.push({
        id: entry.user.id,
        inGameNickname: entry.user.inGameNickname || entry.user.ign,
        ign: entry.user.ign || entry.user.inGameNickname,
        username: entry.user.username,
        freeFireId: entry.user.freeFireId || entry.user.freeFireUid,
        gameLevel: entry.user.gameLevel,
      });
    }
  }

  job.status = 'processing';
  job.startedAt = Date.now();
  job.error = null;
  job.progress = {
    currentBatch: 0,
    totalBatches: 0,
    percent: 0,
    statusText: 'Extracting video frames...',
  };

  // Run async detection pipeline without blocking HTTP response
  (async () => {
    try {
      console.log(`[KillCounter] Starting background analysis for job ${jobId}`);

      const finalKills = await detectKillsFromVideo(job.videoPath, (prog: any) => {
        const percent = prog.totalBatches > 0 ? Math.round((prog.currentBatch / prog.totalBatches) * 100) : 0;
        job.progress = {
          currentBatch: prog.currentBatch,
          totalBatches: prog.totalBatches,
          percent,
          statusText: `Analyzing batch ${prog.currentBatch} of ${prog.totalBatches} (${percent}%)...`,
        };

        // Live update matched & unmatched kills
        processDetectionsIntoJob(job, prog.allKillsSoFar || [], candidates);
      });

      // Final processing pass
      processDetectionsIntoJob(job, finalKills, candidates);
      job.status = 'completed';
      job.completedAt = Date.now();
      job.progress = {
        currentBatch: job.progress.totalBatches,
        totalBatches: job.progress.totalBatches,
        percent: 100,
        statusText: `Analysis complete! ${finalKills.length} kill feed notifications detected.`,
      };
      console.log(`[KillCounter] Job ${jobId} finished successfully with ${finalKills.length} kills.`);
    } catch (err: any) {
      console.error(`[KillCounter] Job ${jobId} failed:`, err.message || err);
      job.status = 'failed';
      job.error = err.message || 'Video analysis failed';

      // If partial kills exist, retain them so the admin can continue manually!
      if (err.partialKills && Array.isArray(err.partialKills)) {
        processDetectionsIntoJob(job, err.partialKills, candidates);
        job.progress.statusText = `Analysis stopped partway (${err.partialKills.length} kills detected). You can edit or continue manually.`;
      } else {
        job.progress.statusText = `Analysis failed: ${err.message || 'Unknown error'}`;
      }
    } finally {
      // Clean up uploaded video file from disk
      try {
        if (fs.existsSync(job.videoPath)) {
          fs.unlinkSync(job.videoPath);
          console.log(`[KillCounter] Cleaned up uploaded video: ${job.videoPath}`);
        }
      } catch (cleanErr: any) {
        console.warn(`[KillCounter] Failed to delete video file ${job.videoPath}:`, cleanErr.message);
      }
    }
  })();

  res.json({
    success: true,
    message: 'AI video analysis started',
    data: {
      jobId,
      status: job.status,
      progress: job.progress,
    },
  });
}

/**
 * 5. Check Job Status & Progress
 */
export async function getJobStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    res.status(404).json({ success: false, message: 'Analysis job not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      id: job.id,
      tournamentId: job.tournamentId,
      status: job.status,
      progress: job.progress,
      matchedKills: job.matchedKills,
      unmatchedDetections: job.unmatchedDetections,
      totalDetectionsCount: job.rawDetections.length,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    },
  });
}

/**
 * 6. Finalize Kill List: Saves verified kills to Tournament and TournamentEntry
 */
export async function finalizeTournamentKills(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { finalKills, unmatchedCount } = req.body;

    if (!Array.isArray(finalKills)) {
      res.status(400).json({ success: false, message: 'finalKills must be an array' });
      return;
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        entries: true,
      },
    });

    if (!tournament) {
      res.status(404).json({ success: false, message: 'Tournament not found' });
      return;
    }

    let totalKills = 0;

    // Update each entry's kills in database
    for (const item of finalKills) {
      const kills = Math.max(0, parseInt(String(item.kills || 0), 10));
      totalKills += kills;

      // Find matching entry
      const entry = tournament.entries.find(
        (e) => (item.playerId && e.userId === item.playerId) || (item.teamId && e.teamId === item.teamId)
      );

      if (entry) {
        await prisma.tournamentEntry.update({
          where: { id: entry.id },
          data: { kills },
        });
      }
    }

    // Save comprehensive finalKillList JSON record on Tournament
    const finalKillRecord = {
      finalizedAt: new Date().toISOString(),
      finalizedBy: req.user!.id,
      finalizedByUsername: req.user!.username,
      totalKills,
      unmatchedCount: unmatchedCount || 0,
      kills: finalKills,
    };

    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: {
        finalKillList: finalKillRecord as any,
      },
    });

    res.json({
      success: true,
      message: `Final kill list saved! Recorded ${totalKills} total kills across ${finalKills.length} players.`,
      data: {
        tournament: updatedTournament,
        finalKillRecord,
      },
    });
  } catch (err: any) {
    console.error('[KillCounter] finalizeTournamentKills error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to finalize kill list' });
  }
}
