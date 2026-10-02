import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const OWNER_EMAIL = process.env.OWNER_EMAIL || process.env.NEXT_PUBLIC_OWNER_EMAIL || 'ymanit330@gmail.com';
const ADMIN_ROLES = ['SUPER_ADMIN'];
const HOST_ACCESS_ROLES = ['HOST', 'SUPER_ADMIN'];

function parseJwtPayload(token: string): { sub?: string; email?: string; role?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

async function verifyJwt(token: string, secret: string): Promise<{ sub?: string; email?: string; role?: string; exp?: number } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
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
  return role === 'SUPER_ADMIN' || (Boolean(email) && email === OWNER_EMAIL);
}

function isSuperAdmin(role: string | null, email: string | null): boolean {
  return ADMIN_ROLES.includes(role || '') || isOwner(role, email);
}

function isHostOrSuper(role: string | null, email: string | null): boolean {
  return HOST_ACCESS_ROLES.includes(role || '') || isOwner(role, email);
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

  const token = req.cookies.get('accessToken')?.value;
  if (!token) {
    const dest = '/login';
    return NextResponse.redirect(new URL(dest, req.url));
  }

  const jwtSecret = process.env.JWT_SECRET;
  let payload: { sub?: string; email?: string; role?: string; exp?: number } | null = null;

  if (jwtSecret) {
    payload = await verifyJwt(token, jwtSecret);
  } else {
    payload = parseJwtPayload(token);
    if (payload?.exp && Date.now() >= payload.exp * 1000) {
      payload = null;
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
