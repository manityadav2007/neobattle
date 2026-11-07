'use client';

import { useSyncExternalStore } from 'react';

/**
 * Detects whether the app is running inside the installed PWA / Android TWA.
 * The inline bootstrap script in the root layout also tags <html> with
 * `app-mode`, so this stays consistent before React hydration.
 */
export function detectAppMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const standaloneMedia =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const androidReferrer =
      typeof document !== 'undefined' &&
      typeof document.referrer === 'string' &&
      document.referrer.startsWith('android-app://');
    const bootstrapFlag =
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('app-mode');

    return Boolean(standaloneMedia || iosStandalone || androidReferrer || bootstrapFlag);
  } catch {
    return false;
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;

  mediaQuery?.addEventListener?.('change', callback);
  window.addEventListener('appmode:change', callback);

  return () => {
    mediaQuery?.removeEventListener?.('change', callback);
    window.removeEventListener('appmode:change', callback);
  };
}

export function useIsApp(): boolean {
  return useSyncExternalStore(subscribe, detectAppMode, () => false);
}
