import { prisma } from '../config/db';
import { TournamentStatus } from '@prisma/client';

export type NotificationType = 'MATCH_SCHEDULE' | 'DEADLINE' | 'DISQUALIFICATION' | 'TOURNAMENT_STARTING' | 'TOURNAMENT_DELAYED' | 'PAYOUT_APPROVED' | 'DEPOSIT_APPROVED' | 'MATCH_UPDATE' | 'NEW_TOURNAMENT';

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
    const in30Min = new Date(Date.now() + 30 * 60 * 1000);
    const now = new Date();

    const tournaments = await prisma.tournament.findMany({
      where: {
        status: TournamentStatus.REGISTRATION,
        startTime: { gte: now, lte: in30Min },
      },
      select: { id: true, title: true, startTime: true },
    });

    for (const t of tournaments) {
      await this.sendToTournamentParticipants(t.id, {
        type: 'TOURNAMENT_STARTING',
        title: 'Tournament Starting Soon',
        message: `"${t.title}" starts at ${t.startTime.toISOString()}. Get ready!`,
        link: `/tournaments/${t.id}`,
      });
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
}

export const notificationService = new NotificationService();

