import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentFormat, TournamentStatus, Platform, GameMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { escrowService } from '../services/escrow.service';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from '../config/redis';
import { validatePrizePool } from '../services/commission.service';
import { gameProfileService } from '../services/gameProfile.service';
import { syncTournamentStatuses } from '../utils/tournamentStatus';
import { notificationService } from '../services/notification.service';

export async function createTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = req.body;

  const entryFeeValue = Number(data.entryFee);
  const isFree =
    data.isFree === true ||
    !Number.isFinite(entryFeeValue) ||
    entryFeeValue <= 0;

  const entryFeeNum = isFree ? 0 : entryFeeValue;
  const maxPlayers = data.maxParticipants;
  const prizePoolNum = isFree ? 0 : Number(data.prizePool);

  if (!isFree) {
    const validation = validatePrizePool(entryFeeNum, maxPlayers, prizePoolNum, data.gameMode);
    if (!validation.valid) {
      res.status(400).json({ success: false, message: validation.message, breakdown: validation.breakdown });
      return;
    }

    const lastTour = await prisma.tournament.findFirst({ orderBy: { uid: 'desc' } });
    const lastTourNum = lastTour?.uid ? parseInt(lastTour.uid.replace('T-', '')) || 9000 : 9000;
    const tourUid = `T-${lastTourNum + 1}`;

    const { minLevel: _minLevel, isFree: _isFree, ...cleanData } = data;
    const reqLevel = parseInt(String(data.requiredLevel ?? data.minLevel ?? 0), 10) || 0;

    const tournament = await prisma.tournament.create({
      data: {
        ...cleanData,
        uid: tourUid,
        requiredLevel: reqLevel,
        entryFee: new Decimal(entryFeeNum),
        prizePool: new Decimal(prizePoolNum),
        creatorId: req.user!.id,
        status: TournamentStatus.REGISTRATION,
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

    await cacheDelPattern('tournaments:list*');

    // Fire-and-forget: notify subscribed users about the new tournament
    notificationService.notifyNewTournament(tournament.id, tournament.title, entryFeeNum).catch((err) => {
      console.error('[Tournament] Failed to send new-tournament notifications:', err);
    });

    res.status(201).json({ success: true, data: tournament, breakdown: validation.breakdown });
    return;
  }

  // Free tournament — skip validation, set all commission fields to 0
  const lastTour = await prisma.tournament.findFirst({ orderBy: { uid: 'desc' } });
  const lastTourNum = lastTour?.uid ? parseInt(lastTour.uid.replace('T-', '')) || 9000 : 9000;
  const tourUid = `T-${lastTourNum + 1}`;

  const { minLevel: _minLevel, isFree: _isFree, ...cleanFreeData } = data;
  const reqFreeLevel = parseInt(String(data.requiredLevel ?? data.minLevel ?? 0), 10) || 0;

  const tournament = await prisma.tournament.create({
    data: {
      ...cleanFreeData,
      uid: tourUid,
      requiredLevel: reqFreeLevel,
      entryFee: new Decimal(0),
      prizePool: new Decimal(Number(data.prizePool) || 0),
      creatorId: req.user!.id,
      status: TournamentStatus.REGISTRATION,
      registrationStart: new Date(data.registrationStart),
      registrationEnd: new Date(data.registrationEnd),
      startTime: new Date(data.startTime),
      platformCommission: new Decimal(0),
      hostCommission: new Decimal(0),
      remainingPool: new Decimal(0),
      prizeFirst: new Decimal(Number(data.prizeFirst) || 0),
      prizeSecond: data.prizeSecond != null && Number(data.prizeSecond) > 0 ? new Decimal(Number(data.prizeSecond)) : null,
      prizeThird: data.prizeThird != null && Number(data.prizeThird) > 0 ? new Decimal(Number(data.prizeThird)) : null,
    },
    include: { creator: { select: { id: true, username: true } } },
  });

  await cacheDelPattern('tournaments:list*');

  // Fire-and-forget: notify subscribed users about the new free tournament
  notificationService.notifyNewTournament(tournament.id, tournament.title, 0).catch((err) => {
    console.error('[Tournament] Failed to send new-tournament notifications:', err);
  });

  res.status(201).json({ success: true, data: tournament, message: 'Free tournament created. You can award prize money later from the tournament list.' });
}

export async function listTournaments(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Lazily persist time-based transitions (ACTIVE >1h past start → COMPLETED) before querying
  await syncTournamentStatuses();

  const page = parseInt(req.query.page as string) || 1;
  const rawAll = req.query.all;
  const isAll = rawAll === 'true' || rawAll === '1' || rawAll === true || req.query.status === 'ALL';
  const limit = parseInt(req.query.limit as string) || (isAll ? 100 : 20);
  const status = req.query.status as TournamentStatus | 'ALL' | undefined;
  const format = req.query.format as TournamentFormat | undefined;
  const platform = req.query.platform as Platform | undefined;
  const gameMode = req.query.gameMode as GameMode | undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const skip = (page - 1) * limit;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  let where: any = {};

  if (isAll) {
    // Admin / All mode: No time restrictions; include all tournaments
    if (status && status !== 'ALL') {
      where.status = status;
    }
  } else {
    // Public listing mode: active/upcoming tournaments
    if (status) {
      if (status === TournamentStatus.REGISTRATION) {
        where.status = TournamentStatus.REGISTRATION;
        where.startTime = { gt: now };
        where.registrationEnd = { gt: now };
      } else if (status === TournamentStatus.ACTIVE) {
        where.status = TournamentStatus.ACTIVE;
        where.startTime = { gte: oneHourAgo };
      } else if (status === TournamentStatus.COMPLETED) {
        where.OR = [
          { status: { in: [TournamentStatus.COMPLETED, TournamentStatus.PAID] as TournamentStatus[] } },
          { startTime: { lt: oneHourAgo } },
        ];
      } else {
        where.status = status;
      }
    } else {
      // Default (live/open listings): strictly hide anything terminal OR expired (>1h past start or past endTime)
      where.status = { notIn: [TournamentStatus.COMPLETED, TournamentStatus.CANCELLED, TournamentStatus.PAID] as TournamentStatus[] };
      where.startTime = { gte: oneHourAgo };
      where.OR = [
        { endTime: null },
        { endTime: { gt: now } },
      ];
    }
  }

  if (format) where.format = format;
  if (platform) where.platform = platform;
  if (gameMode) where.gameMode = gameMode;

  if (search) {
    const searchConditions = [
      { title: { contains: search, mode: 'insensitive' } },
      { uid: { contains: search, mode: 'insensitive' } },
      { id: { contains: search, mode: 'insensitive' } },
      { mapName: { contains: search, mode: 'insensitive' } },
      { creator: { username: { contains: search, mode: 'insensitive' } } },
    ];
    if (where.OR) {
      where = {
        AND: [
          where,
          { OR: searchConditions },
        ],
      };
    } else {
      where.OR = searchConditions;
    }
  }

  const cacheKey = isAll ? null : `tournaments:list:${page}:${limit}:${status || ''}:${format || ''}:${platform || ''}:${gameMode || ''}:${search || ''}`;
  const cached = cacheKey ? await cacheGet<{ tournaments: unknown[]; total: number }>(cacheKey) : null;

  if (cached) {
    res.json({
      success: true,
      data: cached.tournaments,
      pagination: { page, limit, total: cached.total, totalPages: Math.ceil(cached.total / limit) },
    });
    return;
  }

  const orderBy = isAll ? { createdAt: 'desc' as const } : { startTime: 'asc' as const };

  const [tournaments, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { entries: true } },
      },
      skip,
      take: limit,
      orderBy,
    }),
    prisma.tournament.count({ where }),
  ]);

  if (cacheKey) {
    await cacheSet(cacheKey, { tournaments, total }, 60);
  }

  res.json({
    success: true,
    data: tournaments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function checkPlayerEligibility(req: AuthenticatedRequest, res: Response): Promise<void> {
  const uid = String(req.query.uid || '').trim();
  const minLevel = parseInt(String(req.query.requiredLevel || 0), 10) || 0;

  if (!uid) {
    res.status(400).json({ success: false, message: 'Free Fire UID is required' });
    return;
  }

  const player = await prisma.user.findUnique({
    where: { freeFireId: uid },
    select: {
      id: true,
      username: true,
      ign: true,
      freeFireId: true,
      gameLevel: true,
      isVerified: true,
      avatarUrl: true,
    },
  });

  if (!player) {
    res.status(404).json({
      success: false,
      message: `Player with Free Fire ID "${uid}" is not registered on Neobattle. Teammates must create an account first.`,
    });
    return;
  }

  if (!player.isVerified) {
    res.status(400).json({
      success: false,
      message: `Player "${player.username}" (UID: ${uid}) has not verified their Free Fire ID.`,
      data: player,
    });
    return;
  }

  if (player.gameLevel < minLevel) {
    res.status(400).json({
      success: false,
      message: `Player "${player.username}" (Level ${player.gameLevel}) is below required Level ${minLevel}.`,
      data: player,
    });
    return;
  }

  res.json({
    success: true,
    data: player,
    message: `Verified: ${player.username} (Level ${player.gameLevel})`,
  });
}

export async function getTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  await syncTournamentStatuses();

  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      creator: { select: { id: true, username: true } },
      entries: {
        include: {
          user: { select: { id: true, uid: true, username: true, avatarUrl: true, freeFireId: true, ign: true, gameLevel: true, isVerified: true } },
          team: {
            select: {
              id: true,
              name: true,
              tag: true,
              members: {
                include: {
                  user: { select: { id: true, uid: true, username: true, freeFireId: true, ign: true, gameLevel: true, isVerified: true, avatarUrl: true } },
                },
              },
            },
          },
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
    ? tournament.entries.some((e) => e.userId === req.user!.id || e.team?.members.some((m) => m.userId === req.user!.id))
    : false;

  const now = new Date();
  const fiveMinBeforeStart = new Date(tournament.startTime.getTime() - 5 * 60 * 1000);
  const canSeeRoom = isRegistered && now >= fiveMinBeforeStart;

  const { roomId, roomPassword, ...rest } = tournament;
  const isTeam = tournament.format === 'DUO' || tournament.format === 'SQUAD';
  const displayEntries = isTeam
    ? rest.entries.filter((e) => e.teamId !== null)
    : rest.entries;

  res.json({
    success: true,
    data: {
      ...rest,
      requiredLevel: rest.requiredLevel || 0,
      minLevel: rest.requiredLevel || 0,
      entries: displayEntries,
      isRegistered,
      canSeeRoom,
      ...(canSeeRoom ? { roomId, roomPassword } : {}),
    },
  });
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
  await syncTournamentStatuses();

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

  console.log(`[registerForTournament] tournamentId=${tournamentId} status=${tournament.status} serverTime=${new Date().toISOString()} regStart=${tournament.registrationStart.toISOString()} regEnd=${tournament.registrationEnd.toISOString()}`);

  const now = new Date();
  if (now >= tournament.startTime) {
    res.status(400).json({ success: false, message: 'Tournament has already started. Registration is closed.' });
    return;
  }

  if (now > tournament.registrationEnd) {
    res.status(400).json({ success: false, message: 'Registration deadline has passed.' });
    return;
  }

  if (tournament.status !== TournamentStatus.REGISTRATION) {
    res.status(400).json({ success: false, message: 'Registration is closed for this tournament' });
    return;
  }

  const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { isVerified: true, gameLevel: true } });
  if (!currentUser) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  console.log(`[registerForTournament] userCheck: isVerified=${currentUser.isVerified} gameLevel=${currentUser.gameLevel} requiredLevel=${tournament.requiredLevel}`);

  if (!currentUser.isVerified) {
    res.status(403).json({ success: false, message: 'Free Fire ID not verified. Please complete verification first.' });
    return;
  }
  if (currentUser.gameLevel < tournament.requiredLevel) {
    res.status(403).json({ success: false, message: `Your level (${currentUser.gameLevel}) is too low. This tournament requires Level ${tournament.requiredLevel}.` });
    return;
  }

  console.log(`[registerForTournament] windowCheck: now=${now.toISOString()} registrationStart=${tournament.registrationStart.toISOString()} registrationEnd=${tournament.registrationEnd.toISOString()} insideWindow=${now >= tournament.registrationStart && now <= tournament.registrationEnd}`);
  if (now < tournament.registrationStart) {
    res.status(400).json({ success: false, message: 'Registration has not opened yet' });
    return;
  }

  if (tournament._count.entries >= tournament.maxParticipants) {
    res.status(400).json({ success: false, message: 'Tournament is full' });
    return;
  }

  if (tournament.format === TournamentFormat.DUO || tournament.format === TournamentFormat.SQUAD) {
    const requiredSlots = tournament.format === TournamentFormat.DUO ? 2 : 4;
    const { teamName, teamId } = req.body;
    let inputUids: string[] = Array.isArray(req.body.teamUids)
      ? req.body.teamUids
      : (Array.isArray(req.body.squadUids) ? req.body.squadUids : []);

    // If teamId provided and no UIDs, look up existing team members
    if (inputUids.length === 0 && teamId) {
      const existingTeam = await prisma.team.findUnique({
        where: { id: teamId },
        include: { members: { include: { user: true } } },
      });
      if (existingTeam) {
        inputUids = existingTeam.members.map((m) => m.user?.freeFireId).filter(Boolean) as string[];
      }
    }

    // If user provided (requiredSlots - 1) UIDs, prepend current user's Free Fire ID
    const currentUid = (currentUser as any).freeFireId || '';
    if (inputUids.length === requiredSlots - 1 && currentUid) {
      inputUids = [currentUid, ...inputUids];
    }

    const trimmedUids = inputUids.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean);

    if (trimmedUids.length !== requiredSlots) {
      res.status(400).json({
        success: false,
        message: `${tournament.format} registration requires exactly ${requiredSlots} player Free Fire IDs (provided ${trimmedUids.length}).`,
      });
      return;
    }

    // Ensure all UIDs are unique
    if (new Set(trimmedUids).size !== requiredSlots) {
      res.status(400).json({
        success: false,
        message: 'All player Free Fire IDs in the roster must be unique.',
      });
      return;
    }

    // Strictly validate each player against registered Neobattle accounts
    const verifiedPlayers: { id: string; username: string; ign: string | null; freeFireId: string | null; gameLevel: number }[] = [];

    for (const uid of trimmedUids) {
      const player = await prisma.user.findUnique({
        where: { freeFireId: uid },
        select: { id: true, username: true, ign: true, freeFireId: true, gameLevel: true, isVerified: true },
      });

      if (!player) {
        res.status(400).json({
          success: false,
          message: `Player with Free Fire ID "${uid}" is not registered on Neobattle. Teammates must create an account first.`,
        });
        return;
      }

      if (!player.isVerified) {
        res.status(400).json({
          success: false,
          message: `Player "${player.username}" (${uid}) does not have a verified Free Fire ID. All teammates must be verified.`,
        });
        return;
      }

      if (player.gameLevel < tournament.requiredLevel) {
        res.status(400).json({
          success: false,
          message: `Player "${player.username}" (Level ${player.gameLevel}) does not meet the tournament requirement of Level ${tournament.requiredLevel}.`,
        });
        return;
      }

      // Check if player is already in this tournament
      const alreadyInTournament = await prisma.tournamentEntry.findFirst({
        where: {
          tournamentId,
          OR: [
            { userId: player.id },
            { team: { members: { some: { userId: player.id } } } },
          ],
        },
      });

      if (alreadyInTournament) {
        res.status(409).json({
          success: false,
          message: `Player "${player.username}" (${uid}) is already registered in this tournament.`,
        });
        return;
      }

      verifiedPlayers.push(player);
    }

    // Total entry fee for the entire team
    const totalTeamFee = Number(tournament.entryFee) * requiredSlots;
    let isPaid = totalTeamFee === 0;

    if (totalTeamFee > 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || Number(wallet.balance) < totalTeamFee) {
        res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Team registration requires ₹${totalTeamFee} (${requiredSlots} × ₹${Number(tournament.entryFee)}).`,
        });
        return;
      }

      const holdResult = await escrowService.holdFunds(wallet.id, userId, tournamentId, totalTeamFee);
      if (!holdResult.success) {
        res.status(400).json({ success: false, message: holdResult.message });
        return;
      }
      isPaid = true;
    }

    // Create a new Team record for this tournament roster
    const rawTeamName = teamName?.trim() || `${(currentUser as any).username || 'Player'}'s Team`;
    const uniqueSuffix = Date.now().toString().slice(-4) + Math.floor(10 + Math.random() * 90);
    const safeTag = rawTeamName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'TM';
    const uniqueTeamTag = `${safeTag}${uniqueSuffix.slice(-3)}`;

    const team = await prisma.team.create({
      data: {
        name: `${rawTeamName} #${uniqueSuffix}`,
        tag: uniqueTeamTag.slice(0, 6),
        leaderId: userId,
        maxMembers: requiredSlots,
        members: {
          create: verifiedPlayers.map((p) => ({
            userId: p.id,
            role: p.id === userId ? 'LEADER' : 'MEMBER',
          })),
        },
      },
    });

    const entry = await prisma.tournamentEntry.create({
      data: {
        tournamentId,
        userId,
        teamId: team.id,
        isPaid,
      },
      include: {
        tournament: { select: { title: true, startTime: true } },
        user: { select: { id: true, username: true } },
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
    });

    res.status(201).json({
      success: true,
      data: entry,
      message: `Team "${team.name}" registered successfully with ${verifiedPlayers.length} verified players!`,
    });
    return;
  }

  // SOLO Registration
  const existingSolo = await prisma.tournamentEntry.findFirst({
    where: {
      tournamentId,
      OR: [
        { userId },
        { team: { members: { some: { userId } } } },
      ],
    },
  });

  if (existingSolo) {
    res.status(409).json({ success: false, message: 'You are already registered in this tournament' });
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
      userId,
      isPaid,
    },
    include: {
      tournament: { select: { title: true, startTime: true } },
      user: { select: { id: true, username: true, freeFireId: true, ign: true } },
    },
  });

  res.status(201).json({ success: true, data: entry, message: 'Successfully registered for tournament!' });
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

  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
  const isCreator = tournament.creatorId === req.user!.id;
  if (!isAdmin && !isCreator) {
    res.status(403).json({ success: false, message: 'Only the tournament host or an admin can delete this tournament' });
    return;
  }

  if (tournament.status === TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Cannot delete an active tournament in progress. Please complete or cancel it first.' });
    return;
  }

  // 1. Refund any held player escrows before deleting from database
  try {
    const escrows = await escrowService.getTournamentEscrows(req.params.id);
    for (const escrow of escrows) {
      if (escrow.status === 'HELD' && escrow.wallet?.user?.id) {
        await escrowService.refundEscrow(escrow.id, escrow.wallet.user.id);
      }
    }
  } catch (escrowErr) {
    console.error('[Tournament] Failed to refund escrows during tournament deletion:', escrowErr);
  }

  // 2. Permanently remove the tournament from the database
  await prisma.tournament.delete({
    where: { id: req.params.id },
  });

  await cacheDelPattern('tournaments:list*');
  await cacheDel(`tournament:${req.params.id}`);

  res.json({ success: true, message: 'Tournament deleted successfully' });
}

export async function completeTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
  const isCreator = tournament.creatorId === req.user!.id;
  if (!isAdmin && !isCreator) {
    res.status(403).json({ success: false, message: 'Only the tournament host or an admin can end this tournament' });
    return;
  }

  if (tournament.status === TournamentStatus.COMPLETED || tournament.status === TournamentStatus.CANCELLED || tournament.status === TournamentStatus.PAID) {
    res.status(400).json({ success: false, message: `Tournament is already ${tournament.status.toLowerCase()}` });
    return;
  }

  if (tournament.status !== TournamentStatus.ACTIVE && new Date(tournament.startTime).getTime() > Date.now() && !isAdmin) {
    res.status(400).json({ success: false, message: 'Tournament has not started yet — it can only be ended after its start time' });
    return;
  }

  const updated = await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: TournamentStatus.COMPLETED, endTime: new Date() },
  });

  await cacheDelPattern('tournaments:list*');
  await cacheDel(`tournament:${req.params.id}`);

  res.json({ success: true, data: updated, message: 'Tournament marked as completed' });
}
