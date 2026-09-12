/**
 * freefireApi.ts
 * ─────────────────────────────────────────────────────────────────
 * Isolated Free Fire player-info API service.
 *
 * ALL communication with the external Free Fire API lives here.
 * To add a backup/fallback provider in the future:
 *   1. Add a second async function (e.g. fetchFromProvider2) below.
 *   2. In fetchPlayerInfo, call providers in sequence:
 *        try { return await fetchFromProvider1(...) }
 *        catch { return await fetchFromProvider2(...) }
 * No other file needs to change.
 * ─────────────────────────────────────────────────────────────────
 */

const FREEFIRE_API_BASE = 'http://siambhau69.eu.cc/freefireinfo/bhau';
const REQUEST_TIMEOUT_MS = 5000;

// Soft warning threshold (80 % of 500 daily limit)
const DAILY_LIMIT_WARNING_AT = 400;
let callCountToday = 0;
let callCountResetAt = Date.now();

function tickCallCounter(): void {
  const now = Date.now();
  // Reset counter every 24 h (rough approximation — server restarts also reset it)
  if (now - callCountResetAt >= 24 * 60 * 60 * 1000) {
    callCountToday = 0;
    callCountResetAt = now;
  }
  callCountToday += 1;
  if (callCountToday >= DAILY_LIMIT_WARNING_AT) {
    console.warn(
      `[FreeFire API] WARNING: approaching daily limit — ${callCountToday} calls made today (limit: 500)`
    );
  }
}

export interface PlayerInfo {
  nickname: string;
  level: number;
  region: string;
}

export type FreefireApiErrorCode =
  | 'UID_NOT_FOUND'
  | 'API_TIMEOUT'
  | 'RATE_LIMITED'
  | 'API_ERROR';

export class FreefireApiError extends Error {
  constructor(
    public readonly code: FreefireApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'FreefireApiError';
  }
}

/**
 * fetchPlayerInfo — primary provider
 *
 * Calls the siambhau69.eu.cc endpoint with a 5-second timeout.
 * Extracts ONLY nickname, level, and region from the response.
 * The rest of the large payload is discarded immediately.
 *
 * @throws FreefireApiError with code UID_NOT_FOUND | API_TIMEOUT | RATE_LIMITED | API_ERROR
 */
async function fetchFromProvider1(uid: string, region: string): Promise<PlayerInfo> {
  const apiKey = process.env.FREEFIRE_API_KEY;
  if (!apiKey) {
    throw new FreefireApiError('API_ERROR', 'Free Fire API key is not configured on the server');
  }

  const url = `${FREEFIRE_API_BASE}?uid=${encodeURIComponent(uid)}&region=${encodeURIComponent(region)}&key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    tickCallCounter();
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FreefireApiError('API_TIMEOUT', 'Free Fire API timed out — please try again');
    }
    throw new FreefireApiError('API_ERROR', 'Could not reach the Free Fire API');
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw new FreefireApiError('RATE_LIMITED', 'Free Fire API rate limit reached — try again later');
  }

  if (!response.ok) {
    // 404 or similar often means invalid UID
    if (response.status === 404 || response.status === 400) {
      throw new FreefireApiError('UID_NOT_FOUND', 'Player not found — please check your UID and region');
    }
    throw new FreefireApiError('API_ERROR', `Free Fire API returned ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new FreefireApiError('API_ERROR', 'Free Fire API returned an unexpected response');
  }

  // Extract ONLY the three fields we need; discard the rest of the payload
  const data = (json as any)?.data?.basicInfo;
  if (!data) {
    throw new FreefireApiError('UID_NOT_FOUND', 'Player not found — please check your UID and region');
  }

  const nickname: string = data.nickname ?? '';
  const level: number = typeof data.level === 'number' ? data.level : parseInt(data.level ?? '0', 10);
  const returnedRegion: string = data.region ?? region;

  if (!nickname && !returnedRegion) {
    throw new FreefireApiError('UID_NOT_FOUND', 'Could not find this UID — please check and try again');
  }

  return { nickname, level, region: returnedRegion };
}

/**
 * fetchPlayerInfo
 *
 * Public entry point. Calls providers in sequence.
 * Currently only one provider — see comment block at top of file
 * for how to add a fallback.
 */
export async function fetchPlayerInfo(uid: string, region: string): Promise<PlayerInfo> {
  return fetchFromProvider1(uid, region);
}