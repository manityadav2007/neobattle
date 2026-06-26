import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/db';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '15m') as any;
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

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
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

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
  email: string;
  username: string;
  role: UserRole;
  isVerified: boolean;
  freeFireId: string | null;
  ign: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  verificationScreenshotUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    isVerified: user.isVerified,
    freeFireId: user.freeFireId,
    ign: user.ign,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    verificationScreenshotUrl: user.verificationScreenshotUrl,
    createdAt: user.createdAt,
  };
}
