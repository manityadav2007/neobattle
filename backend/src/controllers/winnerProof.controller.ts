import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentStatus, WinnerProofStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { gameProfileService } from '../services/gameProfile.service';

export async function submitWinnerProof(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { tournamentId, winnerUid, screenshotUrl } = req.body;
  const userId = req.user!.id;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }

  if (tournament.creatorId !== userId && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Only the tournament host can submit winner proof' });
    return;
  }

  if (tournament.status !== TournamentStatus.ACTIVE && tournament.status !== TournamentStatus.COMPLETED) {
    res.status(400).json({ success: false, message: 'Tournament must be active or completed' });
    return;
  }

  const entry = await prisma.tournamentEntry.findFirst({
    where: { tournamentId, userId: { not: null } },
    include: { user: { select: { id: true, freeFireId: true, ign: true, username: true } } },
  });

  if (!entry) {
    res.status(404).json({ success: false, message: 'No registered player found for this tournament' });
    return;
  }

  const profile = await gameProfileService.fetchByUid(winnerUid);
  const winnerIgn = profile?.ign || `Player_${winnerUid.slice(-4)}`;

  const existing = await prisma.winnerProof.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: entry.userId! } },
  });

  if (existing) {
    res.status(409).json({ success: false, message: 'Winner proof already submitted for this entry' });
    return;
  }

  const proof = await prisma.winnerProof.create({
    data: {
      tournamentId,
      userId: entry.userId!,
      winnerUid,
      winnerIgn,
      screenshotUrl,
    },
  });

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: TournamentStatus.PENDING_PAYOUT },
  });

  res.status(201).json({ success: true, data: proof, message: 'Winner proof submitted. Awaiting SUPER_ADMIN approval.' });
}

export async function listPendingPayouts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const proofs = await prisma.winnerProof.findMany({
    where: { status: WinnerProofStatus.PENDING },
    include: {
      tournament: { select: { id: true, title: true, entryFee: true, prizePool: true } },
      user: { select: { id: true, username: true, ign: true, freeFireId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: proofs });
}

export async function reviewWinnerProof(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status, rejectionReason } = req.body;
  const proofId = req.params.id;

  const proof = await prisma.winnerProof.findUnique({
    where: { id: proofId },
    include: { tournament: true, user: { select: { id: true, username: true } } },
  });
  if (!proof) {
    res.status(404).json({ success: false, message: 'Winner proof not found' });
    return;
  }

  if (proof.status !== WinnerProofStatus.PENDING) {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  if (status === WinnerProofStatus.REJECTED && !rejectionReason) {
    res.status(400).json({ success: false, message: 'Rejection reason required' });
    return;
  }

  if (status === WinnerProofStatus.APPROVED && proof.tournament) {
    const t = proof.tournament;
    const prizeAmount = Number(t.prizePool);
    const hostAmount = Number(t.hostCommission);
    const adminAmount = Number(t.platformCommission);

    const winnerWallet = await prisma.wallet.findUnique({ where: { userId: proof.userId } });
    const hostWallet = await prisma.wallet.findUnique({ where: { userId: t.creatorId } });

    if (!winnerWallet) {
      res.status(404).json({ success: false, message: 'Winner wallet not found' });
      return;
    }

    const transactions: any[] = [];

    if (prizeAmount > 0 && winnerWallet) {
      await prisma.wallet.update({
        where: { id: winnerWallet.id },
        data: { balance: { increment: prizeAmount } },
      });
      transactions.push({
        walletId: winnerWallet.id,
        userId: proof.userId,
        type: TransactionType.PRIZE,
        status: TransactionStatus.COMPLETED,
        amount: new Decimal(prizeAmount),
        description: `Prize from ${t.title}`,
        reference: `PRIZE-${proofId.slice(0, 8)}`,
      });
    }

    if (hostAmount > 0 && hostWallet) {
      await prisma.wallet.update({
        where: { id: hostWallet.id },
        data: { balance: { increment: hostAmount } },
      });
      transactions.push({
        walletId: hostWallet.id,
        userId: t.creatorId,
        type: TransactionType.PRIZE,
        status: TransactionStatus.COMPLETED,
        amount: new Decimal(hostAmount),
        description: `Host commission from ${t.title}`,
        reference: `HOST-COMM-${proofId.slice(0, 8)}`,
      });
    }

    const adminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    if (adminAmount > 0 && adminUser) {
      const adminWallet = await prisma.wallet.findUnique({ where: { userId: adminUser.id } });
      if (adminWallet) {
        await prisma.wallet.update({
          where: { id: adminWallet.id },
          data: { balance: { increment: adminAmount } },
        });
        transactions.push({
          walletId: adminWallet.id,
          userId: adminUser.id,
          type: TransactionType.PRIZE,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(adminAmount),
          description: `Platform commission from ${t.title}`,
          reference: `PLAT-COMM-${proofId.slice(0, 8)}`,
        });
      }
    }

    for (const tx of transactions) {
      await prisma.transaction.create({ data: tx });
    }
  }

  const updated = await prisma.winnerProof.update({
    where: { id: proofId },
    data: {
      status: status as WinnerProofStatus,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      rejectionReason: status === WinnerProofStatus.REJECTED ? rejectionReason : null,
    },
  });

  await prisma.tournament.update({
    where: { id: proof.tournamentId },
    data: { status: status === WinnerProofStatus.APPROVED ? TournamentStatus.PAID : TournamentStatus.COMPLETED },
  });

  res.json({
    success: true,
    data: updated,
    message: status === WinnerProofStatus.APPROVED
      ? `Payout approved. Prize ($${Number(proof.tournament.prizePool).toFixed(2)}) → Winner, Host commission ($${Number(proof.tournament.hostCommission).toFixed(2)}) → Host, Platform commission ($${Number(proof.tournament.platformCommission).toFixed(2)}) → Admin.`
      : 'Winner proof rejected.',
  });
}
