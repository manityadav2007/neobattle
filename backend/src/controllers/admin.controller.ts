import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { UserRole, TournamentStatus, TransactionType, TransactionStatus, Prisma, RedeemStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { escrowService } from '../services/escrow.service';
import { notificationService } from '../services/notification.service';

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim();
}

async function findUserByIdentifier(identifier: string) {
  const key = normalizeIdentifier(identifier);
  if (!key) return null;

  return prisma.user.findFirst({
    where: {
      OR: [
        { id: key },
        { uid: key },
        { email: key.toLowerCase() },
      ],
    },
    select: { id: true, username: true, uid: true, email: true },
  });
}

export async function getDashboardStats(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const [
    totalUsers,
    totalTournaments,
    activeTournaments,
    pendingVerifications,
    totalTransactions,
    recentUsers,
    platformCommissionAgg,
    pendingPayouts,
    pendingDeposits,
    pendingRedeems,
    totalHosts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: TournamentStatus.ACTIVE } }),
    prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
    prisma.transaction.count(),
    prisma.user.findMany({
      select: { id: true, uid: true, username: true, email: true, createdAt: true, role: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.tournament.aggregate({ _sum: { platformCommission: true } }),
    prisma.winnerProof.count({ where: { status: 'PENDING' } }),
    prisma.depositRequest.count({ where: { status: 'PENDING' } }),
    prisma.redeemRequest.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { role: 'HOST' } }),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalTournaments,
      activeTournaments,
      pendingVerifications,
      totalTransactions,
      totalCommissionCollected: Number(platformCommissionAgg._sum.platformCommission || 0),
      pendingPayouts,
      pendingDeposits,
      pendingRedeems,
      recentUsers,
      totalHosts,
    },
  });
}

export async function listAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        wallet: { select: { balance: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ]);

  res.json({
    success: true,
    data: users.map((u) => ({
      ...u,
      wallet: u.wallet ? { balance: Number(u.wallet.balance) } : null,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { role } = req.body;
  const userId = req.params.id;

  if (!Object.values(UserRole).includes(role)) {
    res.status(400).json({ success: false, message: 'Invalid role' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, username: true, role: true },
  });

  res.json({ success: true, data: user });
}

export async function promoteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.params.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    res.status(400).json({ success: false, message: 'Cannot promote admin users' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: 'HOST' },
    select: { id: true, username: true, email: true, role: true },
  });

  res.json({ success: true, message: 'User promoted to Host', data: updated });
}

export async function demoteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.params.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    res.status(400).json({ success: false, message: 'Cannot demote admin users' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: 'PLAYER' },
    select: { id: true, username: true, email: true, role: true },
  });

  res.json({ success: true, message: 'User demoted to Player', data: updated });
}

export async function toggleUserActive(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: !user.isActive },
    select: { id: true, username: true, isActive: true },
  });

  res.json({ success: true, data: updated });
}

export async function releaseTournamentPrizes(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const tournamentId = req.params.id;
  const { winnerUserId } = req.body;

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  const winnerWallet = await prisma.wallet.findUnique({ where: { userId: winnerUserId } });
  if (!winnerWallet) {
    res.status(404).json({ success: false, message: 'Winner wallet not found' });
    return;
  }

  const escrows = await escrowService.getTournamentEscrows(tournamentId);
  const heldEscrows = escrows.filter((e) => e.status === 'HELD');

  if (heldEscrows.length === 0) {
    res.status(400).json({ success: false, message: 'No held escrows for this tournament' });
    return;
  }

  const results = [];
  for (const escrow of heldEscrows) {
    const result = await escrowService.releaseToWinner(escrow.id, winnerWallet.id, winnerUserId);
    results.push(result);
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.COMPLETED, endTime: new Date() },
  });

  res.json({ success: true, message: 'Prizes released', data: results });
}

export async function refundTournament(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id;

  const escrows = await escrowService.getTournamentEscrows(tournamentId);
  const heldEscrows = escrows.filter((e) => e.status === 'HELD');

  const results = [];
  for (const escrow of heldEscrows) {
    const userId = escrow.wallet.user.id;
    const result = await escrowService.refundEscrow(escrow.id, userId);
    results.push(result);
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.CANCELLED },
  });

  res.json({ success: true, message: 'Tournament refunded', data: results });
}

export async function awardPrize(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId, amount, tournamentId } = req.body;

  if (!userId || !amount || !tournamentId) {
    res.status(400).json({ success: false, message: 'userId, amount, and tournamentId are required' });
    return;
  }

  const prizeAmount = Number(amount);
  if (prizeAmount <= 0) {
    res.status(400).json({ success: false, message: 'Prize amount must be greater than 0' });
    return;
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (Number(tournament.entryFee) !== 0) {
    res.status(400).json({ success: false, message: 'Prize award is only available for free tournaments' });
    return;
  }

  const winner = await prisma.user.findUnique({ where: { id: userId } });
  if (!winner) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    res.status(404).json({ success: false, message: 'Winner wallet not found' });
    return;
  }

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: prizeAmount } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: TransactionType.PRIZE,
        status: TransactionStatus.COMPLETED,
        amount: new Decimal(prizeAmount),
        description: `Prize money awarded for tournament: ${tournament.title}`,
        metadata: { tournamentId, awardedBy: req.user!.id },
      },
    }),
  ]);

  res.json({
    success: true,
    message: `₹${prizeAmount} awarded to ${winner.username} for tournament "${tournament.title}"`,
  });
}

export async function verifyUserGameLevel(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { gameLevel } = req.body;
  const userId = req.params.id;

  if (gameLevel === undefined || gameLevel === null || gameLevel < 0) {
    res.status(400).json({ success: false, message: 'gameLevel is required and must be >= 0' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true, gameLevel: Number(gameLevel) },
      select: { id: true, uid: true, username: true, freeFireId: true, isVerified: true, gameLevel: true },
    });

    res.json({ success: true, data: updated, message: `User verified with game level ${gameLevel}` });
  } catch (error) {
    console.error('[Admin] verifyUserGameLevel error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify user' });
  }
}

export async function getRevenueStats(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [totalDeposits, totalWithdrawals, totalPrizePayouts, totalPlatformCommission] = await Promise.all([
      prisma.transaction.aggregate({
        where: { type: TransactionType.DEPOSIT, status: TransactionStatus.COMPLETED },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: TransactionType.WITHDRAWAL, status: TransactionStatus.COMPLETED },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: TransactionType.PRIZE, status: TransactionStatus.COMPLETED },
        _sum: { amount: true },
      }),
      prisma.tournament.aggregate({
        _sum: { platformCommission: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalDeposits: Number(totalDeposits._sum.amount || 0),
        totalWithdrawals: Number(totalWithdrawals._sum.amount || 0),
        totalPrizePayouts: Number(totalPrizePayouts._sum.amount || 0),
        totalPlatformCommission: Number(totalPlatformCommission._sum.platformCommission || 0),
      },
    });
  } catch (error) {
    console.error('[Admin] getRevenueStats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue stats' });
  }
}

export async function getTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, uid: true, username: true, email: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: { transactions, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[Admin] getTransactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
}

export async function adjustWalletByUid(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { uid, amount, reason } = req.body;

  if (!uid || amount === undefined || amount === null || amount === 0) {
    res.status(400).json({ success: false, message: 'uid and non-zero amount are required' });
    return;
  }

  const user = await findUserByIdentifier(uid);
  if (!user) {
    res.status(404).json({ success: false, message: `User not found for identifier "${uid}"` });
    return;
  }

  const adjustAmount = Number(amount);
  const isCredit = adjustAmount > 0;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet) throw new Error('Wallet not found');

      if (!isCredit && Number(wallet.balance) < Math.abs(adjustAmount)) {
        throw new Error(`Insufficient balance. ${user.username} has ${formatCurrency(Number(wallet.balance))}`);
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: adjustAmount } },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId: user.id,
          type: isCredit ? TransactionType.DEPOSIT : TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(Math.abs(adjustAmount)),
          description: reason || `Admin ${isCredit ? 'credit' : 'debit'} adjustment (UID: ${uid})`,
          metadata: { adjustedBy: req.user!.id, isAdminAdjustment: true, userUid: uid },
        },
      });
    });

    res.json({
      success: true,
      message: `₹${Math.abs(adjustAmount)} ${isCredit ? 'credited to' : 'debited from'} ${user.username} (${user.uid})`,
    });
  } catch (err: any) {
    console.error('[Admin] adjustWalletByUid error:', err);
    res.status(400).json({ success: false, message: err.message || 'Adjustment failed' });
  }
}

export async function adjustWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId, amount, reason } = req.body;

  if (!userId || amount === undefined || amount === null || amount === 0) {
    res.status(400).json({ success: false, message: 'userId (or uid / email) and non-zero amount are required' });
    return;
  }

  const user = await findUserByIdentifier(userId);
  if (!user) {
    res.status(404).json({ success: false, message: `User not found for identifier "${userId}"` });
    return;
  }

  const adjustAmount = Number(amount);
  const isCredit = adjustAmount > 0;
  const targetUserId = user.id;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: targetUserId } });
      if (!wallet) throw new Error('Wallet not found');

      if (!isCredit && Number(wallet.balance) < Math.abs(adjustAmount)) {
        throw new Error(`Insufficient balance. User has ${formatCurrency(Number(wallet.balance))}`);
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: adjustAmount } },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId: targetUserId,
          type: isCredit ? TransactionType.DEPOSIT : TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(Math.abs(adjustAmount)),
          description: reason || `Admin ${isCredit ? 'credit' : 'debit'} adjustment`,
          metadata: { adjustedBy: req.user!.id, isAdminAdjustment: true, userUid: user.uid },
        },
      });
    });

    res.json({
      success: true,
      message: `₹${Math.abs(adjustAmount)} ${isCredit ? 'credited to' : 'debited from'} ${user.username} (${user.uid})`,
    });
  } catch (err: any) {
    console.error('[Admin] adjustWallet error:', err);
    res.status(400).json({ success: false, message: err.message || 'Adjustment failed' });
  }
}

export async function getSystemHealth(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        database: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  } catch {
    res.status(503).json({ success: false, data: { database: 'unhealthy' } });
  }
}

export async function distributeTournamentPrizes(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: {
      entries: {
        include: {
          user: { select: { id: true, username: true } },
          team: {
            include: {
              members: {
                include: { user: { select: { id: true, username: true } } },
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

  if (tournament.status === TournamentStatus.PAID) {
    res.status(400).json({ success: false, message: 'Prizes for this tournament have already been distributed' });
    return;
  }

  if (tournament.status !== TournamentStatus.COMPLETED) {
    res.status(400).json({ success: false, message: 'Mark the tournament completed before distributing prizes' });
    return;
  }

  const isTeam = tournament.format === 'DUO' || tournament.format === 'SQUAD';
  const shares = [
    { placement: 1, amount: Number(tournament.prizeFirst) || 0, label: isTeam ? '1st Winning Team' : '1st Place' },
    { placement: 2, amount: Number(tournament.prizeSecond) || 0, label: isTeam ? '2nd Winning Team' : '2nd Place' },
    { placement: 3, amount: Number(tournament.prizeThird) || 0, label: isTeam ? '3rd Winning Team' : '3rd Place' },
  ].filter((s) => s.amount > 0);
  interface WinnerPayout {
    placement: number;
    label: string;
    amount: number;
    userId: string;
    username: string;
  }

  const winnerPayouts: WinnerPayout[] = [];

  for (const s of shares) {
    const entry = tournament.entries.find((e) => e.placement === s.placement);
    if (!entry) {
      res.status(400).json({
        success: false,
        message: `No winner entry recorded with placement #${s.placement} (${s.label}). Set player placements before distributing.`,
      });
      return;
    }

    if (entry.team && entry.team.members.length > 0) {
      const members = entry.team.members.map((m) => m.user);
      const splitAmount = Math.floor(s.amount / members.length);
      const remainder = s.amount - (splitAmount * members.length);

      members.forEach((m, idx) => {
        const payout = idx === 0 ? splitAmount + remainder : splitAmount;
        winnerPayouts.push({
          placement: s.placement,
          label: `${s.label} (${entry.team!.name})`,
          amount: payout,
          userId: m.id,
          username: m.username,
        });
      });
    } else if (entry.user) {
      winnerPayouts.push({
        placement: s.placement,
        label: s.label,
        amount: s.amount,
        userId: entry.user.id,
        username: entry.user.username,
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Winner entry #${s.placement} has no associated user or team.`,
      });
      return;
    }
  }

  const hostAmount = Math.round(Number(tournament.hostCommission) || 0);
  const totalPrize = winnerPayouts.reduce((sum, w) => sum + w.amount, 0);
  const totalCollection = Math.round(Number(tournament.entryFee) * tournament.maxParticipants);
  const platformAmount = totalCollection > 0
    ? Math.max(0, totalCollection - hostAmount - totalPrize)
    : Math.round(Number(tournament.platformCommission) || 0);

  const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const adminWallet = adminUser ? await prisma.wallet.findUnique({ where: { userId: adminUser.id } }) : null;
  const hostWallet = await prisma.wallet.findUnique({ where: { userId: tournament.creatorId } });

  const winPoints = tournament.gameMode === 'CLASH_SQUAD' ? 2 : 4;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Stamp placements on the team entries for record-keeping
      for (const w of winnerPayouts) {
        await tx.tournamentEntry.updateMany({
          where: {
            tournamentId: tournament.id,
            team: { members: { some: { userId: w.userId } } },
          },
          data: { placement: w.placement },
        });
      }

      // 2. Award leaderboard points & ensure individual entries exist for each winning player / team member
      for (const w of winnerPayouts) {
        const isWinner = w.placement === 1;
        const pointsToAdd = isWinner ? winPoints : 0;

        const existingEntry = await tx.tournamentEntry.findUnique({
          where: {
            tournamentId_userId: {
              tournamentId: tournament.id,
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
          await tx.tournamentEntry.create({
            data: {
              tournamentId: tournament.id,
              userId: w.userId,
              placement: w.placement,
              points: pointsToAdd,
              isPaid: true,
            },
          });
        }
      }

      // Winner payouts
      for (const w of winnerPayouts) {
        if (w.amount > 0) {
          const wallet = await tx.wallet.findUnique({ where: { userId: w.userId } });
          if (!wallet) throw new Error(`Wallet missing for ${w.username} (${w.label})`);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: w.amount } },
          });
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              userId: w.userId,
              type: TransactionType.PRIZE,
              status: TransactionStatus.COMPLETED,
              amount: new Decimal(w.amount),
              description: `${w.label} prize — ${tournament.title}`,
              reference: `DIST-${tournament.id.slice(0, 8)}-P${w.placement}-${w.userId.slice(-4)}`,
            },
          });
        }
      }

      // Host commission
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
            reference: `DIST-${tournament.id.slice(0, 8)}-HOST`,
          },
        });
      }

      // Platform revenue
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
            reference: `DIST-${tournament.id.slice(0, 8)}-PLAT`,
          },
        });
      }

      await tx.tournament.update({
        where: { id: tournament.id },
        data: { status: TournamentStatus.PAID },
      });
    });

    // Notify winners and host
    for (const w of winnerPayouts) {
      notificationService.notifyWinnerPayout(w.userId, tournament.title, w.amount, w.label).catch((err) => {
        console.error(`[Notification] Failed to notify winner ${w.userId}:`, err);
      });
    }
    if (hostAmount > 0 && tournament.creatorId) {
      notificationService.notifyHostCommission(tournament.creatorId, tournament.title, hostAmount).catch((err) => {
        console.error(`[Notification] Failed to notify host ${tournament.creatorId}:`, err);
      });
    }

    const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    res.json({
      success: true,
      message:
        `Distributed ${fmt(totalPrize)} to ${winnerPayouts.length} winner(s)` +
        (hostAmount > 0 ? ` + ${fmt(hostAmount)} host commission` : '') +
        (platformAmount > 0 ? ` (+${fmt(platformAmount)} platform revenue). Tournament marked as PAID.` : '. Tournament marked as PAID.'),
    });
  } catch (err: any) {
    console.error('[Admin] distributeTournamentPrizes error:', err);
    res.status(400).json({ success: false, message: err.message || 'Distribution failed — no changes were saved' });
  }
}

export async function listWithdrawals(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const statusParam = (req.query.status as string | undefined)?.toUpperCase();

    // 1. Query Transaction withdrawals
    let txWhere: Prisma.TransactionWhereInput = { type: TransactionType.WITHDRAWAL };
    if (statusParam && statusParam !== 'ALL') {
      if (statusParam === 'PENDING') {
        txWhere.status = TransactionStatus.PENDING;
      } else if (statusParam === 'COMPLETED' || statusParam === 'APPROVED') {
        txWhere.status = TransactionStatus.COMPLETED;
      } else if (statusParam === 'REJECTED' || statusParam === 'CANCELLED') {
        txWhere.status = { in: [TransactionStatus.CANCELLED, TransactionStatus.FAILED] };
      }
    }

    const txWithdrawals = await prisma.transaction.findMany({
      where: txWhere,
      include: {
        user: { select: { id: true, uid: true, username: true, email: true, freeFireId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // 2. Query RedeemRequest
    let redeemWhere: Prisma.RedeemRequestWhereInput = {};
    if (statusParam && statusParam !== 'ALL') {
      if (statusParam === 'PENDING') redeemWhere.status = RedeemStatus.PENDING;
      else if (statusParam === 'APPROVED') redeemWhere.status = RedeemStatus.APPROVED;
      else if (statusParam === 'COMPLETED') redeemWhere.status = RedeemStatus.COMPLETED;
      else if (statusParam === 'REJECTED') redeemWhere.status = RedeemStatus.REJECTED;
    }

    const redeemRequests = await prisma.redeemRequest.findMany({
      where: redeemWhere,
      include: {
        user: { select: { id: true, uid: true, username: true, email: true, freeFireId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Format transactions
    const formattedTx = txWithdrawals.map((tx) => {
      const meta = (tx.metadata as any) || {};
      const payout = meta.payout || {};
      const method = payout.method || (meta.method ? meta.method : (tx.description?.includes('UPI') ? 'UPI' : 'BANK_TRANSFER'));

      let accountDetails = '';
      if (payout.upiId) {
        accountDetails = `UPI: ${payout.upiId}`;
      } else if (payout.bankAccountNumber) {
        accountDetails = `A/C: ${payout.bankAccountNumber} | IFSC: ${payout.bankIfsc || ''}${payout.accountHolderName ? ` | Name: ${payout.accountHolderName}` : ''}`;
      } else if (tx.description) {
        accountDetails = tx.description.replace(/^Withdrawal request to\s*/i, '').replace(/\s*—\s*pending.*$/i, '');
      }

      let status = tx.status as string;
      if (status === 'CANCELLED' || status === 'FAILED') status = 'REJECTED';

      return {
        id: tx.id,
        userId: tx.userId,
        amount: Number(tx.amount),
        type: method,
        status,
        accountDetails,
        payoutMethod: method,
        payoutDetails: payout,
        reference: tx.reference,
        description: tx.description,
        giftCode: meta.redeemCode || meta.giftCode || null,
        rejectionReason: meta.rejectionReason || null,
        createdAt: tx.createdAt.toISOString(),
        user: tx.user,
        source: 'TRANSACTION',
      };
    });

    // Format redeem requests
    const formattedRedeem = redeemRequests.map((r) => ({
      id: r.id,
      userId: r.userId,
      amount: Number(r.amount),
      type: r.type,
      status: r.status as string,
      accountDetails: r.accountDetails || `${r.type} redemption`,
      payoutMethod: r.type,
      payoutDetails: null,
      reference: null,
      description: `Redeem request: ${r.type}`,
      giftCode: r.giftCode,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      user: r.user,
      source: 'REDEEM_REQUEST',
    }));

    const combined = [...formattedTx, ...formattedRedeem].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      success: true,
      data: combined,
    });
  } catch (error) {
    console.error('[Admin] listWithdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests' });
  }
}

export async function reviewWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, reference, rejectionReason, giftCode } = req.body;
    const adminId = req.user!.id;

    if (!['COMPLETED', 'APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status. Must be COMPLETED, APPROVED, or REJECTED.' });
      return;
    }

    // 1. Check if it's a Transaction withdrawal
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: true, user: true },
    });

    if (tx && tx.type === TransactionType.WITHDRAWAL) {
      if (tx.status !== TransactionStatus.PENDING) {
        res.status(400).json({ success: false, message: `Withdrawal has already been ${tx.status.toLowerCase()}` });
        return;
      }

      const meta = (tx.metadata as any) || {};

      if (status === 'COMPLETED' || status === 'APPROVED') {
        const updatedTx = await prisma.transaction.update({
          where: { id },
          data: {
            status: TransactionStatus.COMPLETED,
            reference: reference?.trim() || tx.reference || `WTH-${Date.now().toString(36).toUpperCase()}`,
            metadata: {
              ...meta,
              approvedBy: adminId,
              approvedAt: new Date().toISOString(),
              ...(reference ? { reference: reference.trim() } : {}),
              ...(giftCode ? { giftCode: giftCode.trim() } : {}),
            },
          },
        });

        notificationService.sendToUser(tx.userId, {
          type: 'PAYOUT_APPROVED',
          title: '✅ Withdrawal Successful',
          message: `Your withdrawal of ₹${Number(tx.amount)} has been approved and processed!${reference ? ` Reference: ${reference.trim()}` : ''}`,
          link: '/wallet/history',
        }).catch((err) => console.error('[Notification] Failed to notify withdrawal approval:', err));

        res.json({
          success: true,
          message: `Withdrawal of ₹${Number(tx.amount)} approved and completed!`,
          data: updatedTx,
        });
        return;
      }

      if (status === 'REJECTED') {
        const reason = rejectionReason?.trim() || 'Withdrawal rejected by administrator';

        await prisma.$transaction(async (prismaClient) => {
          // Refund the wallet balance
          await prismaClient.wallet.update({
            where: { id: tx.walletId },
            data: { balance: { increment: tx.amount } },
          });

          // Mark withdrawal transaction as CANCELLED
          await prismaClient.transaction.update({
            where: { id: tx.id },
            data: {
              status: TransactionStatus.CANCELLED,
              metadata: {
                ...meta,
                rejectedBy: adminId,
                rejectedAt: new Date().toISOString(),
                rejectionReason: reason,
              },
            },
          });

          // Create REFUND transaction
          await prismaClient.transaction.create({
            data: {
              walletId: tx.walletId,
              userId: tx.userId,
              type: TransactionType.REFUND,
              status: TransactionStatus.COMPLETED,
              amount: tx.amount,
              description: `Refund: Withdrawal of ₹${Number(tx.amount)} rejected (${reason})`,
              metadata: { originalTransactionId: tx.id, rejectionReason: reason },
            },
          });
        });

        notificationService.sendToUser(tx.userId, {
          type: 'PAYOUT_APPROVED',
          title: '❌ Withdrawal Request Rejected',
          message: `Your withdrawal request of ₹${Number(tx.amount)} was rejected (${reason}). The amount has been refunded back to your wallet.`,
          link: '/wallet',
        }).catch((err) => console.error('[Notification] Failed to notify withdrawal rejection:', err));

        res.json({
          success: true,
          message: `Withdrawal rejected and ₹${Number(tx.amount)} refunded to user's wallet.`,
        });
        return;
      }
    }

    // 2. Check if it's a RedeemRequest
    const redeem = await prisma.redeemRequest.findUnique({ where: { id } });
    if (redeem) {
      if (redeem.status !== RedeemStatus.PENDING) {
        res.status(400).json({ success: false, message: 'Already reviewed' });
        return;
      }

      if (status === 'REJECTED') {
        const reason = rejectionReason?.trim() || 'Request denied by admin';
        await prisma.redeemRequest.update({
          where: { id },
          data: { status: RedeemStatus.REJECTED, rejectionReason: reason, reviewedBy: adminId, reviewedAt: new Date() },
        });

        const wallet = await prisma.wallet.findUnique({ where: { userId: redeem.userId } });
        if (wallet) {
          await prisma.$transaction([
            prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: redeem.amount } } }),
            prisma.transaction.create({
              data: {
                walletId: wallet.id,
                userId: redeem.userId,
                type: TransactionType.REFUND,
                status: TransactionStatus.COMPLETED,
                amount: redeem.amount,
                description: 'Redeem request rejected — funds returned',
                metadata: { redeemRequestId: id, rejectionReason: reason },
              },
            }),
          ]);
        }
        res.json({ success: true, message: 'Redeem request rejected and refunded' });
        return;
      }

      if (status === 'COMPLETED' || status === 'APPROVED') {
        await prisma.redeemRequest.update({
          where: { id },
          data: {
            status: status === 'APPROVED' ? RedeemStatus.APPROVED : RedeemStatus.COMPLETED,
            giftCode: giftCode?.trim() || null,
            reviewedBy: adminId,
            reviewedAt: new Date(),
          },
        });
        res.json({ success: true, message: `Redeem request marked as ${status.toLowerCase()}` });
        return;
      }
    }

    res.status(404).json({ success: false, message: 'Withdrawal request not found' });
  } catch (error) {
    console.error('[Admin] reviewWithdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to review withdrawal request' });
  }
}
