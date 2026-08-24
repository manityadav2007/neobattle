import { TournamentStatus } from '@prisma/client';

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
