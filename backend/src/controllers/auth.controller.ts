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
        ? { balance: Number(user.wallet.balance), currency: user.wallet.currency === 'USD' ? 'INR' : (user.wallet.currency || 'INR') }
        : null,
    },
  });
}

export async function checkUsername(req: Request, res: Response): Promise<void> {
  const { username } = req.query;
  if (!username || typeof username !== 'string' || username.length < 3) {
    res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  res.json({ success: true, data: { available: !existing } });
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

export function discordAuth(req: Request, res: Response): void {
  const clientId =
    process.env.DISCORD_CLIENT_ID ||
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ||
    '1344586908581728347';
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  const redirectUri = `${baseUrl}/api/auth/discord/callback`;
  const discordUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&scope=identify%20email&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(discordUrl);
}

export async function discordCallback(req: Request, res: Response): Promise<void> {
  const { code, error } = req.query;
  const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';

  if (error || !code || typeof code !== 'string') {
    res.redirect(`${frontendUrl}/login?error=discord_auth_failed`);
    return;
  }

  const clientId =
    process.env.DISCORD_CLIENT_ID ||
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ||
    '1344586908581728347';
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  const redirectUri = `${baseUrl}/api/auth/discord/callback`;

  try {
    if (!clientSecret) {
      res.redirect(`${frontendUrl}/login?error=discord_client_secret_missing`);
      return;
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      res.redirect(`${frontendUrl}/login?error=discord_token_failed`);
      return;
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      res.redirect(`${frontendUrl}/login?error=discord_token_failed`);
      return;
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      res.redirect(`${frontendUrl}/login?error=discord_user_failed`);
      return;
    }

    const discordUser = (await userResponse.json()) as {
      id: string;
      username: string;
      email?: string;
      avatar?: string;
      global_name?: string;
    };

    const email = discordUser.email || `discord_${discordUser.id}@firearena.gg`;
    const displayName = discordUser.global_name || discordUser.username;
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    let user = await prisma.user.findFirst({
      where: { email },
    });

    if (user) {
      if (!user.displayName && displayName) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { displayName, avatarUrl: user.avatarUrl || avatarUrl },
        });
      }
    } else {
      const lastUser = await prisma.user.findFirst({ orderBy: { uid: 'desc' }, select: { uid: true } });
      const lastNum = lastUser?.uid ? parseInt(lastUser.uid.replace('FA-', '')) || 1000 : 1000;
      const uid = `FA-${lastNum + 1}`;
      const username = `dc_${discordUser.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15)}_${discordUser.id.slice(-4)}`;

      user = await prisma.user.create({
        data: {
          uid,
          email,
          username,
          passwordHash: '',
          displayName,
          avatarUrl,
          wallet: { create: {} },
        },
      });
    }

    const updatedRole = await enforceSuperAdmin(user.id, user.email, user.role);
    if (updatedRole !== user.role) {
      user = await prisma.user.findUnique({ where: { id: user.id } });
      if (!user) {
        res.redirect(`${frontendUrl}/login?error=server_error`);
        return;
      }
    }

    const tokens = await generateTokenPair(user);
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
    );
  } catch (err) {
    res.redirect(`${frontendUrl}/login?error=discord_auth_error`);
  }
}
