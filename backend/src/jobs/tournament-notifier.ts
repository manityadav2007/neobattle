import cron from 'node-cron';
import { notificationService } from '../services/notification.service';

export function startTournamentNotifier(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await notificationService.notifyUpcomingTournaments();
    } catch (err) {
      console.error('[Cron] Tournament notifier error:', err);
    }
  });

  console.log('[Cron] Tournament notifier started (every 5 minutes)');
}
