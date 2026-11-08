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

  async notifyNewTournament(tournamentId: string, title: string, entryFee: number): Promise<void> {
    // Notify all active users who have opted in to tournament notifications
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

    // Send in batches to avoid blocking the response
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.all(batch.map((u) => this.sendToUser(u.id, payload)));
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
          title: 'Tournament Starting Soon',
          message: `"${t.title}" starts in 15 minutes. Get ready!`,
          link: `/tournaments/${t.id}`,
        }).catch((err) => console.error(`[Notification] In-app notify error for user ${userId}:`, err));

        await fcmService.sendToUser(
          userId,
          {
            title: 'Tournament Starting in 15 Minutes!',
            body: `"${t.title}" starts soon. Get ready to play!`,
            path: `/tournaments/${t.id}`,
          },
          'notifyTournaments'
        ).catch((err) => console.error(`[FCM] Push notify error for user ${userId}:`, err));
      }
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
      }).catch((err) => console.error(`[Notification] Result notify error for user ${userId}:`, err));

      await fcmService.sendToUser(
        userId,
        {
          title: 'Tournament Results Are Out!',
          body: `Results for "${tournamentTitle}" have been verified. Check the winners and standings!`,
          path: `/tournaments/${tournamentId}`,
        },
        'notifyResults'
      ).catch((err) => console.error(`[FCM] Result push notify error for user ${userId}:`, err));
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
    await this.sendToUser(userId, {
      type: 'PAYOUT_APPROVED',
      title: '🏆 Tournament Prize Won!',
      message: `You won ₹${amount}${labelText} from tournament "${tournamentTitle}". Prize added to your wallet!`,
      link: '/wallet',
    });
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
   * Sends push notification for withdrawal status changes (COMPLETED / REJECTED)
   * Guaranteed to execute outside transaction, exactly once per withdrawal (deduplicated via `notified` flag).
   * Strictly avoids including amount, balance, UPI ID, bank details, transaction IDs or email.
   * Catches errors gracefully without failing, delaying, or affecting the withdrawal.
   */
  async notifyWithdrawalStatus(params: {
    withdrawalId: string;
    userId: string;
    status: 'COMPLETED' | 'REJECTED';
    type: 'TRANSACTION' | 'REDEEM_REQUEST';
    linkedRedeemId?: string;
    linkedTransactionId?: string;
  }): Promise<void> {
    const { withdrawalId, userId, status, type, linkedRedeemId, linkedTransactionId } = params;

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

      // 2. Prepare payload without amount, balance, UPI ID, bank details, transaction IDs or email
      const payload =
        status === 'COMPLETED'
          ? {
              title: 'Withdrawal successful',
              body: 'Your withdrawal has been processed. Tap to view your wallet.',
              path: '/wallet',
            }
          : {
              title: 'Withdrawal not processed',
              body: 'Withdrawal not processed: tap to view details',
              path: '/wallet',
            };

      // 3. Dispatch push notification respecting user preferences and skipping users without registered tokens
      await fcmService.sendToUser(userId, payload, 'notifyAlerts');
    } catch (err: any) {
      // Catch error, log only withdrawal id and error type, never fail or delay withdrawal
      const errorType = err?.name || err?.code || 'UnknownError';
      console.error(`[Push] Failed to send withdrawal push notification for withdrawalId=${withdrawalId}, errorType=${errorType}`);
    }
  }
}

export const notificationService = new NotificationService();

