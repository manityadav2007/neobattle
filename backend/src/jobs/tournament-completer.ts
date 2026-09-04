import cron from 'node-cron';
import { syncTournamentStatuses } from '../utils/tournamentStatus';

let isRunning = false;

/**
 * Runs a single cycle of the tournament lifecycle background worker.
 * Checks for expired tournaments (1h past startTime or past endTime)
 * and updates them to COMPLETED.
 * Checks for newly started tournaments and updates them to ACTIVE.
 */
export async function runTournamentLifecycleWorker(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await syncTournamentStatuses(true);
  } catch (err) {
    console.error('[TournamentWorker] Background worker error:', err);
  } finally {
    isRunning = false;
  }
}

export function startTournamentCompleter(): void {
  // 1. Run immediately on server boot so expired tournaments are updated right away
  runTournamentLifecycleWorker().catch((err) => {
    console.error('[TournamentWorker] Initial boot sync failed:', err);
  });

  // 2. Schedule cron to run every minute
  cron.schedule('* * * * *', async () => {
    await runTournamentLifecycleWorker();
  });

  // 3. Robust fallback interval worker (every 60 seconds) ensuring regular background execution
  const intervalId = setInterval(() => {
    runTournamentLifecycleWorker().catch((err) => {
      console.error('[TournamentWorker] Interval sync failed:', err);
    });
  }, 60_000);

  if (intervalId && typeof intervalId.unref === 'function') {
    intervalId.unref();
  }

  console.log('[TournamentWorker] Tournament lifecycle background worker started (running every 60s + immediate startup sync)');
}
