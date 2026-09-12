import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { fetchPlayerInfo, FreefireApiError } from '../services/freefireApi';

const VALID_REGIONS = ['IND', 'BD', 'SG', 'ID', 'TW', 'TH', 'VN', 'NA', 'EU', 'ME', 'OT'];
const MAX_REFRESHES_PER_DAY = 2;
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

function toUserFriendlyError(err: unknown): string {
  if (err instanceof FreefireApiError) {
    switch (err.code) {
      case 'UID_NOT_FOUND':
        return "Couldn't find this UID, please check and try again";
      case 'API_TIMEOUT':
        return 'Service temporarily unavailable, please try again later';
      case 'RATE_LIMITED':
        return 'Service temporarily unavailable, please try again later';
      case 'API_ERROR':
        return 'Service temporarily unavailable, please try again later';
    }
  }
  return 'Something went wrong, please try again later';
}

/**
 * POST /verification/link
 * Links a Free Fire UID to the user account automatically via the API.
 * Does NOT count against the refresh limit.
 */
export async function linkFreeFireId(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { uid, region } = req.body;
  const userId = req.user!.id;

  if (!uid || typeof uid !== 'string' || !/^\d{5,12}$/.test(uid.trim())) {
    res.status(400).json({ success: false, message: 'Please enter a valid Free Fire UID (numbers only, 5–12 digits)' });
    return;
  }

  const trimmedUid = uid.trim();
  const trimmedRegion = (region || 'IND').toUpperCase();

  if (!VALID_REGIONS.includes(trimmedRegion)) {
    res.status(400).json({ success: false, message: 'Invalid region selected' });
    return;
  }

  // Check if UID is already linked to a different account
  const existingUser = await prisma.user.findFirst({
    where: {
      freeFireUid: trimmedUid,
      NOT: { id: userId },
    },
  });
  if (existingUser) {
    res.status(409).json({ success: false, message: 'This Free Fire ID is already linked to another account' });
    return;
  }

  let playerInfo: { nickname: string; level: number; region: string };
  try {
    playerInfo = await fetchPlayerInfo(trimmedUid, trimmedRegion);
  } catch (err) {
    console.error('[Verification] linkFreeFireId error:', err);
    res.status(502).json({ success: false, message: toUserFriendlyError(err) });
    return;
  }

  const now = new Date();
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      freeFireId: trimmedUid,
      freeFireUid: trimmedUid,
      freeFireRegion: trimmedRegion,
      inGameNickname: playerInfo.nickname,
      inGameLevel: playerInfo.level,
      gameLevel: playerInfo.level,
      isVerified: true,
      lastSyncedAt: now,
    },
    select: {
      freeFireUid: true,
      freeFireRegion: true,
      inGameNickname: true,
      inGameLevel: true,
      isVerified: true,
      lastSyncedAt: true,
      refreshCountToday: true,
    },
  });

  res.json({
    success: true,
    message: `Linked successfully! Welcome, ${playerInfo.nickname}`,
    data: updatedUser,
  });
}

/**
 * POST /verification/refresh
 * Refreshes nickname/level from API. Max 2 refreshes per 24-hour rolling window.
 * On failure, does NOT overwrite existing data.
 */
export async function refreshPlayerInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      freeFireUid: true,
      freeFireRegion: true,
      inGameNickname: true,
      inGameLevel: true,
      lastSyncedAt: true,
      lastRefreshAt: true,
      refreshCountToday: true,
    },
  });

  if (!user || !user.freeFireUid) {
    res.status(400).json({ success: false, message: 'No Free Fire account linked. Please link first.' });
    return;
  }

  const now = new Date();
  const nowMs = now.getTime();

  // Rolling 24h window reset
  let refreshCount = user.refreshCountToday;
  if (user.lastRefreshAt && nowMs - user.lastRefreshAt.getTime() >= ROLLING_WINDOW_MS) {
    refreshCount = 0;
  }

  if (refreshCount >= MAX_REFRESHES_PER_DAY) {
    const nextAvailableMs = user.lastRefreshAt
      ? user.lastRefreshAt.getTime() + ROLLING_WINDOW_MS
      : nowMs + ROLLING_WINDOW_MS;
    const hoursLeft = Math.ceil((nextAvailableMs - nowMs) / (60 * 60 * 1000));
    res.status(429).json({
      success: false,
      message: `Daily limit reached (${MAX_REFRESHES_PER_DAY}/${MAX_REFRESHES_PER_DAY}). Next refresh available in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`,
      hoursUntilReset: hoursLeft,
      refreshCountToday: refreshCount,
    });
    return;
  }

  let playerInfo: { nickname: string; level: number; region: string };
  try {
    playerInfo = await fetchPlayerInfo(user.freeFireUid, user.freeFireRegion || 'IND');
  } catch (err) {
    console.error('[Verification] refreshPlayerInfo error:', err);
    // Return cached data — do NOT overwrite anything
    res.status(502).json({
      success: false,
      message: toUserFriendlyError(err),
      cachedData: {
        inGameNickname: user.inGameNickname,
        inGameLevel: user.inGameLevel,
        lastSyncedAt: user.lastSyncedAt,
      },
    });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      inGameNickname: playerInfo.nickname,
      inGameLevel: playerInfo.level,
      gameLevel: playerInfo.level,
      lastSyncedAt: now,
      lastRefreshAt: now,
      refreshCountToday: refreshCount + 1,
    },
    select: {
      freeFireUid: true,
      freeFireRegion: true,
      inGameNickname: true,
      inGameLevel: true,
      lastSyncedAt: true,
      lastRefreshAt: true,
      refreshCountToday: true,
    },
  });

  const remainingRefreshes = MAX_REFRESHES_PER_DAY - updated.refreshCountToday;
  res.json({
    success: true,
    message: 'Profile refreshed successfully',
    data: { ...updated, remainingRefreshes },
  });
}

/**
 * GET /verification/my
 * Returns current link status for the authenticated user.
 */
export async function getMyLinkStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      freeFireUid: true,
      freeFireRegion: true,
      inGameNickname: true,
      inGameLevel: true,
      isVerified: true,
      lastSyncedAt: true,
      lastRefreshAt: true,
      refreshCountToday: true,
    },
  });

  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const now = Date.now();
  let refreshCount = user.refreshCountToday;
  if (user.lastRefreshAt && now - user.lastRefreshAt.getTime() >= ROLLING_WINDOW_MS) {
    refreshCount = 0;
  }

  const nextRefreshAvailableIn = user.lastRefreshAt && refreshCount >= MAX_REFRESHES_PER_DAY
    ? Math.ceil((user.lastRefreshAt.getTime() + ROLLING_WINDOW_MS - now) / (60 * 60 * 1000))
    : null;

  res.json({
    success: true,
    data: {
      isLinked: !!user.freeFireUid,
      freeFireUid: user.freeFireUid,
      freeFireRegion: user.freeFireRegion,
      inGameNickname: user.inGameNickname,
      inGameLevel: user.inGameLevel,
      isVerified: user.isVerified,
      lastSyncedAt: user.lastSyncedAt,
      refreshCountToday: refreshCount,
      remainingRefreshes: Math.max(0, MAX_REFRESHES_PER_DAY - refreshCount),
      nextRefreshAvailableInHours: nextRefreshAvailableIn,
    },
  });
}

/**
 * GET /verification/linked  (admin only)
 * Read-only list of all users who have linked their Free Fire ID.
 */
export async function listLinkedPlayers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [players, total] = await Promise.all([
    prisma.user.findMany({
      where: { freeFireUid: { not: null } },
      select: {
        id: true,
        username: true,
        email: true,
        freeFireUid: true,
        freeFireRegion: true,
        inGameNickname: true,
        inGameLevel: true,
        isVerified: true,
        lastSyncedAt: true,
      },
      skip,
      take: limit,
      orderBy: { lastSyncedAt: 'desc' },
    }),
    prisma.user.count({ where: { freeFireUid: { not: null } } }),
  ]);

  res.json({
    success: true,
    data: players,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}