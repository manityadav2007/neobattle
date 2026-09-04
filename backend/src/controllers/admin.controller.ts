import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { UserRole, TournamentStatus, TransactionType, TransactionStatus, Prisma } from '@prisma/client';
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

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Winner payouts
      for (const w of winnerPayouts) {
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
