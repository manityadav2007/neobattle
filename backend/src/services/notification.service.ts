import { prisma } from '../config/db';
import { TournamentStatus } from '@prisma/client';

export type NotificationType = 'MATCH_SCHEDULE' | 'DEADLINE' | 'DISQUALIFICATION' | 'TOURNAMENT_STARTING' | 'TOURNAMENT_DELAYED' | 'PAYOUT_APPROVED' | 'DEPOSIT_APPROVED' | 'MATCH_UPDATE';

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
        message: `"${t.title}" starts at ${t.startTime.toLocaleTimeString()}. Get ready!`,
        link: `/tournaments/${t.id}`,
      });
    }
  }

  async notifyTournamentDelayed(tournamentId: string, newStartTime: Date): Promise<void> {
    await this.sendToTournamentParticipants(tournamentId, {
      type: 'TOURNAMENT_DELAYED',
      title: 'Tournament Delayed',
      message: `The tournament start has been delayed to ${newStartTime.toLocaleTimeString()}.`,
      link: `/tournaments/${tournamentId}`,
    });
  }

  async notifyMatchScheduleUpdate(tournamentId: string, matchDate: Date): Promise<void> {
    await this.sendToTournamentParticipants(tournamentId, {
      type: 'MATCH_UPDATE',
      title: 'Match Schedule Updated',
      message: `Your match has been scheduled for ${matchDate.toLocaleString()}. Check details now.`,
      link: `/tournaments/${tournamentId}`,
    });
  }

  async notifyDeadlineApproaching(tournamentId: string, title: string, deadline: Date): Promise<void> {
    await this.sendToTournamentParticipants(tournamentId, {
      type: 'DEADLINE',
      title: 'Registration Deadline Approaching',
      message: `Registration for "${title}" ends at ${deadline.toLocaleString()}. Register now!`,
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
}

export const notificationService = new NotificationService();
