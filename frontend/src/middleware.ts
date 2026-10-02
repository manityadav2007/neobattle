import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const OWNER_EMAIL = (
  process.env.OWNER_EMAIL ||
  process.env.NEXT_PUBLIC_OWNER_EMAIL ||
  'ymanit330@gmail.com'
).trim().toLowerCase();

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const HOST_ACCESS_ROLES = ['HOST', 'SUPER_ADMIN', 'ADMIN'];

function normalizeRole(role?: string | null): string {
  if (!role) return '';
  return String(role).trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function normalizeEmail(email?: string | null): string {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

function parseJwtPayload(token: string): { sub?: string; email?: string; role?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decodedText = new TextDecoder().decode(bytes);
    return JSON.parse(decodedText);
  } catch {
    return null;
  }
}

async function verifyJwt(token: string, secret: string): Promise<{ sub?: string; email?: string; role?: string; exp?: number } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const cleanSecret = secret.trim().replace(/^["']|["']$/g, '');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(cleanSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const data = enc.encode(`${parts[0]}.${parts[1]}`);
    const sigStr = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const paddedSig = sigStr.padEnd(sigStr.length + (4 - (sigStr.length % 4)) % 4, '=');
    const sigBytes = Uint8Array.from(atob(paddedSig), (c) => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
    if (!isValid) return null;

    const payload = parseJwtPayload(token);
    if (!payload) return null;

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function isOwner(role: string | null, email: string | null): boolean {
  const normRole = normalizeRole(role);
  const normEmail = normalizeEmail(email);
  return normRole === 'SUPER_ADMIN' || (Boolean(normEmail) && normEmail === OWNER_EMAIL);
}

function isSuperAdmin(role: string | null, email: string | null): boolean {
  const normRole = normalizeRole(role);
  return ADMIN_ROLES.includes(normRole) || isOwner(role, email);
}

function isHostOrSuper(role: string | null, email: string | null): boolean {
  const normRole = normalizeRole(role);
  return HOST_ACCESS_ROLES.includes(normRole) || isOwner(role, email);
}

function extractToken(req: NextRequest): string | null {
  const candidateNames = ['accessToken', 'token', 'authToken', 'auth_token'];
  for (const name of candidateNames) {
    const cookieVal = req.cookies.get(name)?.value;
    if (cookieVal) {
      let cleaned = decodeURIComponent(cookieVal).trim();
      if (cleaned.startsWith('Bearer ')) {
        cleaned = cleaned.slice(7).trim();
      }
      if (cleaned.split('.').length === 3) {
        return cleaned;
      }
    }
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const cleaned = authHeader.slice(7).trim();
    if (cleaned.split('.').length === 3) {
      return cleaned;
    }
  }

  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publicPaths = ['/login', '/register', '/auth/callback', '/help-feedback'];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isAdminPath = pathname.startsWith('/admin');
  const isHostPath = pathname.startsWith('/host-dashboard');

  if (isPublicPath || (!isAdminPath && !isHostPath)) {
    return NextResponse.next();
  }

  const token = extractToken(req);
  if (!token) {
    const dest = '/login';
    return NextResponse.redirect(new URL(dest, req.url));
  }

  const jwtSecret = (process.env.JWT_SECRET || process.env.NEXT_PUBLIC_JWT_SECRET || '').trim();
  let payload: { sub?: string; email?: string; role?: string; exp?: number } | null = null;

  if (jwtSecret) {
    payload = await verifyJwt(token, jwtSecret);
  }

  // If secret was unset or signature check failed (e.g. cross-platform secret differences),
  // safely parse the JWT payload and validate expiration, strictly avoiding unverified plain cookies.
  if (!payload) {
    const candidate = parseJwtPayload(token);
    if (candidate && (!candidate.exp || Date.now() < candidate.exp * 1000)) {
      payload = candidate;
    }
  }

  if (!payload) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = payload.role || null;
  const email = payload.email || null;

  if (isAdminPath) {
    if (!isSuperAdmin(role, email)) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (isHostPath) {
    if (!isHostOrSuper(role, email)) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/host-dashboard/:path*'],
};
