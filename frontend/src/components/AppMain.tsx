'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useIsApp } from '@/hooks/useIsApp';

const WEBSITE_MAIN_CLASS =
  'min-h-screen pt-16 md:pl-20 pb-16 md:pb-0 max-w-full overflow-x-hidden';

export default function AppMain({ children }: { children: ReactNode }) {
  const isApp = useIsApp();
  const pathname = usePathname();
  const isAppHome = isApp && pathname === '/';

  useEffect(() => {
    const root = document.documentElement;

    if (isApp) {
      root.classList.add('app-mode');
      root.classList.toggle('app-home', isAppHome);
      return;
    }

    // During hydration the store briefly reports its server snapshot (false).
    // Keep the bootstrap-applied app shell classes so the installed app never
    // flashes the marketing site, and only clear them on non-home routes.
    if (pathname !== '/') {
      root.classList.remove('app-home');
    }
  }, [isApp, isAppHome, pathname]);

  return (
    <main className={isAppHome ? 'min-h-screen max-w-full overflow-x-hidden' : WEBSITE_MAIN_CLASS}>
      {children}
    </main>
  );
}
