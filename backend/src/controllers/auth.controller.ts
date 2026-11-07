import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import passport from 'passport';
import { prisma } from '../config/db';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyRefreshToken,
  revokeRefreshToken,
  sanitizeUser,
  TokenPair,
} from '../utils/auth.utils';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

const SUPER_ADMIN_EMAIL = process.env.OWNER_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'ymanit330@gmail.com';

export interface OAuthStateData {
  nonce: string;
  platform: 'app' | 'web';
  codeChallenge?: string;
  expiresAt: number;
}

export interface OAuthCodeEntry {
  tokens: TokenPair;
  platform: 'app' | 'web';
  codeChallenge?: string;
  expiresAt: number;
}

const oauthStateMap = new Map<string, OAuthStateData>();
const oauthCodeMap = new Map<string, OAuthCodeEntry>();

// Periodic cleanup of expired states and codes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of oauthCodeMap.entries()) {
    if (now > entry.expiresAt) {
      oauthCodeMap.delete(code);
    }
  }
  for (const [nonce, state] of oauthStateMap.entries()) {
    if (now > state.expiresAt) {
      oauthStateMap.delete(nonce);
    }
  }
}, 30_000);
if (typeof cleanupTimer?.unref === 'function') {
  cleanupTimer.unref();
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function parsePlatform(platformInput: any): 'app' | 'web' {
  if (typeof platformInput === 'string' && platformInput.trim().toLowerCase() === 'app') {
    return 'app';
  }
  return 'web';
}

export function createOAuthState(platformInput: any, codeChallengeInput: any): string {
  let platform = parsePlatform(platformInput);
  let codeChallenge: string | undefined;

  if (platform === 'app') {
    if (
      typeof codeChallengeInput === 'string' &&
      /^[A-Za-z0-9\-_]{43,128}$/.test(codeChallengeInput.trim())
    ) {
      codeChallenge = codeChallengeInput.trim();
    } else {
      // Invalid or missing code_challenge falls back to web
      platform = 'web';
    }
  }

  const nonce = crypto.randomBytes(32).toString('hex');
  oauthStateMap.set(nonce, {
    nonce,
    platform,
    codeChallenge,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return nonce;
}

export function consumeOAuthState(nonce: string): OAuthStateData | null {
  if (!nonce || typeof nonce !== 'string') return null;
  const state = oauthStateMap.get(nonce);
  if (!state) return null;
  oauthStateMap.delete(nonce);
  if (Date.now() > state.expiresAt) {
    return null;
  }
  return state;
}

export function createOAuthCode(
  tokens: TokenPair,
  platform: 'app' | 'web' = 'web',
  codeChallenge?: string
): string {
  const code = uuidv4();
  // Valid for 60 seconds
  oauthCodeMap.set(code, {
    tokens,
    platform,
    codeChallenge,
    expiresAt: Date.now() + 60_000,
  });
  return code;
}

export function __setOAuthStateForTest(nonce: string, data: OAuthStateData): void {
  oauthStateMap.set(nonce, data);
}

export function __setOAuthCodeForTest(code: string, entry: OAuthCodeEntry): void {
  oauthCodeMap.set(code, entry);
}

export function __getOAuthCodeForTest(code: string): OAuthCodeEntry | undefined {
  return oauthCodeMap.get(code);
}

export async function exchangeOAuthCode(req: Request, res: Response): Promise<void> {
  const { code, code_verifier, codeVerifier } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ success: false, message: 'Exchange code is required' });
    return;
  }

  const entry = oauthCodeMap.get(code);
  if (!entry) {
    res.status(400).json({ success: false, message: 'Invalid or expired exchange code' });
    return;
  }

  // Codes stay single-use with a 60 second TTL and are deleted on the first attempt, successful or not.
  oauthCodeMap.delete(code);

  if (Date.now() > entry.expiresAt) {
    res.status(400).json({ success: false, message: 'Exchange code has expired' });
    return;
  }

  if (entry.platform === 'app') {
    const verifier =
      typeof code_verifier === 'string'
        ? code_verifier
        : typeof codeVerifier === 'string'
          ? codeVerifier
          : null;

    if (!verifier || verifier.length < 43 || verifier.length > 128) {
      res.status(400).json({ success: false, message: 'code_verifier is required for app authorization code' });
      return;
    }

    if (!entry.codeChallenge) {
      res.status(400).json({ success: false, message: 'Corrupted authorization session' });
      return;
    }

    const calculatedChallenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    if (!timingSafeEqualStr(calculatedChallenge, entry.codeChallenge)) {
      res.status(400).json({ success: false, message: 'Invalid code_verifier' });
      return;
    }
  }

  res.json({
    success: true,
    data: {
      accessToken: entry.tokens.accessToken,
      refreshToken: entry.tokens.refreshToken,
      expiresIn: entry.tokens.expiresIn,
    },
  });
}

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

function getFrontendBaseUrl(): string {
  const origin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
  return origin.split(',')[0].trim().replace(/\/+$/, '');
}

export function googleAuth(req: Request, res: Response, next: NextFunction): void {
  const nonce = createOAuthState(req.query.platform, req.query.code_challenge);
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: nonce,
  })(req, res, next);
}

export function validateOAuthStateMiddleware(req: Request, res: Response, next: NextFunction): void {
  const stateParam = typeof req.query.state === 'string' ? req.query.state : null;
  const stateData = stateParam ? consumeOAuthState(stateParam) : null;
  if (!stateData) {
    res.redirect(`${getFrontendBaseUrl()}/login?error=invalid_state`);
    return;
  }
  (req as any).oauthState = stateData;
  next();
}

export function handleGoogleOAuthError(req: Request, res: Response): void {
  const oauthState = (req as any).oauthState as OAuthStateData | undefined;
  const isApp = oauthState?.platform === 'app';
  const errorMsg = encodeURIComponent(String(req.query.error || 'google_auth_failed'));
  if (isApp) {
    res.redirect(`neobattle://auth?error=${errorMsg}`);
  } else {
    res.redirect(`${getFrontendBaseUrl()}/login?error=${errorMsg}`);
  }
}

export async function googleCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const frontendUrl = getFrontendBaseUrl();
  const oauthState = (req as any).oauthState as OAuthStateData | undefined;
  const isApp = oauthState?.platform === 'app';

  try {
    let user = req.user as any;
    if (!user) {
      if (isApp) {
        res.redirect('neobattle://auth?error=auth_failed');
      } else {
        res.redirect(`${frontendUrl}/login?error=auth_failed`);
      }
      return;
    }

    const updatedRole = await enforceSuperAdmin(user.id, user.email, user.role);
    if (updatedRole !== user.role) {
      user = await prisma.user.findUnique({ where: { id: user.id } });
      if (!user) {
        if (isApp) {
          res.redirect('neobattle://auth?error=server_error');
        } else {
          res.redirect(`${frontendUrl}/login?error=server_error`);
        }
        return;
      }
    }

    const tokens = await generateTokenPair(user);
    const oauthCode = createOAuthCode(tokens, oauthState?.platform || 'web', oauthState?.codeChallenge);
    if (isApp) {
      res.redirect(`neobattle://auth?code=${oauthCode}`);
    } else {
      res.redirect(`${frontendUrl}/auth/callback?code=${oauthCode}`);
    }
  } catch (error) {
    if (isApp) {
      res.redirect('neobattle://auth?error=google_auth_failed');
    } else {
      res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }
}


export function discordAuth(req: Request, res: Response): void {
  const nonce = createOAuthState(req.query.platform, req.query.code_challenge);
  const clientId =
    process.env.DISCORD_CLIENT_ID ||
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ||
    '1344586908581728347';
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  const redirectUri = `${baseUrl}/api/auth/discord/callback`;
  const discordUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&scope=identify%20email&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(nonce)}`;
  res.redirect(discordUrl);
}

export async function discordCallback(req: Request, res: Response): Promise<void> {
  const { code, error, state } = req.query;
  const frontendUrl = getFrontendBaseUrl();

  const stateParam = typeof state === 'string' ? state : null;
  const stateData = stateParam ? consumeOAuthState(stateParam) : null;
  if (!stateData) {
    res.redirect(`${frontendUrl}/login?error=invalid_state`);
    return;
  }

  const isApp = stateData.platform === 'app';

  if (error || !code || typeof code !== 'string') {
    if (isApp) {
      res.redirect(`neobattle://auth?error=${encodeURIComponent(String(error || 'discord_auth_failed'))}`);
    } else {
      res.redirect(`${frontendUrl}/login?error=discord_auth_failed`);
    }
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
      if (isApp) {
        res.redirect('neobattle://auth?error=discord_client_secret_missing');
      } else {
        res.redirect(`${frontendUrl}/login?error=discord_client_secret_missing`);
      }
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
      if (isApp) {
        res.redirect('neobattle://auth?error=discord_token_failed');
      } else {
        res.redirect(`${frontendUrl}/login?error=discord_token_failed`);
      }
      return;
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      if (isApp) {
        res.redirect('neobattle://auth?error=discord_token_failed');
      } else {
        res.redirect(`${frontendUrl}/login?error=discord_token_failed`);
      }
      return;
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      if (isApp) {
        res.redirect('neobattle://auth?error=discord_user_failed');
      } else {
        res.redirect(`${frontendUrl}/login?error=discord_user_failed`);
      }
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
        if (isApp) {
          res.redirect('neobattle://auth?error=server_error');
        } else {
          res.redirect(`${frontendUrl}/login?error=server_error`);
        }
        return;
      }
    }

    const tokens = await generateTokenPair(user);
    const oauthCode = createOAuthCode(tokens, stateData.platform, stateData.codeChallenge);
    if (isApp) {
      res.redirect(`neobattle://auth?code=${oauthCode}`);
    } else {
      res.redirect(`${frontendUrl}/auth/callback?code=${oauthCode}`);
    }
  } catch (err) {
    if (isApp) {
      res.redirect('neobattle://auth?error=discord_auth_error');
    } else {
      res.redirect(`${frontendUrl}/login?error=discord_auth_error`);
    }
  }
}
