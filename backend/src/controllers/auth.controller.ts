import { Request, Response } from 'express';
import { prisma } from '../config/db';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyRefreshToken,
  revokeRefreshToken,
  sanitizeUser,
} from '../utils/auth.utils';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

const SUPER_ADMIN_EMAIL = 'ymanit330@gmail.com';

async function enforceSuperAdmin(userId: string, email: string, currentRole: string): Promise<string> {
  if (email === SUPER_ADMIN_EMAIL && currentRole !== 'SUPER_ADMIN') {
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'SUPER_ADMIN' },
    });
    return 'SUPER_ADMIN';
  }
  return currentRole;
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, username, password, displayName } = req.body;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existing) {
    res.status(409).json({
      success: false,
      message: existing.email === email ? 'Email already registered' : 'Username taken',
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  const role = email === SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : undefined;

  const lastUser = await prisma.user.findFirst({ orderBy: { uid: 'desc' } });
  const lastNum = lastUser?.uid ? parseInt(lastUser.uid.replace('FA-', '')) || 1000 : 1000;
  const uid = `FA-${lastNum + 1}`;

  const user = await prisma.user.create({
    data: {
      uid,
      email,
      username,
      passwordHash,
      displayName: displayName || username,
      role: role as any,
      wallet: { create: {} },
    },
  });

  const tokens = await generateTokenPair(user);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: { user: sanitizeUser(user), ...tokens },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
    return;
  }

  const updatedRole = await enforceSuperAdmin(user.id, user.email, user.role);
  if (updatedRole !== user.role) {
    user = await prisma.user.findUnique({ where: { id: user.id } });
    if (!user) { res.status(500).json({ success: false, message: 'Server error' }); return; }
  }

  const tokens = await generateTokenPair(user);

  res.json({
    success: true,
    message: 'Login successful',
    data: { user: sanitizeUser(user), ...tokens },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;

  const userId = await verifyRefreshToken(refreshToken);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    res.status(401).json({ success: false, message: 'User not found' });
    return;
  }

  await revokeRefreshToken(refreshToken);
  const tokens = await generateTokenPair(user);

  res.json({ success: true, data: tokens });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  res.json({ success: true, message: 'Logged out successfully' });
}

export async function me(req: AuthenticatedRequest, res: Response): Promise<void> {
  let user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { wallet: true },
  });

  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const updatedRole = await enforceSuperAdmin(user.id, user.email, user.role);
  if (updatedRole !== user.role) {
    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallet: true },
    });
    if (!user) { res.status(500).json({ success: false, message: 'Server error' }); return; }
  }

  res.json({
    success: true,
    data: {
      ...sanitizeUser(user),
      ign: user.ign,
      wallet: user.wallet
        ? { balance: Number(user.wallet.balance), currency: user.wallet.currency }
        : null,
    },
  });
}

export async function updateIgn(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { ign } = req.body;
  if (!ign || typeof ign !== 'string') {
    res.status(400).json({ success: false, message: 'IGN is required' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { ign, ignUpdatedAt: new Date() },
  });

  res.json({ success: true, data: { ign: user.ign } });
}

export async function googleCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  let user = req.user as any;
  if (!user) {
    res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:3000'}/login?error=auth_failed`);
    return;
  }

  const updatedRole = await enforceSuperAdmin(user.id, user.email, user.role);
  if (updatedRole !== user.role) {
    user = await prisma.user.findUnique({ where: { id: user.id } });
    if (!user) {
      res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:3000'}/login?error=server_error`);
      return;
    }
  }

  const tokens = await generateTokenPair(user);
  const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
  res.redirect(
    `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
  );
}
