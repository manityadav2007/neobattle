'use client';

import { useEffect, useState } from 'react';
import { SPLASH_SHIELD_DATA_URI } from './splashShieldData';

export const APP_SPLASH_BG = '/app-splash-bg.webp';
export const FALLBACK_LOGO = '/logo/image_21332e.jpg';

const SESSION_STORAGE_KEY = 'neobattle_splash_shown';
const MIN_POST_NATIVE_HIDE_MS = 800; // minimum 0.8s after native splash hidden
const MAX_SAFETY_MS = 8000;          // maximum 8.0s timeout before showing retry screen
const FADE_OUT_MS = 300;             // 300ms fadeout on top of painted content

export default function SplashScreen() {
  const [mounted, setMounted] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

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

    let dismissed = false;
    let isTimedOut = false;
    let nativeSplashHiddenAt = 0;
    let routeContentPainted = false;
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerDismiss = () => {
      if (dismissed || isTimedOut) return;
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

    const checkDismissReady = () => {
      if (dismissed || isTimedOut) return;
      // Fade out ONLY after the first real content of the route has painted
      // AND native splash has been hidden with at least 0.8s elapsed
      if (!routeContentPainted || nativeSplashHiddenAt === 0) return;

      const elapsedSinceNativeHide = Date.now() - nativeSplashHiddenAt;
      const delay = Math.max(0, MIN_POST_NATIVE_HIDE_MS - elapsedSinceNativeHide);

      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(triggerDismiss, delay);
    };

    const markRoutePainted = () => {
      if (routeContentPainted) return;
      // Two requestAnimationFrame calls guarantee the route content has painted to screen
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          routeContentPainted = true;
          checkDismissReady();
        });
      });
    };

    // Retry helper to call Capacitor SplashScreen.hide({ fadeOutDuration: 250 })
    const hideNativeSplashWithRetry = (retries = 25) => {
      try {
        const splashPlugin = (window as any).Capacitor?.Plugins?.SplashScreen;
        if (splashPlugin && typeof splashPlugin.hide === 'function') {
          splashPlugin.hide({ fadeOutDuration: 250 }).catch(() => {});
          return;
        }
      } catch {}
      if (retries > 0) {
        setTimeout(() => hideNativeSplashWithRetry(retries - 1), 60);
      }
    };

    // 1. Call SplashScreen.hide() as soon as the inline shield layer is painted (two requestAnimationFrame calls)
    // There is NO network dependency for the native hide: pure black background + inlined shield matches the system splash.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nativeSplashHiddenAt = Date.now();
        hideNativeSplashWithRetry();
        checkDismissReady();
      });
    });

    // 2. Background artwork loads asynchronously in background; does NOT block native hide
    const img = new Image();
    img.src = APP_SPLASH_BG;

    const onArtworkReady = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {
        // decode fallback
      }
      setBgLoaded(true);
    };

    if (img.complete) {
      onArtworkReady();
    } else {
      img.onload = () => onArtworkReady();
      img.onerror = () => onArtworkReady();
    }

    // 3. Listen for explicit app-content-ready flag set by layout after header + bottom nav + route content mount
    const handleContentReady = () => {
      markRoutePainted();
    };

    if (typeof window !== 'undefined' && (window as any).__appContentReady) {
      markRoutePainted();
    } else {
      window.addEventListener('app-content-ready', handleContentReady, { once: true });
      window.addEventListener('app:route-painted', handleContentReady, { once: true });
    }

    // 4. Maximum 8-second safety timeout: if content is still not painted, show black-themed retry screen
    const safetyTimer = setTimeout(() => {
      if (!routeContentPainted && !dismissed) {
        isTimedOut = true;
        setTimedOut(true);
      } else {
        triggerDismiss();
      }
    }, MAX_SAFETY_MS);

    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      clearTimeout(safetyTimer);
      window.removeEventListener('app-content-ready', handleContentReady);
      window.removeEventListener('app:route-painted', handleContentReady);
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
      {/* Background artwork: loads in background and fades in over 400ms behind the shield */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <img
          src={APP_SPLASH_BG}
          alt=""
          className={`w-full h-full object-cover object-center splash-bg-art transition-opacity ease-out ${
            bgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDuration: '400ms' }}
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

      {/* Main centered shield & loader: rendered from the very first HTML with zero network dependencies */}
      {!timedOut ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="relative flex flex-col items-center">
            {/* The shield placed at EXACTLY the same position and size (116dp / 116px) as the system splash icon */}
            <img
              src={SPLASH_SHIELD_DATA_URI}
              alt="NeoBattle"
              width={116}
              height={116}
              className="w-[116px] h-[116px] object-contain drop-shadow-[0_0_24px_rgba(249,115,22,0.25)]"
              decoding="sync"
            />

            {/* Circular gradient loader placed below the centered shield */}
            <div className="absolute top-[calc(100%+24px)] splash-spinner-container">
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
      ) : (
        /* Black-themed retry screen with the shield and Try again button if 8s safety timeout reached */
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black px-6 text-center select-auto">
          <img
            src={SPLASH_SHIELD_DATA_URI}
            alt="NeoBattle"
            width={116}
            height={116}
            className="w-[116px] h-[116px] object-contain drop-shadow-[0_0_28px_rgba(249,115,22,0.3)] mb-6"
            decoding="sync"
          />
          <h2 className="text-xl font-bold text-white mb-2 font-display tracking-wider">
            Connection Timeout
          </h2>
          <p className="text-sm text-neutral-400 max-w-xs mb-6">
            Unable to connect to the arena. Please check your internet connection.
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
            className="px-6 py-2.5 rounded-lg font-semibold text-sm bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-lg shadow-orange-500/20 active:scale-95 transition-transform cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
