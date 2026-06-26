import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { sanitizeUser, hashPassword, comparePassword } from '../utils/auth.utils';

export async function getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      freeFireId: true,
      isVerified: true,
      role: true,
      createdAt: true,
      teamMemberships: {
        include: { team: { select: { id: true, name: true, tag: true, logoUrl: true } } },
      },
      tournamentEntries: {
        include: {
          tournament: { select: { id: true, title: true, status: true, startTime: true } },
        },
        orderBy: { registeredAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  res.json({ success: true, data: user });
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { displayName, avatarUrl, freeFireId, username, notifyTournaments, notifyResults, notifyAlerts } = req.body;

    console.log('[User] updateProfile called for user:', req.user!.id, 'with body:', JSON.stringify(req.body));

    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== req.user!.id) {
        console.log('[User] Username already taken:', username);
        res.status(409).json({ success: false, message: 'Username is already taken' });
        return;
      }
    }

    if (freeFireId) {
      const existing = await prisma.user.findUnique({ where: { freeFireId } });
      if (existing && existing.id !== req.user!.id) {
        console.log('[User] FreeFire ID already linked:', freeFireId);
        res.status(409).json({ success: false, message: 'Free Fire ID already linked' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(freeFireId !== undefined && { freeFireId }),
        ...(username !== undefined && { username }),
        ...(notifyTournaments !== undefined && { notifyTournaments }),
        ...(notifyResults !== undefined && { notifyResults }),
        ...(notifyAlerts !== undefined && { notifyAlerts }),
      },
    });

    console.log('[User] Profile updated successfully for user:', req.user!.id);
    res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    console.error('[User] updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ success: false, message: 'Current password is incorrect' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  res.json({ success: true, message: 'Password updated successfully' });
}

export async function deleteAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { password } = req.body;

  if (!password) {
    res.status(400).json({ success: false, message: 'Password is required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ success: false, message: 'Password is incorrect' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isActive: false },
  });

  res.json({ success: true, message: 'Account deactivated' });
}

export async function getLeaderboard(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const entries = await prisma.tournamentEntry.groupBy({
    by: ['userId'],
    where: { userId: { not: null } },
    _sum: { points: true, kills: true },
    _count: { id: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 50,
  });

  const userIds = entries.map((e) => e.userId!).filter(Boolean);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
  });

  const userIdsForWins = entries.map((e) => e.userId!).filter(Boolean);
  const winCounts = await prisma.tournamentEntry.groupBy({
    by: ['userId'],
    where: { userId: { in: userIdsForWins }, placement: 1 },
    _count: { id: true },
  });
  const winMap = new Map(winCounts.map((w) => [w.userId!, w._count.id]));

  function getLeague(wins: number): string {
    if (wins >= 30) return 'Diamond/Elite';
    if (wins >= 16) return 'Gold';
    if (wins >= 6) return 'Silver';
    return 'Bronze';
  }

  const userMap = new Map(users.map((u) => [u.id, u]));

  const leaderboard = entries.map((entry, index) => ({
    rank: index + 1,
    user: userMap.get(entry.userId!),
    totalPoints: entry._sum.points || 0,
    totalKills: entry._sum.kills || 0,
    tournamentsPlayed: entry._count.id,
    totalWins: winMap.get(entry.userId!) || 0,
    league: getLeague(winMap.get(entry.userId!) || 0),
  }));

  res.json({ success: true, data: leaderboard });
}

export async function getUserStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.params.id || req.user!.id;

  const [entryCount, winCount, prizeTransactions] = await Promise.all([
    prisma.tournamentEntry.count({ where: { userId, placement: { not: null } } }),
    prisma.tournamentEntry.count({ where: { userId, placement: 1 } }),
    prisma.transaction.findMany({
      where: { userId, type: 'PRIZE', status: 'COMPLETED' },
      select: { amount: true },
    }),
  ]);

  const totalPrizeMoney = prizeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const winRate = entryCount > 0 ? Math.round((winCount / entryCount) * 100) : 0;

  let league = 'Bronze';
  if (winCount >= 30) league = 'Diamond/Elite';
  else if (winCount >= 16) league = 'Gold';
  else if (winCount >= 6) league = 'Silver';

  res.json({
    success: true,
    data: {
      totalTournamentsPlayed: entryCount,
      totalWins: winCount,
      totalPrizeMoney,
      winRate,
      league,
    },
  });
}

export async function searchUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const q = (req.query.q as string) || '';
  if (q.length < 2) {
    res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ],
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
    take: 20,
  });

  res.json({ success: true, data: users });
}
