'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useIsApp } from '@/hooks/useIsApp';

function ScrollResetLogic() {
  const isApp = useIsApp();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Scroll to top immediately on route change or query param change in app mode
  useEffect(() => {
    if (!isApp) return;

    if (typeof window !== 'undefined') {
      try {
        if ('scrollRestoration' in window.history) {
          window.history.scrollRestoration = 'manual';
        }
      } catch {}

      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [isApp, pathname, searchParams]);

  // Global tab click listener in app mode
  useEffect(() => {
    if (!isApp || typeof window === 'undefined') return;

    const handleTabClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest(
        'button, [role="tab"], a[data-tab], .site-bottom-nav a, nav button'
      );
      if (!target) return;

      const isTab =
        target.getAttribute('role') === 'tab' ||
        target.hasAttribute('data-tab') ||
        target.closest('.site-bottom-nav') !== null ||
        target.getAttribute('data-tab-switch') === 'true';

      if (isTab) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    };

    const handleCustomReset = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    window.addEventListener('click', handleTabClick, { capture: true, passive: true });
    window.addEventListener('app:reset-scroll', handleCustomReset);
    window.addEventListener('app:tab-change', handleCustomReset);

    return () => {
      window.removeEventListener('click', handleTabClick, { capture: true });
      window.removeEventListener('app:reset-scroll', handleCustomReset);
      window.removeEventListener('app:tab-change', handleCustomReset);
    };
  }, [isApp]);

  return null;
}

export default function AppScrollReset() {
  return (
    <Suspense fallback={null}>
      <ScrollResetLogic />
    </Suspense>
  );
}
