'use client';

import { useEffect, useState } from 'react';

export const APP_SPLASH_BG = '/app-splash-bg.webp';
export const FALLBACK_LOGO = '/logo/image_21332e.jpg';

const SESSION_STORAGE_KEY = 'neobattle_splash_shown';
const MIN_POST_NATIVE_HIDE_MS = 800; // minimum 0.8s after native splash hidden
const MAX_SAFETY_MS = 6000;          // maximum 6.0s safety timeout
const FADE_OUT_MS = 300;             // 300ms fadeout on top of painted content

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

    let dismissed = false;
    let nativeSplashHiddenAt = 0;
    let routeContentPainted = false;
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

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

    const checkDismissReady = () => {
      if (dismissed) return;
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

    // 1. Preload and decode background artwork
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

      // Two requestAnimationFrame calls guarantee web overlay's artwork has painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setBgLoaded(true);
          nativeSplashHiddenAt = Date.now();
          // Call SplashScreen.hide() ONLY after web artwork has loaded and painted
          hideNativeSplashWithRetry();
          checkDismissReady();
        });
      });
    };

    if (img.complete) {
      onArtworkReady();
    } else {
      img.onload = () => onArtworkReady();
      img.onerror = () => onArtworkReady();
    }

    // 2. Listeners for route painted & data ready
    const handleRoutePainted = () => {
      markRoutePainted();
    };

    window.addEventListener('app:route-painted', handleRoutePainted, { once: true });
    window.addEventListener('app:data-ready', handleRoutePainted, { once: true });

    // 3. MutationObserver fallback to detect route elements in DOM
    const checkDom = () => {
      if (typeof document !== 'undefined') {
        const target = document.querySelector('[data-app-login-gate], [data-app-main], main');
        if (target) {
          markRoutePainted();
          return true;
        }
      }
      return false;
    };

    if (!checkDom() && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        if (checkDom()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // 4. Fallback route painted timer (in case no event fires and DOM observer misses)
    const fallbackRouteTimer = setTimeout(() => {
      markRoutePainted();
    }, 1200);

    // 5. Maximum 6-second safety timeout so splash can NEVER get stuck
    const safetyTimer = setTimeout(() => {
      triggerDismiss();
    }, MAX_SAFETY_MS);

    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      clearTimeout(fallbackRouteTimer);
      clearTimeout(safetyTimer);
      window.removeEventListener('app:route-painted', handleRoutePainted);
      window.removeEventListener('app:data-ready', handleRoutePainted);
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
