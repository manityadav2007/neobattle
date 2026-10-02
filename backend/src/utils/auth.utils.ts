import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/db';
import { UserRole } from '@prisma/client';

const jwtSecret = process.env.JWT_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

if (process.env.NODE_ENV === 'production') {
  if (!jwtSecret) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production');
  }
  if (!jwtRefreshSecret) {
    throw new Error('FATAL SECURITY ERROR: JWT_REFRESH_SECRET environment variable is missing in production');
  }
}

const JWT_SECRET = jwtSecret || (process.env.NODE_ENV === 'test' ? 'test-jwt-secret' : 'insecure-dev-secret-do-not-use-in-production');
const JWT_REFRESH_SECRET = jwtRefreshSecret || (process.env.NODE_ENV === 'test' ? 'test-refresh-secret' : 'insecure-dev-refresh-secret-do-not-use-in-production');
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as any;
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(duration.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return num * multipliers[unit];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(user: { id: string; email: string; role: UserRole }): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + parseDurationToMs(String(JWT_REFRESH_EXPIRES_IN)));

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });

  return jwt.sign({ sub: userId, token }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

export async function generateTokenPair(user: {
  id: string;
  email: string;
  role: UserRole;
}): Promise<TokenPair> {
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken, expiresIn: JWT_EXPIRES_IN };
}

export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string; token: string };

    const stored = await prisma.refreshToken.findUnique({
      where: { token: decoded.token },
    });

    if (!stored || stored.expiresAt < new Date()) {
      return null;
    }

    return stored.userId;
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { token: string };
    await prisma.refreshToken.deleteMany({ where: { token: decoded.token } });
  } catch {
    // Token invalid — nothing to revoke
  }
}

export function sanitizeUser(user: {
  id: string;
  uid: string;
  email: string;
  username: string;
  role: UserRole;
  isVerified: boolean;
  gameLevel: number;
  freeFireId: string | null;
  ign: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  verificationScreenshotUrl: string | null;
  createdAt: Date;
  freeFireUid?: string | null;
  freeFireRegion?: string | null;
  inGameNickname?: string | null;
  inGameLevel?: number | null;
  lastSyncedAt?: Date | null;
  lastRefreshAt?: Date | null;
  refreshCountToday?: number;
}) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    username: user.username,
    role: user.role,
    isVerified: user.isVerified,
    gameLevel: user.gameLevel,
    freeFireId: user.freeFireId,
    ign: user.ign,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    verificationScreenshotUrl: user.verificationScreenshotUrl,
    createdAt: user.createdAt,
    freeFireUid: user.freeFireUid ?? null,
    freeFireRegion: user.freeFireRegion ?? null,
    inGameNickname: user.inGameNickname ?? null,
    inGameLevel: user.inGameLevel ?? null,
    lastSyncedAt: user.lastSyncedAt ?? null,
    lastRefreshAt: user.lastRefreshAt ?? null,
    refreshCountToday: user.refreshCountToday ?? 0,
  };
}
