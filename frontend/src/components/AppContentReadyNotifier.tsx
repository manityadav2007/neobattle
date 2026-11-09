'use client';

import { useEffect } from 'react';
import { useIsApp } from '@/hooks/useIsApp';

export default function AppContentReadyNotifier() {
  const isApp = useIsApp();

  useEffect(() => {
    if (!isApp || typeof window === 'undefined') return;

    let dispatched = false;

    const checkAndNotify = () => {
      if (dispatched) return;

      const loginGate = document.querySelector('[data-app-login-gate]');
      const header = document.querySelector('[data-app-header], nav.site-navbar');
      const bottomNav = document.querySelector('[data-app-bottom-nav], nav.site-bottom-nav');
      const main = document.querySelector('main[data-app-main]');
      const hasRouteContent = Boolean(main && main.firstElementChild);

      const isReady = Boolean(
        (loginGate && loginGate.children.length > 0) ||
        (header && bottomNav && hasRouteContent)
      );

      if (isReady) {
        dispatched = true;
        // Two requestAnimationFrame calls guarantee GPU has painted the content
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              (window as any).__appContentReady = true;
              window.dispatchEvent(new CustomEvent('app-content-ready'));
              window.dispatchEvent(new CustomEvent('app:route-painted'));
            } catch {}
          });
        });
      }
    };

    // Check on mount
    checkAndNotify();

    if (dispatched) return;

    // Observe DOM mutations until ready
    const observer = new MutationObserver(() => {
      checkAndNotify();
      if (dispatched) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [isApp]);

  return null;
}
