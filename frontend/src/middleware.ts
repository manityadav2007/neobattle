import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const OWNER_EMAIL = 'ymanit330@gmail.com';
const ADMIN_ROLES = ['SUPER_ADMIN'];
const HOST_ACCESS_ROLES = ['HOST', 'SUPER_ADMIN'];

function getRoleFromCookie(req: NextRequest): string | null {
  const cookie = req.cookies.get('userRole');
  return cookie?.value || null;
}

function getEmailFromRequest(req: NextRequest): string | null {
  const cookie = req.cookies.get('userEmail');
  return cookie?.value || null;
}

function isOwner(role: string | null, email: string | null): boolean {
  return role === 'SUPER_ADMIN' || email === OWNER_EMAIL;
}

function isSuperAdmin(role: string | null, email: string | null): boolean {
  return ADMIN_ROLES.includes(role || '') || isOwner(role, email);
}

function isHostOrSuper(role: string | null, email: string | null): boolean {
  return HOST_ACCESS_ROLES.includes(role || '') || isOwner(role, email);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = getRoleFromCookie(req);
  const email = getEmailFromRequest(req);

  const publicPaths = ['/login', '/register', '/auth/callback', '/help-feedback'];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isAdminPath = pathname.startsWith('/admin');
  const isHostPath = pathname.startsWith('/host-dashboard');

  if (isPublicPath) {
    return NextResponse.next();
  }

  if (isAdminPath) {
    if (!isSuperAdmin(role, email)) {
      const dest = role || email ? '/dashboard' : '/login';
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  if (isHostPath) {
    if (!isHostOrSuper(role, email)) {
      const dest = role || email ? '/dashboard' : '/login';
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/host-dashboard/:path*'],
};
