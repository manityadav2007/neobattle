import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { UserRole, TournamentStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { escrowService } from '../services/escrow.service';

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
