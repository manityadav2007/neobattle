import { TournamentStatus } from '@prisma/client';
import { prisma } from '../config/db';

/** Grace window after startTime during which an ACTIVE tournament is still 'Playing' */
export const TOURNAMENT_PLAY_GRACE_MS = 60 * 60 * 1000;

export interface StatusTimeInfo {
  status: string;
  startTime?: Date | string | null;
}

/**
 * True when the tournament should be treated as finished everywhere
 * (lists, filters, cards) — either explicitly ended or ACTIVE but
 * more than 1 hour past its startTime.
 */
export function isEffectivelyEnded(t: StatusTimeInfo, now: Date = new Date()): boolean {
  if (
    t.status === TournamentStatus.COMPLETED ||
    t.status === TournamentStatus.CANCELLED ||
    t.status === TournamentStatus.PAID
  ) {
    return true;
  }
  if (t.status === TournamentStatus.ACTIVE && t.startTime) {
    return new Date(t.startTime).getTime() <= now.getTime() - TOURNAMENT_PLAY_GRACE_MS;
  }
  return false;
}

let lastSyncAt = 0;
const SYNC_THROTTLE_MS = 60_000;

/**
 * Lazily persist time-based status transitions to the database:
 * ACTIVE tournaments whose startTime passed more than 1 hour ago are
 * flipped to COMPLETED (endTime stamped). Throttled to at most once
 * per minute so read endpoints can call it safely on every request.
 */
export async function syncTournamentStatuses(force = false): Promise<void> {
  const nowMs = Date.now();
  if (!force && nowMs - lastSyncAt < SYNC_THROTTLE_MS) return;
  lastSyncAt = nowMs;

  try {
    const cutoff = new Date(nowMs - TOURNAMENT_PLAY_GRACE_MS);
    const result = await prisma.tournament.updateMany({
      where: {
        status: TournamentStatus.ACTIVE,
        startTime: { lte: cutoff },
      },
      data: {
        status: TournamentStatus.COMPLETED,
        endTime: new Date(nowMs),
      },
    });
    if (result.count > 0) {
      console.log(`[StatusSync] Auto-ended ${result.count} tournament(s) past the 1h play window`);
    }
  } catch (err) {
    console.error('[StatusSync] Failed to sync tournament statuses:', err);
  }
}
