'use client';

import { useEffect, useState } from 'react';

export const APP_SPLASH_BG = '/app-splash-bg.webp';
export const FALLBACK_LOGO = '/logo/image_21332e.jpg';

const SESSION_STORAGE_KEY = 'neobattle_splash_shown';
const MIN_DISPLAY_MS = 1200; // minimum 1.2 seconds
const MAX_DISPLAY_MS = 3000; // maximum 3.0 seconds
const FADE_OUT_MS = 300;     // 300ms fadeout

export default function SplashScreen() {
  const [mounted, setMounted] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    let isApp = false;
    let alreadyShown = false;

    try {
      const isStandalone =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches;

      const isIosStandalone =
        typeof window !== 'undefined' &&
        (window.navigator as Navigator & { standalone?: boolean })?.standalone === true;

      const isTwaReferrer =
        typeof document !== 'undefined' &&
        typeof document.referrer === 'string' &&
        document.referrer.startsWith('android-app://');

      const isCapacitor =
        (typeof window !== 'undefined' &&
          typeof window.navigator?.userAgent === 'string' &&
          window.navigator.userAgent.includes('NeoBattleApp')) ||
        (typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined');

      const hasBootstrapFlag =
        typeof document !== 'undefined' &&
        document.documentElement.classList.contains('app-mode');

      isApp = Boolean(isStandalone || isIosStandalone || isTwaReferrer || isCapacitor || hasBootstrapFlag);
      alreadyShown = Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY));
    } catch {
      // In case of security sandbox / private mode errors
    }

    // Dismiss immediately if not running in installed-app mode or already shown during this session
    if (!isApp || alreadyShown) {
      try {
        document.documentElement.classList.add('twa-splash-dismissed');
        document.documentElement.classList.remove('twa-splash-active');
      } catch {}
      setMounted(false);
      return;
    }

    // Mark as shown for this session
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
      document.documentElement.classList.add('twa-splash-active');
    } catch {}

    const startTime = Date.now();
    let dismissed = false;

    const triggerDismiss = () => {
      if (dismissed) return;
      dismissed = true;
      setFadeOut(true);
      setTimeout(() => {
        setMounted(false);
        try {
          document.documentElement.classList.add('twa-splash-dismissed');
          document.documentElement.classList.remove('twa-splash-active');
        } catch {}
      }, FADE_OUT_MS);
    };

    // Preload image object in JS to set bgLoaded as soon as available
    const img = new Image();
    img.src = APP_SPLASH_BG;
    if (img.complete) {
      setBgLoaded(true);
    } else {
      img.onload = () => setBgLoaded(true);
    }

    // Schedule dismiss once data is ready, respecting minimum 1.2s
    let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleDismiss = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      dismissTimeout = setTimeout(triggerDismiss, remaining);
    };

    // Hard safety timeout: maximum 3.0s
    const safetyTimer = setTimeout(() => {
      triggerDismiss();
    }, MAX_DISPLAY_MS);

    // Initial data ready listener
    const onDataReady = () => {
      scheduleDismiss();
    };
    window.addEventListener('app:data-ready', onDataReady, { once: true });

    // Fallback default: if app:data-ready hasn't fired by ~1.8s, schedule dismiss
    const defaultTimer = setTimeout(() => {
      scheduleDismiss();
    }, 1800);

    return () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
      clearTimeout(safetyTimer);
      clearTimeout(defaultTimer);
      window.removeEventListener('app:data-ready', onDataReady);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div
      id="twa-splash-screen"
      aria-hidden="true"
      className={`fixed inset-0 z-[99999] bg-black overflow-hidden select-none transition-opacity duration-300 ease-out ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background artwork: full screen object-fit cover, centered over pure #000 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={APP_SPLASH_BG}
          alt=""
          onLoad={() => setBgLoaded(true)}
          className={`w-full h-full object-cover object-center splash-bg-art transition-opacity duration-300 ease-out ${
            bgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="eager"
          decoding="async"
        />

        {/* Dark gradient overlay (stronger at top and bottom) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.2) 25%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.85) 100%)',
          }}
        />
      </div>

      {/* Circular spinner loader below the baked shield logo */}
      <div
        className="absolute inset-x-0 flex flex-col items-center justify-center pointer-events-none z-10"
        style={{ top: 'calc(55% + 18px)' }}
      >
        <div className="splash-spinner-container">
          <svg
            className="splash-spinner"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="splash-spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            {/* Thin dim track */}
            <circle
              cx="22"
              cy="22"
              r="19"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="3"
            />
            {/* Gradient ring */}
            <circle
              cx="22"
              cy="22"
              r="19"
              stroke="url(#splash-spinner-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="75 120"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
