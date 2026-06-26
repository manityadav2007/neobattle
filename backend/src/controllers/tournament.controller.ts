import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentFormat, TournamentStatus, Platform, GameMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { escrowService } from '../services/escrow.service';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';
import { validatePrizePool } from '../services/commission.service';
import { gameProfileService } from '../services/gameProfile.service';

export async function createTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = req.body;

  const entryFeeNum = Number(data.entryFee);
  const maxPlayers = data.maxParticipants;
  const prizePoolNum = Number(data.prizePool);

  const validation = validatePrizePool(entryFeeNum, maxPlayers, prizePoolNum);

  if (!validation.valid) {
    res.status(400).json({ success: false, message: validation.message, breakdown: validation.breakdown });
    return;
  }

  const lastTour = await prisma.tournament.findFirst({ orderBy: { uid: 'desc' } });
  const lastTourNum = lastTour?.uid ? parseInt(lastTour.uid.replace('T-', '')) || 9000 : 9000;
  const tourUid = `T-${lastTourNum + 1}`;

  const tournament = await prisma.tournament.create({
    data: {
      ...data,
      uid: tourUid,
      entryFee: new Decimal(data.entryFee),
      prizePool: new Decimal(data.prizePool),
      creatorId: req.user!.id,
      registrationStart: new Date(data.registrationStart),
      registrationEnd: new Date(data.registrationEnd),
      startTime: new Date(data.startTime),
      platformCommission: new Decimal(validation.breakdown.platformCommission),
      hostCommission: new Decimal(validation.breakdown.hostCommission),
      remainingPool: new Decimal(validation.breakdown.remainingPool),
      prizeFirst: data.prizeFirst !== undefined ? new Decimal(data.prizeFirst) : new Decimal(0),
      prizeSecond: data.prizeSecond != null ? new Decimal(data.prizeSecond) : null,
      prizeThird: data.prizeThird != null ? new Decimal(data.prizeThird) : null,
    },
    include: { creator: { select: { id: true, username: true } } },
  });

  await cacheDel('tournaments:list');
  res.status(201).json({ success: true, data: tournament, breakdown: validation.breakdown });
}

export async function listTournaments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as TournamentStatus | undefined;
  const format = req.query.format as TournamentFormat | undefined;
  const platform = req.query.platform as Platform | undefined;
  const gameMode = req.query.gameMode as GameMode | undefined;
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
    ...(format && { format }),
    ...(platform && { platform }),
    ...(gameMode && { gameMode }),
  };

  const cacheKey = `tournaments:list:${page}:${limit}:${status || ''}:${format || ''}:${platform || ''}:${gameMode || ''}`;
  const cached = await cacheGet<{ tournaments: unknown[]; total: number }>(cacheKey);

  if (cached) {
    res.json({
      success: true,
      data: cached.tournaments,
      pagination: { page, limit, total: cached.total, totalPages: Math.ceil(cached.total / limit) },
    });
    return;
  }

  const [tournaments, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { entries: true } },
      },
      skip,
      take: limit,
      orderBy: { startTime: 'asc' },
    }),
    prisma.tournament.count({ where }),
  ]);

  await cacheSet(cacheKey, { tournaments, total }, 60);

  res.json({
    success: true,
    data: tournaments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      creator: { select: { id: true, username: true } },
      entries: {
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
          team: { select: { id: true, name: true, tag: true } },
        },
        orderBy: [{ points: 'desc' }, { kills: 'desc' }],
      },
      _count: { select: { entries: true } },
    },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  const isRegistered = req.user
    ? tournament.entries.some((e) => e.userId === req.user!.id)
    : false;

  res.json({ success: true, data: { ...tournament, isRegistered } });
}

export async function updateTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== req.user!.id && req.user!.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  const { entryFee, prizePool, registrationStart, registrationEnd, startTime, ...rest } = req.body;

  const updated = await prisma.tournament.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(entryFee !== undefined && { entryFee: new Decimal(entryFee) }),
      ...(prizePool !== undefined && { prizePool: new Decimal(prizePool) }),
      ...(registrationStart && { registrationStart: new Date(registrationStart) }),
      ...(registrationEnd && { registrationEnd: new Date(registrationEnd) }),
      ...(startTime && { startTime: new Date(startTime) }),
    },
  });

  await cacheDel('tournaments:list');
  res.json({ success: true, data: updated });
}

export async function registerForTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { tournamentId, teamId, squadUids } = req.body;
  const userId = req.user!.id;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { entries: true } } },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.status !== TournamentStatus.REGISTRATION) {
    res.status(400).json({ success: false, message: 'Registration is not open' });
    return;
  }

  const now = new Date();
  if (now < tournament.registrationStart || now > tournament.registrationEnd) {
    res.status(400).json({ success: false, message: 'Outside registration window' });
    return;
  }

  if (tournament._count.entries >= tournament.maxParticipants) {
    res.status(400).json({ success: false, message: 'Tournament is full' });
    return;
  }

  if (tournament.format === TournamentFormat.SQUAD) {
    if (!squadUids || !Array.isArray(squadUids) || squadUids.length !== 4) {
      res.status(400).json({ success: false, message: 'Squad mode requires exactly 4 UIDs' });
      return;
    }

    const igns: string[] = [];
    for (const uid of squadUids) {
      if (!uid || typeof uid !== 'string' || uid.length < 5) {
        res.status(400).json({ success: false, message: `Invalid UID: ${uid}` });
        return;
      }
      const profile = await gameProfileService.fetchByUid(uid);
      if (!profile) {
        res.status(400).json({ success: false, message: `Could not fetch game profile for UID: ${uid}` });
        return;
      }
      igns.push(profile.ign);
    }

    const existingSquad = await prisma.tournamentEntry.findFirst({
      where: { tournamentId, userId },
    });
    if (existingSquad) {
      res.status(409).json({ success: false, message: 'Already registered in this tournament' });
      return;
    }

    const entryFee = Number(tournament.entryFee) * 4;
    let isPaid = entryFee === 0;

    if (entryFee > 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || Number(wallet.balance) < entryFee) {
        res.status(400).json({ success: false, message: `Insufficient balance. Squad entry requires ₹${entryFee} (4 × ₹${Number(tournament.entryFee)})` });
        return;
      }

      const holdResult = await escrowService.holdFunds(wallet.id, userId, tournamentId, entryFee);
      if (!holdResult.success) {
        res.status(400).json({ success: false, message: holdResult.message });
        return;
      }
      isPaid = true;
    }

    const entry = await prisma.tournamentEntry.create({
      data: {
        tournamentId,
        userId,
        isPaid,
      },
    });

    res.status(201).json({
      success: true,
      data: { ...entry, squadIgns: igns },
      message: `Squad registered with IGNs: ${igns.join(', ')}`,
    });
    return;
  }

  if (tournament.format !== TournamentFormat.SOLO && !teamId) {
    res.status(400).json({ success: false, message: 'Team required for duo format' });
    return;
  }

  const existing = await prisma.tournamentEntry.findFirst({
    where: {
      tournamentId,
      OR: [{ userId }, ...(teamId ? [{ teamId }] : [])],
    },
  });

  if (existing) {
    res.status(409).json({ success: false, message: 'Already registered' });
    return;
  }

  const entryFee = Number(tournament.entryFee);
  let isPaid = entryFee === 0;

  if (entryFee > 0) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < entryFee) {
      res.status(400).json({ success: false, message: 'Insufficient wallet balance for entry fee' });
      return;
    }

    const holdResult = await escrowService.holdFunds(wallet.id, userId, tournamentId, entryFee);
    if (!holdResult.success) {
      res.status(400).json({ success: false, message: holdResult.message });
      return;
    }
    isPaid = true;
  }

  const entry = await prisma.tournamentEntry.create({
    data: {
      tournamentId,
      userId: tournament.format === TournamentFormat.SOLO ? userId : undefined,
      teamId: teamId || undefined,
      isPaid,
    },
    include: {
      tournament: { select: { title: true, startTime: true } },
      user: { select: { id: true, username: true } },
      team: { select: { id: true, name: true, tag: true } },
    },
  });

  res.status(201).json({ success: true, data: entry });
}

export async function updateEntryScore(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { placement, kills, points } = req.body;

  const entry = await prisma.tournamentEntry.update({
    where: { id: req.params.entryId },
    data: {
      ...(placement !== undefined && { placement }),
      ...(kills !== undefined && { kills }),
      ...(points !== undefined && { points }),
    },
  });

  res.json({ success: true, data: entry });
}

export async function getMyTournaments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { userId: req.user!.id },
    include: {
      tournament: {
        include: { _count: { select: { entries: true } } },
      },
    },
    orderBy: { registeredAt: 'desc' },
  });

  res.json({ success: true, data: entries });
}

export async function deleteTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.status === TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Cannot delete active tournament' });
    return;
  }

  await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: TournamentStatus.CANCELLED },
  });

  await cacheDel('tournaments:list');
  res.json({ success: true, message: 'Tournament cancelled' });
}
