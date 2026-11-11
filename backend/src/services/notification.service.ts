import { prisma } from '../config/db';
import { TournamentStatus } from '@prisma/client';
import { fcmService } from './fcm.service';

export type NotificationType = 'MATCH_SCHEDULE' | 'DEADLINE' | 'DISQUALIFICATION' | 'TOURNAMENT_STARTING' | 'TOURNAMENT_DELAYED' | 'PAYOUT_APPROVED' | 'DEPOSIT_APPROVED' | 'DEPOSIT_REJECTED' | 'MATCH_UPDATE' | 'NEW_TOURNAMENT';

interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

class NotificationService {
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{ successCount: number; failureCount: number }> {
    return fcmService.sendToUsers(userIds, title, body, data);
  }

  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    await prisma.notification.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
      },
    });
  }

  async sendToTournamentParticipants(tournamentId: string, payload: NotificationPayload): Promise<void> {
    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId, userId: { not: null } },
      select: { userId: true },
    });

    const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];

    for (const userId of userIds) {
      await this.sendToUser(userId, payload);
    }
  }

  async notifyNewTournament(
    tournamentId: string,
    title: string,
    entryFee: number,
    details?: { mode?: string; prizePool?: number | string; name?: string }
  ): Promise<void> {
    let mode = details?.mode;
    let prizePool = details?.prizePool;
    const tourName = details?.name || title;

    if (mode === undefined || prizePool === undefined) {
      try {
        const tour = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { gameMode: true, prizePool: true, title: true },
        });
        if (tour) {
          mode = mode ?? (tour.gameMode || 'Free Fire');
          prizePool = prizePool ?? tour.prizePool?.toString();
        }
      } catch {}
    }
    mode = mode || 'Free Fire';
    prizePool = prizePool ?? '0';

    // 1. In-app notifications
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true, notifyTournaments: true },
        select: { id: true },
      });

      const feeText = entryFee > 0 ? `Entry: ₹${entryFee}` : 'Free Entry';
      const payload: NotificationPayload = {
        type: 'NEW_TOURNAMENT',
        title: '🏆 New Tournament Available',
        message: `"${title}" is now open for registration! ${feeText}. Join now!`,
        link: `/tournaments/${tournamentId}`,
      };

      const batchSize = 50;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.all(batch.map((u) => this.sendToUser(u.id, payload).catch(() => {})));
      }
    } catch (err) {
      console.error('[Notification] Failed to create in-app notifications for new tournament:', err);
    }

    // 2. Broadcast to ALL registered tokens
    try {
      await fcmService.sendToAll({
        title: `🏆 New Tournament: ${tourName}`,
        body: `Mode: ${mode} | Entry: ₹${entryFee} | Prize: ₹${prizePool}`,
        path: `/tournaments/${tournamentId}`,
        data: {
          tournamentId,
          route: `/tournaments/${tournamentId}`,
        },
      });
    } catch (err) {
      console.error('[Notification] Failed to broadcast push notification for new tournament:', err);
    }
  }

  async notifyUpcomingTournaments(): Promise<void> {
    const now = new Date();
    // 16-minute window captures tournaments starting in 15 minutes or less
    const in16Min = new Date(Date.now() + 16 * 60 * 1000);

    const tournaments = await prisma.tournament.findMany({
      where: {
        startReminderSent: false,
        status: { in: [TournamentStatus.REGISTRATION, TournamentStatus.ACTIVE] },
        startTime: { gte: now, lte: in16Min },
      },
      select: { id: true, title: true, startTime: true },
    });

    for (const t of tournaments) {
      // Atomic deduplication: ensure reminder is sent exactly once per tournament
      const updateResult = await prisma.tournament.updateMany({
        where: { id: t.id, startReminderSent: false },
        data: { startReminderSent: true },
      });

      if (updateResult.count === 0) continue;

      const entries = await prisma.tournamentEntry.findMany({
        where: { tournamentId: t.id, userId: { not: null } },
        select: { userId: true },
      });
      const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];

      for (const userId of userIds) {
        await this.sendToUser(userId, {
          type: 'TOURNAMENT_STARTING',
          title: '⚔️ Match Starting Soon!',
          message: `${t.title} is starting shortly. Room ID & Password are now ready in your dashboard!`,
          link: `/tournaments/${t.id}`,
        }).catch((err) => console.error('[Notification] In-app notify error for user %s:', userId, err));
      }

      await fcmService.sendToUsers(
        userIds,
        '⚔️ Match Starting Soon!',
        `${t.title} is starting shortly. Room ID & Password are now ready in your dashboard!`,
        {
          tournamentId: t.id,
          route: `/tournaments/${t.id}`,
        }
      ).catch((err) => console.error('[FCM] Push notify error for upcoming tournament %s:', t.id, err));
    }
  }

  /**
   * Hook into room code release: dispatches match starting / room code alert to registered players
   */
  async notifyRoomCodeReady(tournamentId: string, tournamentTitle?: string): Promise<void> {
    try {
      let title = tournamentTitle;
      if (!title) {
        const tour = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { title: true },
        });
        title = tour?.title || 'Tournament';
      }

      const entries = await prisma.tournamentEntry.findMany({
        where: { tournamentId, userId: { not: null } },
        select: { userId: true },
      });
      const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];

      if (userIds.length === 0) return;

      // In-app notifications
      for (const userId of userIds) {
        this.sendToUser(userId, {
          type: 'TOURNAMENT_STARTING',
          title: '⚔️ Match Starting Soon!',
          message: `${title} is starting shortly. Room ID & Password are now ready in your dashboard!`,
          link: `/tournaments/${tournamentId}`,
        }).catch(() => {});
      }

      // Native push notifications to registered players
      await fcmService.sendToUsers(
        userIds,
        '⚔️ Match Starting Soon!',
        `${title} is starting shortly. Room ID & Password are now ready in your dashboard!`,
        {
          tournamentId,
          route: `/tournaments/${tournamentId}`,
        }
      );
    } catch (err) {
      console.error('[Notification] Failed to notify room code ready for tournament %s:', tournamentId, err);
    }
  }

  /**
   * Dispatches tournament completed notification to participants
   */
  async notifyTournamentCompleted(tournamentId: string, tournamentTitle?: string): Promise<void> {
    try {
      let title = tournamentTitle;
      if (!title) {
        const tour = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { title: true },
        });
        title = tour?.title || 'Tournament';
      }

      const entries = await prisma.tournamentEntry.findMany({
        where: { tournamentId, userId: { not: null } },
        select: { userId: true },
      });
      const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];

      if (userIds.length === 0) return;

      // In-app notifications
      for (const userId of userIds) {
        this.sendToUser(userId, {
          type: 'MATCH_UPDATE',
          title: '🏁 Match Completed',
          message: `${title} has ended. Match results and kill counts are being finalized.`,
          link: `/tournaments/${tournamentId}`,
        }).catch(() => {});
      }

      // Native push notifications to registered players
      await fcmService.sendToUsers(
        userIds,
        '🏁 Match Completed',
        `${title} has ended. Match results and kill counts are being finalized.`,
        {
          tournamentId,
          route: `/tournaments/${tournamentId}`,
        }
      );
    } catch (err) {
      console.error('[Notification] Failed to notify tournament completed for %s:', tournamentId, err);
    }
  }

  async notifyResultApproved(tournamentId: string, tournamentTitle: string): Promise<void> {
    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId, userId: { not: null } },
      select: { userId: true },
    });
    const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];

    for (const userId of userIds) {
      await this.sendToUser(userId, {
        type: 'MATCH_UPDATE',
        title: 'Results Published',
        message: `Results for tournament "${tournamentTitle}" are out! Check the winners and standings.`,
        link: `/tournaments/${tournamentId}`,
      }).catch((err) => console.error('[Notification] Result notify error for user %s:', userId, err));

      await fcmService.sendToUser(
        userId,
        {
          title: 'Tournament Results Are Out!',
          body: `Results for "${tournamentTitle}" have been verified. Check the winners and standings!`,
          path: `/tournaments/${tournamentId}`,
        },
        'notifyResults'
      ).catch((err) => console.error('[FCM] Result push notify error for user %s:', userId, err));
    }
  }

  async notifyTournamentDelayed(tournamentId: string, newStartTime: Date): Promise<void> {
    await this.sendToTournamentParticipants(tournamentId, {
      type: 'TOURNAMENT_DELAYED',
      title: 'Tournament Delayed',
      message: `The tournament start has been delayed to ${newStartTime.toISOString()}.`,
      link: `/tournaments/${tournamentId}`,
    });
  }

  async notifyMatchScheduleUpdate(tournamentId: string, matchDate: Date): Promise<void> {
    await this.sendToTournamentParticipants(tournamentId, {
      type: 'MATCH_UPDATE',
      title: 'Match Schedule Updated',
      message: `Your match has been scheduled for ${matchDate.toISOString()}. Check details now.`,
      link: `/tournaments/${tournamentId}`,
    });
  }

  async notifyDeadlineApproaching(tournamentId: string, title: string, deadline: Date): Promise<void> {
    await this.sendToTournamentParticipants(tournamentId, {
      type: 'DEADLINE',
      title: 'Registration Deadline Approaching',
      message: `Registration for "${title}" ends at ${deadline.toISOString()}. Register now!`,
      link: `/tournaments/${tournamentId}`,
    });
  }

  async notifyDisqualification(userId: string, tournamentTitle: string): Promise<void> {
    await this.sendToUser(userId, {
      type: 'DISQUALIFICATION',
      title: 'Disqualified',
      message: `Your team has been disqualified from "${tournamentTitle}".`,
    });
  }

  async notifyWinnerPayout(userId: string, tournamentTitle: string, amount: number, placementLabel?: string): Promise<void> {
    const labelText = placementLabel ? ` (${placementLabel})` : '';
    // 1. In-app notification
    await this.sendToUser(userId, {
      type: 'PAYOUT_APPROVED',
      title: '🏆 Tournament Prize Won!',
      message: `You won ₹${amount}${labelText} from tournament "${tournamentTitle}". Prize added to your wallet!`,
      link: '/wallet',
    }).catch((err) => console.error('[Notification] In-app notify error for winner %s:', userId, err));

    // 2. Native push notification (Winners Only)
    try {
      await fcmService.sendToUser(
        userId,
        {
          title: '🎉 Prize Credited!',
          body: `Congratulations! You won ₹${amount} in ${tournamentTitle}. Check your wallet!`,
          path: '/wallet',
          data: { route: '/wallet' },
        },
        'notifyResults'
      );
    } catch (pushErr) {
      console.error('[FCM] Winner push notify error for user %s:', userId, pushErr);
    }
  }

  async notifyHostCommission(hostId: string, tournamentTitle: string, amount: number): Promise<void> {
    await this.sendToUser(hostId, {
      type: 'PAYOUT_APPROVED',
      title: '💰 Host Commission Received',
      message: `You received ₹${amount} host commission for tournament "${tournamentTitle}". Added to your wallet!`,
      link: '/wallet',
    });
  }

  async notifyDepositApproved(userId: string, amount: number, utrNumber?: string): Promise<void> {
    const utrText = utrNumber ? ` (Ref: ${utrNumber})` : '';
    await this.sendToUser(userId, {
      type: 'DEPOSIT_APPROVED',
      title: '💳 Wallet Deposit Credited',
      message: `₹${amount} has been successfully added to your wallet${utrText}.`,
      link: '/wallet',
    });
  }

  async notifyDepositRejected(userId: string, amount: number, reason: string): Promise<void> {
    await this.sendToUser(userId, {
      type: 'DEPOSIT_REJECTED',
      title: '❌ Deposit Claim Rejected',
      message: `Your deposit claim for ₹${amount} was rejected: ${reason}`,
      link: '/wallet',
    });
  }

  async notifyDepositAutoResolved(userId: string, amount: number, utrNumber?: string): Promise<void> {
    const utrText = utrNumber ? ` (Ref: ${utrNumber})` : '';
    await this.sendToUser(userId, {
      type: 'DEPOSIT_APPROVED',
      title: '⚡ Deposit Automatically Verified',
      message: `Your deposit of ₹${amount} was verified by the automated payment system and credited to your wallet${utrText}. Your claim has been resolved.`,
      link: '/wallet',
    });
  }

  /**
   * Sends push notification for withdrawal status changes (COMPLETED / APPROVED / REJECTED)
   * Guaranteed to execute outside transaction, exactly once per withdrawal (deduplicated via `notified` flag).
   * Catches errors gracefully without failing, delaying, or affecting the withdrawal.
   */
  async notifyWithdrawalStatus(params: {
    withdrawalId: string;
    userId: string;
    status: 'COMPLETED' | 'APPROVED' | 'REJECTED';
    type: 'TRANSACTION' | 'REDEEM_REQUEST';
    linkedRedeemId?: string;
    linkedTransactionId?: string;
    amount?: number;
  }): Promise<void> {
    const { withdrawalId, userId, status, type, linkedRedeemId, linkedTransactionId, amount } = params;

    try {
      // 1. Atomic deduplication: claim notification on the withdrawal record
      let claimed = false;

      if (type === 'TRANSACTION') {
        const updateRes = await prisma.transaction.updateMany({
          where: { id: withdrawalId, notified: false },
          data: { notified: true },
        });
        claimed = updateRes.count > 0;

        if (linkedRedeemId) {
          await prisma.redeemRequest.updateMany({
            where: { id: linkedRedeemId, notified: false },
            data: { notified: true },
          }).catch(() => {});
        }
      } else {
        const updateRes = await prisma.redeemRequest.updateMany({
          where: { id: withdrawalId, notified: false },
          data: { notified: true },
        });
        claimed = updateRes.count > 0;

        if (linkedTransactionId) {
          await prisma.transaction.updateMany({
            where: { id: linkedTransactionId, notified: false },
            data: { notified: true },
          }).catch(() => {});
        }
      }

      // If already claimed/notified, do not send again
      if (!claimed) {
        return;
      }

      // 2. Prepare payload
      const isApprovedOrCompleted = status === 'COMPLETED' || status === 'APPROVED';
      const payload = isApprovedOrCompleted
        ? (amount !== undefined
            ? {
                title: '✅ Withdrawal Successful!',
                body: `₹${amount} has been successfully transferred to your UPI/bank account.`,
                path: '/wallet',
                data: { route: '/wallet' },
              }
            : {
                title: 'Withdrawal successful',
                body: 'Your withdrawal has been processed. Tap to view your wallet.',
                path: '/wallet',
                data: { route: '/wallet' },
              })
        : {
            title: 'Withdrawal not processed',
            body: 'Withdrawal not processed: tap to view details',
            path: '/wallet',
            data: { route: '/wallet' },
          };

      // 3. Dispatch push notification respecting user preferences and skipping users without registered tokens
      await fcmService.sendToUser(userId, payload, 'notifyAlerts');
    } catch (err: any) {
      // Catch error, log only withdrawal id and error type, never fail or delay withdrawal
      const errorType = err?.name || err?.code || 'UnknownError';
      console.error('[Push] Failed to send withdrawal push notification for withdrawalId=%s, errorType=%s', withdrawalId, errorType);
    }
  }
}

export const notificationService = new NotificationService();

