import cron from 'node-cron';
import { prisma } from '../config/db';

export function startTournamentCompleter(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();

      const expired = await prisma.tournament.findMany({
        where: {
          status: { in: ['REGISTRATION', 'ACTIVE'] },
          endTime: { lte: now },
        },
        select: { id: true, title: true, status: true },
      });

      if (expired.length === 0) return;

      const ids = expired.map((t) => t.id);
      await prisma.tournament.updateMany({
        where: { id: { in: ids } },
        data: { status: 'COMPLETED' },
      });

      console.log(`[Cron] Auto-completed ${expired.length} tournaments past endTime: ${expired.map((t) => t.title).join(', ')}`);
    } catch (err) {
      console.error('[Cron] Tournament completer error:', err);
    }
  });

  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();

      const staleActive = await prisma.tournament.findMany({
        where: {
          status: 'ACTIVE',
          startTime: { lte: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
        },
        select: { id: true, title: true },
      });

      if (staleActive.length === 0) return;

      const ids = staleActive.map((t) => t.id);
      await prisma.tournament.updateMany({
        where: { id: { in: ids } },
        data: { status: 'COMPLETED', endTime: now },
      });

      console.log(`[Cron] Auto-completed ${staleActive.length} stale ACTIVE tournaments (4h+ past startTime): ${staleActive.map((t) => t.title).join(', ')}`);
    } catch (err) {
      console.error('[Cron] Stale tournament completer error:', err);
    }
  });

  console.log('[Cron] Tournament completer started (every 15 min for endTime, every 30 min for stale active)');
}
