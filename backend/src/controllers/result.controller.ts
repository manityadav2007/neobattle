import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TournamentStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { notificationService } from '../services/notification.service';

interface ResolvedWinner {
  placement: number;
  label: string;
  amount: number;
  userId: string;
  username: string;
}

async function resolveWinners(tournament: {
  id: string;
  format: string;
  prizeFirst: Decimal;
  prizeSecond: Decimal | null;
  prizeThird: Decimal | null;
}, firstUid: string, secondUid: string | null, thirdUid: string | null): Promise<ResolvedWinner[]> {
  const isTeam = tournament.format === 'DUO' || tournament.format === 'SQUAD';
  const candidates = [
    { placement: 1, label: isTeam ? '1st Winning Team' : '1st Place', amount: Math.max(0, Number(tournament.prizeFirst) || 0), uid: firstUid?.trim() },
    { placement: 2, label: isTeam ? '2nd Winning Team' : '2nd Place', amount: Math.max(0, Number(tournament.prizeSecond) || 0), uid: secondUid?.trim() || null },
    { placement: 3, label: isTeam ? '3rd Winning Team' : '3rd Place', amount: Math.max(0, Number(tournament.prizeThird) || 0), uid: thirdUid?.trim() || null },
  ].filter((c) => Boolean(c.uid));

  const resolved: ResolvedWinner[] = [];

  for (const c of candidates) {
    const entry = await prisma.tournamentEntry.findFirst({
      where: {
        tournamentId: tournament.id,
        OR: [
          { user: { freeFireId: c.uid! } },
          { team: { members: { some: { user: { freeFireId: c.uid! } } } } },
        ],
      },
      include: {
        user: { select: { id: true, username: true, freeFireId: true } },
        team: {
          include: {
            members: {
              include: {
                user: { select: { id: true, username: true, freeFireId: true } },
              },
            },
          },
        },
      },
    });

    if (!entry) {
      throw new Error(`${c.label}: Free Fire UID ${c.uid} is not a registered participant in this tournament.`);
    }

    if (entry.team && entry.team.members.length > 0) {
      const members = entry.team.members.map((m) => m.user);
      const splitAmount = Math.floor(c.amount / members.length);
      const remainder = c.amount - (splitAmount * members.length);

      members.forEach((m, idx) => {
        const payout = idx === 0 ? splitAmount + remainder : splitAmount;
        resolved.push({
          placement: c.placement,
          label: `${c.label} (${entry.team!.name})`,
          amount: payout,
          userId: m.id,
          username: m.username,
        });
      });
    } else if (entry.user) {
      resolved.push({
        placement: c.placement,
        label: c.label,
        amount: c.amount,
        userId: entry.user.id,
        username: entry.user.username,
      });
    } else {
      throw new Error(`${c.label}: Registered entry has no associated user or team.`);
    }
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
          id: true, uid: true, title: true, status: true, format: true, gameMode: true, entryFee: true, prizePool: true,
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
  if (t.status !== TournamentStatus.COMPLETED && t.status !== TournamentStatus.ACTIVE) {
    res.status(400).json({ success: false, message: 'Tournament must be active or completed before approving payouts' });
    return;
  }

  let winners: ResolvedWinner[];
  try {
    winners = await resolveWinners(t as any, submission.firstUid, submission.secondUid, submission.thirdUid);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  // Verify each winner is an actual participant (either individual or team member)
  const allEntries = await prisma.tournamentEntry.findMany({
    where: { tournamentId: t.id },
    include: {
      team: { include: { members: { select: { userId: true } } } },
    },
  });
  const participantUserIds = new Set<string>();
  for (const e of allEntries) {
    if (e.userId) participantUserIds.add(e.userId);
    if (e.team) {
      for (const m of e.team.members) {
        participantUserIds.add(m.userId);
      }
    }
  }

  const outsiders = winners.filter((w) => !participantUserIds.has(w.userId));
  if (outsiders.length > 0) {
    res.status(400).json({ success: false, message: `Not a registered participant of this tournament: ${outsiders.map((o) => `${o.username} (${o.label})`).join(', ')}` });
    return;
  }

  const hostAmount = Math.round(Number(t.hostCommission) || 0);
  const totalPrize = winners.reduce((sum, w) => sum + w.amount, 0);
  const totalCollection = Math.round(Number(t.entryFee) * t.maxParticipants);
  const platformAmount = totalCollection > 0
    ? Math.max(0, totalCollection - hostAmount - totalPrize)
    : Math.round(Number(t.platformCommission) || 0);

  const adminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const adminWallet = adminUser ? await prisma.wallet.findUnique({ where: { userId: adminUser.id } }) : null;
  const hostWallet = await prisma.wallet.findUnique({ where: { userId: t.creatorId } });

  // Game Mode Points Mapping: Clash Squad Win: +2 points, Full Map Win: +4 points
  const winPoints = t.gameMode === 'CLASH_SQUAD' ? 2 : 4;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Stamp placements on the team entries for record-keeping
      for (const w of winners) {
        await tx.tournamentEntry.updateMany({
          where: {
            tournamentId: t.id,
            team: { members: { some: { userId: w.userId } } },
          },
          data: { placement: w.placement },
        });
      }

      // 2. Award leaderboard points & ensure individual entries exist for each winning player / team member
      for (const w of winners) {
        const isWinner = w.placement === 1;
        const pointsToAdd = isWinner ? winPoints : 0;

        const existingEntry = await tx.tournamentEntry.findUnique({
          where: {
            tournamentId_userId: {
              tournamentId: t.id,
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
          // For Duo/Squad team members who did not have their own TournamentEntry record
          await tx.tournamentEntry.create({
            data: {
              tournamentId: t.id,
              userId: w.userId,
              placement: w.placement,
              points: pointsToAdd,
              isPaid: true,
            },
          });
        }
      }

      for (const w of winners) {
        if (w.amount > 0) {
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
              reference: `RESULT-${submission.id.slice(0, 8)}-P${w.placement}-${w.userId.slice(-4)}`,
            },
          });
        }
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

    // Notify winners and host
    for (const w of winners) {
      notificationService.notifyWinnerPayout(w.userId, t.title, w.amount, w.label).catch((err) => {
        console.error(`[Notification] Failed to notify winner ${w.userId}:`, err);
      });
    }
    if (hostAmount > 0 && t.creatorId) {
      notificationService.notifyHostCommission(t.creatorId, t.title, hostAmount).catch((err) => {
        console.error(`[Notification] Failed to notify host ${t.creatorId}:`, err);
      });
    }

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
