import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { gameProfileService } from '../services/gameProfile.service';

function getSeasonIncludes() {
  return {
    teams: {
      where: { status: { not: 'DISQUALIFIED' as const } },
      orderBy: { createdAt: 'desc' as const },
      include: { registeredBy: { select: { id: true, username: true, email: true } } },
    },
  };
}

export async function getCurrentSeason(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const season = await prisma.esportsSeason.findFirst({
    orderBy: { seasonNumber: 'desc' },
    include: {
      teams: {
        orderBy: { createdAt: 'desc' },
        include: { registeredBy: { select: { id: true, username: true, email: true } } },
      },
    },
  });

  if (!season) {
    res.json({
      success: true,
      data: null,
      message: 'No esports season has been created yet.',
    });
    return;
  }

  let winner = null;
  if (season.winnerTeamId) {
    winner = await prisma.esportsTeam.findUnique({
      where: { id: season.winnerTeamId },
      include: { registeredBy: { select: { id: true, username: true, email: true } } },
    });
  }

  res.json({ success: true, data: { ...season, winner } });
}

export async function registerTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { teamName, player1Uid, player1Ign, player2Uid, player2Ign, player3Uid, player3Ign, player4Uid, player4Ign, screenshotUrl, teamLogoUrl } = req.body;

  if (!teamName || !player1Uid || !player2Uid || !player3Uid || !player4Uid || !screenshotUrl) {
    res.status(400).json({ success: false, message: 'All fields are required: teamName, 4 UIDs, screenshotUrl' });
    return;
  }

  const season = await prisma.esportsSeason.findFirst({
    where: { registrationOpen: true },
    orderBy: { seasonNumber: 'desc' },
  });

  if (!season) {
    res.status(400).json({ success: false, message: 'No active season accepting registrations.' });
    return;
  }

  const uids = [player1Uid, player2Uid, player3Uid, player4Uid];
  const uidSet = new Set(uids);
  if (uidSet.size !== 4) {
    res.status(400).json({ success: false, message: 'All 4 UIDs must be unique.' });
    return;
  }

  const bannedUids = await prisma.esportsBan.findMany({
    where: { uid: { in: uids } },
    select: { uid: true, reason: true },
  });

  if (bannedUids.length > 0) {
    const banned = bannedUids.map((b) => `${b.uid}${b.reason ? ` (${b.reason})` : ''}`).join(', ');
    res.status(400).json({ success: false, message: `Registration Failed: Banned UIDs detected — ${banned}` });
    return;
  }

  const existing = await prisma.esportsTeam.findFirst({
    where: {
      seasonId: season.id,
      OR: [
        { player1Uid: { in: uids } },
        { player2Uid: { in: uids } },
        { player3Uid: { in: uids } },
        { player4Uid: { in: uids } },
      ],
    },
  });

  if (existing) {
    res.status(400).json({ success: false, message: 'One or more UIDs are already registered in a team this season.' });
    return;
  }

  const profiles = await Promise.all(uids.map((uid) => gameProfileService.fetchByUid(uid)));

  for (let i = 0; i < profiles.length; i++) {
    if (!profiles[i]) {
      res.status(400).json({ success: false, message: `Registration Failed: UID ${uids[i]} not found.` });
      return;
    }
    if (profiles[i]!.level < 60) {
      res.status(400).json({
        success: false,
        message: `Registration Failed: Minimum Level 60 required. Player ${profiles[i]!.ign} (UID: ${uids[i]}) is level ${profiles[i]!.level}.`,
      });
      return;
    }
  }

  const team = await prisma.esportsTeam.create({
    data: {
      seasonId: season.id,
      teamName,
      player1Uid,
      player1Ign: profiles[0]!.ign,
      player2Uid,
      player2Ign: profiles[1]!.ign,
      player3Uid,
      player3Ign: profiles[2]!.ign,
      player4Uid,
      player4Ign: profiles[3]!.ign,
      screenshotUrl,
      ...(teamLogoUrl !== undefined && { teamLogoUrl }),
      registeredById: userId,
    },
    include: { registeredBy: { select: { id: true, username: true, email: true } } },
  });

  res.json({ success: true, message: 'Team registered successfully for the season!', data: team });
}

export async function getMyTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  const season = await prisma.esportsSeason.findFirst({
    orderBy: { seasonNumber: 'desc' },
  });

  if (!season) {
    res.json({ success: true, data: null });
    return;
  }

  const team = await prisma.esportsTeam.findFirst({
    where: { seasonId: season.id, registeredById: userId },
    include: { registeredBy: { select: { id: true, username: true, email: true } } },
  });

  res.json({ success: true, data: team });
}

export async function getSeasonLeaderboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const season = await prisma.esportsSeason.findFirst({
    orderBy: { seasonNumber: 'desc' },
  });

  if (!season) {
    res.json({ success: true, data: [] });
    return;
  }

  const teams = await prisma.esportsTeam.findMany({
    where: { seasonId: season.id, status: { not: 'DISQUALIFIED' } },
    orderBy: { createdAt: 'asc' },
    include: { registeredBy: { select: { id: true, username: true, email: true } } },
  });

  res.json({ success: true, data: teams });
}

export async function getBannedUids(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const bans = await prisma.esportsBan.findMany({
    orderBy: { createdAt: 'desc' },
    include: { bannedBy: { select: { id: true, username: true } } },
  });

  res.json({ success: true, data: bans });
}

export async function addBan(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { uid, reason } = req.body;

  if (!uid) {
    res.status(400).json({ success: false, message: 'UID is required.' });
    return;
  }

  const existing = await prisma.esportsBan.findUnique({ where: { uid } });
  if (existing) {
    res.status(400).json({ success: false, message: 'This UID is already banned.' });
    return;
  }

  const teamEntries = await prisma.esportsTeam.findMany({
    where: {
      status: 'REGISTERED',
      OR: [
        { player1Uid: uid },
        { player2Uid: uid },
        { player3Uid: uid },
        { player4Uid: uid },
      ],
    },
  });

  if (teamEntries.length > 0) {
    await prisma.esportsTeam.updateMany({
      where: { id: { in: teamEntries.map((t) => t.id) } },
      data: { status: 'DISQUALIFIED' },
    });
  }

  const ban = await prisma.esportsBan.create({
    data: { uid, reason, bannedById: req.user!.id },
    include: { bannedBy: { select: { id: true, username: true } } },
  });

  res.json({
    success: true,
    message: teamEntries.length > 0
      ? `UID banned and ${teamEntries.length} team(s) auto-disqualified.`
      : 'UID banned successfully.',
    data: ban,
  });
}

export async function removeBan(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const ban = await prisma.esportsBan.findUnique({ where: { id } });
  if (!ban) {
    res.status(404).json({ success: false, message: 'Ban not found.' });
    return;
  }

  await prisma.esportsBan.delete({ where: { id } });

  res.json({ success: true, message: 'Ban removed successfully.' });
}

export async function updateSeasonConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { seasonNumber, registrationDeadline, registrationOpen, matchDate, matchMap, matchMode, nextSeasonDate } = req.body;

  const season = await prisma.esportsSeason.findFirst({
    orderBy: { seasonNumber: 'desc' },
  });

  if (!season) {
    res.status(404).json({ success: false, message: 'No season found. Create one first.' });
    return;
  }

  const updated = await prisma.esportsSeason.update({
    where: { id: season.id },
    data: {
      ...(seasonNumber !== undefined && { seasonNumber }),
      ...(registrationDeadline !== undefined && { registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null }),
      ...(registrationOpen !== undefined && { registrationOpen }),
      ...(matchDate !== undefined && { matchDate: matchDate ? new Date(matchDate) : null }),
      ...(matchMap !== undefined && { matchMap }),
      ...(matchMode !== undefined && { matchMode }),
      ...(nextSeasonDate !== undefined && { nextSeasonDate: nextSeasonDate ? new Date(nextSeasonDate) : null }),
    },
    include: getSeasonIncludes(),
  });

  res.json({ success: true, data: updated });
}

export async function createSeason(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { seasonNumber } = req.body;

  if (!seasonNumber) {
    res.status(400).json({ success: false, message: 'seasonNumber is required.' });
    return;
  }

  const existing = await prisma.esportsSeason.findUnique({ where: { seasonNumber } });
  if (existing) {
    res.status(400).json({ success: false, message: `Season ${seasonNumber} already exists.` });
    return;
  }

  const season = await prisma.esportsSeason.create({
    data: { seasonNumber },
    include: getSeasonIncludes(),
  });

  res.json({ success: true, message: `Season ${seasonNumber} created!`, data: season });
}

export async function endSeason(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { winnerTeamId } = req.body;

  const season = await prisma.esportsSeason.findFirst({
    where: { registrationOpen: true },
    orderBy: { seasonNumber: 'desc' },
  });

  if (!season) {
    res.status(404).json({ success: false, message: 'No active season found.' });
    return;
  }

  if (winnerTeamId) {
    const team = await prisma.esportsTeam.findUnique({ where: { id: winnerTeamId } });
    if (!team) {
      res.status(404).json({ success: false, message: 'Winner team not found.' });
      return;
    }
  }

  const updated = await prisma.esportsSeason.update({
    where: { id: season.id },
    data: {
      registrationOpen: false,
      ...(winnerTeamId && { winnerTeamId }),
    },
    include: getSeasonIncludes(),
  });

  if (winnerTeamId) {
    await prisma.esportsTeam.update({
      where: { id: winnerTeamId },
      data: { status: 'WINNER' },
    });
  }

  res.json({ success: true, message: 'Season ended successfully.', data: updated });
}
