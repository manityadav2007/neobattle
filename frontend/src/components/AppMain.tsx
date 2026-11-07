'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useIsApp } from '@/hooks/useIsApp';

const MAIN_CLASS =
  'min-h-screen pt-16 md:pl-20 pb-20 md:pb-0 max-w-full overflow-x-hidden';

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

    if (pathname !== '/') {
      root.classList.remove('app-home');
    }
  }, [isApp, isAppHome, pathname]);

  return (
    <main className={MAIN_CLASS}>
      {children}
    </main>
  );
}
