import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { TournamentStatus } from '@prisma/client';

export async function getPlatformStats(_req: Request, res: Response): Promise<void> {
  const [totalUsers, totalTournaments, activeTournaments, totalTransactions, prizePoolAgg] =
    await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.tournament.count(),
      prisma.tournament.count({ where: { status: TournamentStatus.ACTIVE } }),
      prisma.transaction.count(),
      prisma.tournament.aggregate({ _sum: { prizePool: true } }),
    ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalTournaments,
      activeTournaments,
      totalTransactions,
      totalPrizePool: Number(prizePoolAgg._sum.prizePool || 0),
    },
  });
}
