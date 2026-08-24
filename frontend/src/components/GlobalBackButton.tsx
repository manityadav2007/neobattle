'use client';

import { usePathname } from 'next/navigation';
import BackButton from './BackButton';

function getParentPath(pathname: string): { href: string; label: string } | null {
  if (pathname === '/') return null;

  // Admin home → player dashboard
  if (pathname === '/admin') return { href: '/dashboard', label: 'Dashboard' };

  // Admin sub-pages → back to /admin
  if (pathname.startsWith('/admin/')) return { href: '/admin', label: 'Admin Panel' };

  // Tournament detail → back to tournament list
  if (pathname.startsWith('/tournaments/')) return { href: '/tournaments', label: 'Back to Tournaments' };

  // Wallet sub-pages → back to /wallet
  if (pathname.startsWith('/wallet/')) return { href: '/wallet', label: 'Wallet' };

  // Dashboard verification page → back to profile dashboard
  if (pathname.startsWith('/dashboard/')) return { href: '/dashboard', label: 'Back to Dashboard' };

  // Everything else → back to /
  return { href: '/', label: 'Home' };
}

export default function GlobalBackButton() {
  const pathname = usePathname();
  const parent = getParentPath(pathname);

  if (!parent) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <BackButton href={parent.href} label={parent.label} />
    </div>
  );
}