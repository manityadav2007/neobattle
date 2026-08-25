import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface ResolvedWinner {
  placement: number;
  label: string;
  amount: number;
  userId: string;
  username: string;
}

async function resolveWinners(tournament: {
  prizeFirst: Decimal;
  prizeSecond: Decimal | null;
  prizeThird: Decimal | null;
}, firstUid: string, secondUid: string | null, thirdUid: string | null): Promise<ResolvedWinner[]> {
  const candidates = [
    { placement: 1, label: '1st Place', amount: Number(tournament.prizeFirst) || 0, uid: firstUid?.trim() },
    { placement: 2, label: '2nd Place', amount: Number(tournament.prizeSecond) || 0, uid: secondUid?.trim() || null },
    { placement: 3, label: '3rd Place', amount: Number(tournament.prizeThird) || 0, uid: thirdUid?.trim() || null },
  ].filter((c) => c.amount > 0 && c.uid);

  const resolved: ResolvedWinner[] = [];
  for (const c of candidates) {
    const user = await prisma.user.findUnique({
      where: { freeFireId: c.uid! },
      select: { id: true, username: true },
    });
    if (!user) throw new Error(`${c.label}: UID ${c.uid} is not registered on Neobattle`);
    resolved.push({ placement: c.placement, label: c.label, amount: c.amount, userId: user.id, username: user.username });
  }
  return resolved;
}

export async function submitResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tournamentId = req.params.id ?? req.body.tournamentId;
  const { firstUid, secondUid, thirdUid, screenshotUrl } = req.body;
  const hostId = req.user!.id;

  if (!firstUid?.trim() || !screenshotUrl) {
    res.status(400).json({ success: false, message: "1st place UID and proof screenshot are required" });
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { entries: { select: { userId: true } } },
  });

  if (!tournament) {
    res.status(404).json({ success: false, message: 'Tournament not found' });
    return;
  }
  if (tournament.creatorId !== hostId && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Only the tournament host can submit results' });
    return;
  }
  const existing = await prisma.resultSubmission.findUnique({ where: { tournamentId } });
  if (existing && existing.status === 'PENDING') {
    res.status(409).json({ success: false, message: 'Results for this tournament are already pending admin review' });
    return;
  }
  if (tournament.status === TournamentStatus.PAID || (existing && existing.status === 'APPROVED')) {
    res.status(400).json({ success: false, message: 'Prizes were already distributed for this tournament' });
    return;
  }
  if (tournament.status !== TournamentStatus.COMPLETED && tournament.status !== TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Results can be submitted once the tournament has started/ended' });
    return;
  }

  try {
    await resolveWinners(tournament as any, firstUid, secondUid ?? null, thirdUid ?? null);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  const submission = existing
    ? await prisma.resultSubmission.update({
        where: { id: existing.id },
        data: {
          hostId,
          firstUid: firstUid.trim(),
          secondUid: secondUid?.trim() || null,
          thirdUid: thirdUid?.trim() || null,
          screenshotUrl,
          status: 'PENDING',
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      })
    : await prisma.resultSubmission.create({
        data: {
          tournamentId,
          hostId,
          firstUid: firstUid.trim(),
          secondUid: secondUid?.trim() || null,
          thirdUid: thirdUid?.trim() || null,
          screenshotUrl,
          status: 'PENDING',
        },
      });

  res.status(existing ? 200 : 201).json({
    success: true,
    data: submission,
    message: 'Results submitted — awaiting admin approval & payout',
  });
}

export async function listMyResultSubmissions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const subs = await prisma.resultSubmission.findMany({
    where: { hostId: req.user!.id },
    include: { tournament: { select: { id: true, title: true, uid: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: subs });
}

export async function listPendingResults(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const subs = await prisma.resultSubmission.findMany({
    where: { status: 'PENDING' },
    include: {
      host: { select: { id: true, username: true, email: true } },
      tournament: {
        select: {
          id: true, uid: true, title: true, status: true, entryFee: true, prizePool: true,
          prizeFirst: true, prizeSecond: true, prizeThird: true,
          platformCommission: true, hostCommission: true, maxParticipants: true,
          creator: { select: { id: true, username: true } },
          entries: {
            include: { user: { select: { id: true, username: true, ign: true, freeFireId: true } } },
            orderBy: { registeredAt: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    success: true,
    data: subs.map((s) => ({
      ...s,
      participants: s.tournament.entries.map((e) => ({
        uid: e.user?.freeFireId,
        username: e.user?.username,
        ign: e.user?.ign,
      })),
    })),
  });
}

export async function reviewResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { action, rejectionReason } = req.body;
  const submissionId = req.params.id;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    res.status(400).json({ success: false, message: 'action must be APPROVE or REJECT' });
    return;
  }

  const submission = await prisma.resultSubmission.findUnique({
    where: { id: submissionId },
    include: { tournament: true },
  });

  if (!submission) {
    res.status(404).json({ success: false, message: 'Result submission not found' });
    return;
  }
  if (submission.status !== 'PENDING') {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  if (action === 'REJECT') {
    if (!rejectionReason?.trim()) {
      res.status(400).json({ success: false, message: 'Rejection reason is required' });
      return;
    }
    await prisma.resultSubmission.update({
      where: { id: submissionId },
      data: { status: 'REJECTED', rejectionReason: rejectionReason.trim(), reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    res.json({ success: true, message: 'Result rejected — host can edit and resubmit' });
    return;
  }

  // APPROVE → resolve winners and atomically distribute payouts
  const t = submission.tournament;
  if (t.status === TournamentStatus.PAID) {
    res.status(400).json({ success: false, message: 'Prizes already distributed for this tournament' });
    return;
  }
  if (t.status !== TournamentStatus.COMPLETED) {
    res.status(400).json({ success: false, message: 'Mark the tournament completed before approving payouts' });
    return;
  }

  let winners: ResolvedWinner[];
  try {
    winners = await resolveWinners(t as any, submission.firstUid, submission.secondUid, submission.thirdUid);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  // Verify each winner is an actual participant
  const participantUserIds = new Set(
    (await prisma.tournamentEntry.findMany({ where: { tournamentId: t.id, userId: { not: null } }, select: { userId: true } }))
      .map((e) => e.userId!)
  );
  const outsiders = winners.filter((w) => !participantUserIds.has(w.userId));
  if (outsiders.length > 0) {
    res.status(400).json({ success: false, message: `Not a registered participant of this tournament: ${outsiders.map((o) => `${o.username} (${o.label})`).join(', ')}` });
    return;
  }

  const hostAmount = Number(t.hostCommission) || 0;
  const platformAmount = Number(t.platformCommission) || 0;
  const totalPrize = winners.reduce((sum, w) => sum + w.amount, 0);

  const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const adminWallet = adminUser ? await prisma.wallet.findUnique({ where: { userId: adminUser.id } }) : null;
  const hostWallet = await prisma.wallet.findUnique({ where: { userId: t.creatorId } });

  try {
    await prisma.$transaction(async (tx) => {
      // Stamp placements on the winning entries for record-keeping
      for (const w of winners) {
        await tx.tournamentEntry.updateMany({
          where: { tournamentId: t.id, userId: w.userId },
          data: { placement: w.placement },
        });
      }

      for (const w of winners) {
        const wallet = await tx.wallet.findUnique({ where: { userId: w.userId } });
        if (!wallet) throw new Error(`Wallet missing for ${w.username}`);
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: w.amount } } });
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId: w.userId,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(w.amount),
            description: `${w.label} prize — ${t.title}`,
            reference: `RESULT-${submission.id.slice(0, 8)}-P${w.placement}`,
          },
        });
      }

      if (hostAmount > 0 && hostWallet) {
        await tx.wallet.update({ where: { id: hostWallet.id }, data: { balance: { increment: hostAmount } } });
        await tx.transaction.create({
          data: {
            walletId: hostWallet.id,
            userId: t.creatorId,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(hostAmount),
            description: `Host commission — ${t.title}`,
            reference: `RESULT-${submission.id.slice(0, 8)}-HOST`,
          },
        });
      }

      if (platformAmount > 0 && adminWallet && adminUser) {
        await tx.wallet.update({ where: { id: adminWallet.id }, data: { balance: { increment: platformAmount } } });
        await tx.transaction.create({
          data: {
            walletId: adminWallet.id,
            userId: adminUser.id,
            type: TransactionType.PRIZE,
            status: TransactionStatus.COMPLETED,
            amount: new Decimal(platformAmount),
            description: `Platform commission — ${t.title}`,
            reference: `RESULT-${submission.id.slice(0, 8)}-PLAT`,
          },
        });
      }

      await tx.tournament.update({ where: { id: t.id }, data: { status: TournamentStatus.PAID } });
      await tx.resultSubmission.update({
        where: { id: submissionId },
        data: { status: 'APPROVED', reviewedBy: req.user!.id, reviewedAt: new Date() },
      });
    });

    const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    res.json({
      success: true,
      message:
        `Approved & distributed: ${fmt(totalPrize)} to ${winners.length} winner(s)` +
        (hostAmount > 0 ? ` + ${fmt(hostAmount)} host commission` : '') +
        (platformAmount > 0 ? ` (+${fmt(platformAmount)} platform revenue)` : ''),
    });
  } catch (err: any) {
    console.error('[Admin] reviewResult approve error:', err);
    res.status(400).json({ success: false, message: err.message || 'Distribution failed — no changes were saved' });
  }
}
