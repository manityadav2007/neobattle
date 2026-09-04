import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { GameMode, Platform, TournamentFormat, TournamentStatus } from '@prisma/client';
import { validatePrizePool } from '../services/commission.service';
import { escrowService } from '../services/escrow.service';
import { notificationService } from '../services/notification.service';
import { cacheDel, cacheDelPattern } from '../config/redis';

export async function getMyTournaments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournaments = await prisma.tournament.findMany({
    where: { creatorId: req.user!.id },
    include: {
      _count: { select: { entries: true } },
      entries: {
        include: {
          user: { select: { id: true, username: true, ign: true, freeFireId: true, gameLevel: true, isVerified: true } },
          team: {
            select: {
              id: true,
              name: true,
              tag: true,
              members: {
                include: {
                  user: { select: { id: true, username: true, ign: true, freeFireId: true, gameLevel: true, isVerified: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: tournaments });
}

export async function createTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = req.body;

  const entryFeeValue = Number(data.entryFee);
  const isFree =
    data.isFree === true ||
    !Number.isFinite(entryFeeValue) ||
    entryFeeValue <= 0;

  const entryFeeNum = isFree ? 0 : entryFeeValue;
  const prizePoolNum = isFree ? 0 : Number(data.prizePool);
  const maxPlayers = data.maxParticipants;

  if (!isFree) {
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
        uid: tourUid,
        title: data.title,
        description: data.description,
        format: data.format as TournamentFormat,
        platform: (data.platform as Platform) || 'MOBILE',
        gameMode: (data.gameMode as GameMode) || 'FULL_MAP',
        requiredLevel: parseInt(String(data.requiredLevel || 0), 10) || 0,
        entryFee: new Decimal(entryFeeNum),
        prizePool: new Decimal(prizePoolNum),
        maxParticipants: data.maxParticipants,
        mapName: data.mapName,
        rules: data.rules,
        status: TournamentStatus.REGISTRATION,
        registrationStart: new Date(data.registrationStart),
        registrationEnd: new Date(data.registrationEnd),
        startTime: new Date(data.startTime),
        creatorId: req.user!.id,
        platformCommission: new Decimal(validation.breakdown.platformCommission),
        hostCommission: new Decimal(validation.breakdown.hostCommission),
        remainingPool: new Decimal(validation.breakdown.remainingPool),
        prizeFirst: data.prizeFirst !== undefined ? new Decimal(data.prizeFirst) : new Decimal(0),
        prizeSecond: data.prizeSecond !== undefined && data.prizeSecond !== null ? new Decimal(data.prizeSecond) : null,
        prizeThird: data.prizeThird !== undefined && data.prizeThird !== null ? new Decimal(data.prizeThird) : null,
      },
      include: { creator: { select: { id: true, username: true } } },
    });

    // Fire-and-forget: notify subscribed users about the new tournament
    notificationService.notifyNewTournament(tournament.id, tournament.title, entryFeeNum).catch((err) => {
      console.error('[Host] Failed to send new-tournament notifications:', err);
    });

    res.status(201).json({ success: true, data: tournament, breakdown: validation.breakdown });
    return;

  }

  // Free tournament — skip budget validation, zero out all commission fields
  const lastTour = await prisma.tournament.findFirst({ orderBy: { uid: 'desc' } });
  const lastTourNum = lastTour?.uid ? parseInt(lastTour.uid.replace('T-', '')) || 9000 : 9000;
  const tourUid = `T-${lastTourNum + 1}`;

  const tournament = await prisma.tournament.create({
    data: {
      uid: tourUid,
      title: data.title,
      description: data.description,
      format: data.format as TournamentFormat,
      platform: (data.platform as Platform) || 'MOBILE',
      gameMode: (data.gameMode as GameMode) || 'FULL_MAP',
      requiredLevel: parseInt(String(data.requiredLevel || 0), 10) || 0,
      entryFee: new Decimal(0),
      prizePool: new Decimal(Number(data.prizePool) || 0),
      maxParticipants: data.maxParticipants,
      mapName: data.mapName,
      rules: data.rules,
      status: TournamentStatus.REGISTRATION,
      registrationStart: new Date(data.registrationStart),
      registrationEnd: new Date(data.registrationEnd),
      startTime: new Date(data.startTime),
      creatorId: req.user!.id,
      platformCommission: new Decimal(0),
      hostCommission: new Decimal(0),
      remainingPool: new Decimal(0),
      prizeFirst: new Decimal(Number(data.prizeFirst) || 0),
      prizeSecond: data.prizeSecond != null && Number(data.prizeSecond) > 0 ? new Decimal(Number(data.prizeSecond)) : null,
      prizeThird: data.prizeThird != null && Number(data.prizeThird) > 0 ? new Decimal(Number(data.prizeThird)) : null,
    },
    include: { creator: { select: { id: true, username: true } } },
  });

  // Fire-and-forget: notify subscribed users about the new free tournament
  notificationService.notifyNewTournament(tournament.id, tournament.title, 0).catch((err) => {
    console.error('[Host] Failed to send new-tournament notifications:', err);
  });

  res.status(201).json({ success: true, data: tournament });
}

export async function completeTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      entries: {
        where: { placement: 1 },
        include: { user: { include: { wallet: true } } },
      },
      _count: { select: { entries: true } },
    },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== req.user!.id && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  const winnerEntries = tournament.entries.filter((e) => e.placement === 1);
  if (winnerEntries.length === 0) {
    res.status(400).json({ success: false, message: 'No winner entry found. Update placement to 1 first.' });
    return;
  }

  const winner = winnerEntries[0];
  const winnerWallet = winner.user?.wallet;
  if (!winnerWallet) {
    res.status(400).json({ success: false, message: 'Winner wallet not found' });
    return;
  }

  const hostCommissionNum = Number(tournament.hostCommission);
  const platformCommissionNum = Number(tournament.platformCommission);
  const prizePoolNum = Number(tournament.prizePool);
  const totalEntryCollection = Number(tournament.remainingPool) + hostCommissionNum + platformCommissionNum;
  const fractionalSurplus = prizePoolNum > 0 ? totalEntryCollection - prizePoolNum - hostCommissionNum - platformCommissionNum : 0;

  if (hostCommissionNum > 0) {
    const hostWallet = await prisma.wallet.findUnique({ where: { userId: tournament.creatorId } });
    if (hostWallet) {
      await prisma.wallet.update({
        where: { id: hostWallet.id },
        data: { balance: { increment: hostCommissionNum } },
      });
      await prisma.transaction.create({
        data: {
          walletId: hostWallet.id,
          userId: tournament.creatorId,
          type: 'PRIZE',
          status: 'COMPLETED',
          amount: hostCommissionNum,
          description: `Host commission for: ${tournament.title}`,
        },
      });
    }
  }

  if (platformCommissionNum > 0 || fractionalSurplus > 0) {
    const adminEmail = 'ymanit330@gmail.com';
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (adminUser) {
      let adminWallet = await prisma.wallet.findUnique({ where: { userId: adminUser.id } });
      if (!adminWallet) {
        adminWallet = await prisma.wallet.create({ data: { userId: adminUser.id } });
      }
      const adminAmount = platformCommissionNum + (fractionalSurplus > 0 ? fractionalSurplus : 0);
      if (adminAmount > 0) {
        await prisma.wallet.update({
          where: { id: adminWallet.id },
          data: { balance: { increment: adminAmount } },
        });
        await prisma.transaction.create({
          data: {
            walletId: adminWallet.id,
            userId: adminUser.id,
            type: 'PRIZE',
            status: 'COMPLETED',
            amount: adminAmount,
            description: `Platform commission + surplus for: ${tournament.title}`,
          },
        });
      }
    }
  }

  const escrows = await escrowService.getTournamentEscrows(tournamentId);
  const heldEscrows = escrows.filter((e) => e.status === 'HELD');

  for (const escrow of heldEscrows) {
    await escrowService.releaseToWinner(escrow.id, winnerWallet.id, winner.user!.id);
  }

  if (prizePoolNum > 0) {
    await prisma.wallet.update({
      where: { id: winnerWallet.id },
      data: { balance: { increment: prizePoolNum } },
    });
    await prisma.transaction.create({
      data: {
        walletId: winnerWallet.id,
        userId: winner.user!.id,
        type: 'PRIZE',
        status: 'COMPLETED',
        amount: prizePoolNum,
        description: `Winner prize for: ${tournament.title}`,
      },
    });
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.COMPLETED, endTime: new Date() },
  });

  res.json({
    success: true,
    message: `Tournament completed! Winner: ${winner.user?.username || 'Unknown'}. Prize: ₹${prizePoolNum}. Host commission: ₹${hostCommissionNum}`,
    data: updated,
  });
}

export async function updateTournamentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status } = req.body;
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  const updated = await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: status as TournamentStatus },
  });

  res.json({ success: true, data: updated });
}

export async function delayTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { newStartTime } = req.body;
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  if (tournament.delayedCount >= 3) {
    res.status(400).json({ success: false, message: 'Maximum 3 delays allowed per tournament' });
    return;
  }

  const newDate = new Date(newStartTime);
  if (newDate <= tournament.startTime) {
    res.status(400).json({ success: false, message: 'New start time must be after current start time' });
    return;
  }

  const updated = await prisma.tournament.update({
    where: { id: req.params.id },
    data: {
      startTime: newDate,
      delayedCount: { increment: 1 },
      delayedAt: new Date(),
      status: tournament.status === TournamentStatus.ACTIVE ? TournamentStatus.REGISTRATION : tournament.status,
    },
  });

  await notificationService.notifyTournamentDelayed(tournament.id, newDate);

  res.json({ success: true, message: `Tournament delayed to ${newDate.toLocaleString()}`, data: updated });
}

export async function getTournamentEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId: req.params.id },
    include: {
      user: { select: { id: true, username: true, ign: true, freeFireId: true, displayName: true, gameLevel: true, isVerified: true } },
      team: {
        select: {
          id: true,
          name: true,
          tag: true,
          members: {
            include: {
              user: { select: { id: true, username: true, ign: true, freeFireId: true, gameLevel: true, isVerified: true } },
            },
          },
        },
      },
    },
    orderBy: { registeredAt: 'asc' },
  });

  const isTeam = tournament.format === 'DUO' || tournament.format === 'SQUAD';
  const displayEntries = isTeam ? entries.filter((e) => e.teamId !== null) : entries;

  res.json({ success: true, data: displayEntries });
}

export async function updateRoomDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { roomId, roomPassword } = req.body;
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== req.user!.id && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return;
  }

  const updated = await prisma.tournament.update({
    where: { id: req.params.id },
    data: {
      roomId: typeof roomId === 'string' ? roomId.trim() : null,
      roomPassword: typeof roomPassword === 'string' ? roomPassword.trim() : null,
    },
  });

  try {
    await cacheDelPattern('tournaments:list*');
    await cacheDel(`tournament:${req.params.id}`);
  } catch (cacheErr) {
    console.warn('[HostController] Failed to clear cache:', cacheErr);
  }

  res.json({
    success: true,
    message: 'Room credentials updated successfully',
    data: {
      id: updated.id,
      roomId: updated.roomId,
      roomPassword: updated.roomPassword,
    },
  });
}
