import { TournamentStatus } from '@prisma/client';
import { prisma } from '../config/db';
import { cacheDelPattern } from '../config/redis';

/** Grace window after startTime during which an ACTIVE tournament is still 'Playing' (1 hour) */
export const TOURNAMENT_PLAY_GRACE_MS = 60 * 60 * 1000;

export interface StatusTimeInfo {
  status: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
}

/**
 * True when the tournament should be treated as finished everywhere
 * (lists, filters, cards) — either explicitly ended (COMPLETED, CANCELLED, PAID)
 * or 1 hour past its startTime (regardless of whether status in DB is REGISTRATION or ACTIVE),
 * or past its explicit endTime.
 */
export function isEffectivelyEnded(t: StatusTimeInfo, now: Date = new Date()): boolean {
  if (
    t.status === TournamentStatus.COMPLETED ||
    t.status === TournamentStatus.CANCELLED ||
    t.status === TournamentStatus.PAID
  ) {
    return true;
  }
  const nowMs = now.getTime();
  if (t.endTime && new Date(t.endTime).getTime() <= nowMs) {
    return true;
  }
  if (t.startTime) {
    return new Date(t.startTime).getTime() <= nowMs - TOURNAMENT_PLAY_GRACE_MS;
  }
  return false;
}

let lastSyncAt = 0;
const SYNC_THROTTLE_MS = 10_000; // 10 seconds throttle for endpoint calls

/**
 * Robustly syncs time-based tournament lifecycle transitions to the database:
 * 1. Expired tournaments: Any tournament in REGISTRATION or ACTIVE where:
 *    - startTime passed more than 1 hour ago (startTime <= now - 1h), OR
 *    - endTime has passed (endTime <= now)
 *    -> Transition to COMPLETED with endTime stamped.
 * 2. Started tournaments: Any tournament in REGISTRATION where:
 *    - startTime has arrived (startTime <= now and > now - 1h)
 *    -> Transition to ACTIVE (match is live, registration closed).
 * 3. Invalidates Redis cache if any records changed.
 */
export async function syncTournamentStatuses(force = false): Promise<{ completedCount: number; activatedCount: number }> {
  const nowMs = Date.now();
  if (!force && nowMs - lastSyncAt < SYNC_THROTTLE_MS) {
    return { completedCount: 0, activatedCount: 0 };
  }
  lastSyncAt = nowMs;

  const now = new Date(nowMs);
  const cutoff = new Date(nowMs - TOURNAMENT_PLAY_GRACE_MS);

  try {
    // 1. Complete tournaments whose play window has expired (1h past start) or whose endTime passed
    const completeResult = await prisma.tournament.updateMany({
      where: {
        status: { in: [TournamentStatus.REGISTRATION, TournamentStatus.ACTIVE] },
        OR: [
          { startTime: { lte: cutoff } },
          { endTime: { not: null, lte: now } },
        ],
      },
      data: {
        status: TournamentStatus.COMPLETED,
        endTime: now,
      },
    });

    // 2. Activate tournaments whose startTime has arrived but haven't expired (within the 1h window)
    const activateResult = await prisma.tournament.updateMany({
      where: {
        status: TournamentStatus.REGISTRATION,
        startTime: { lte: now, gt: cutoff },
      },
      data: {
        status: TournamentStatus.ACTIVE,
      },
    });

    const totalUpdated = completeResult.count + activateResult.count;
    if (totalUpdated > 0) {
      console.log(
        `[TournamentLifecycle] Auto-synced: ${completeResult.count} tournament(s) ended/completed, ${activateResult.count} tournament(s) started/activated.`
      );
      // Invalidate all tournament list caches in Redis so API endpoints serve fresh data immediately
      try {
        await cacheDelPattern('tournaments:list*');
        await cacheDelPattern('tournament:*');
      } catch (cacheErr) {
        console.warn('[TournamentLifecycle] Failed to invalidate cache:', cacheErr);
      }
    }

    return { completedCount: completeResult.count, activatedCount: activateResult.count };
  } catch (err) {
    console.error('[TournamentLifecycle] Failed to sync tournament statuses:', err);
    return { completedCount: 0, activatedCount: 0 };
  }
}
