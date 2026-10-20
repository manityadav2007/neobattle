'use client';

import { useEffect, useState } from 'react';

const SESSION_STORAGE_KEY = 'neobattle_splash_shown';

const PARTICLES = [
  { left: '16%', bottom: '26%', size: '3px', color: '#f97316', delay: '0s', duration: '2.5s' },
  { left: '26%', bottom: '18%', size: '2px', color: '#60a5fa', delay: '0.6s', duration: '3.1s' },
  { left: '38%', bottom: '32%', size: '4px', color: '#fb923c', delay: '1.2s', duration: '2.4s' },
  { left: '48%', bottom: '20%', size: '2px', color: '#ef4444', delay: '0.3s', duration: '2.8s' },
  { left: '60%', bottom: '28%', size: '3px', color: '#f97316', delay: '1.5s', duration: '2.6s' },
  { left: '72%', bottom: '22%', size: '2px', color: '#3b82f6', delay: '0.8s', duration: '3.2s' },
  { left: '82%', bottom: '34%', size: '3px', color: '#fbbf24', delay: '1.8s', duration: '2.7s' },
  { left: '32%', bottom: '42%', size: '2px', color: '#f97316', delay: '2.1s', duration: '2.9s' },
  { left: '66%', bottom: '44%', size: '3px', color: '#fb923c', delay: '0.4s', duration: '2.3s' },
];

export default function SplashScreen() {
  const [mounted, setMounted] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let isTwa = false;
    let alreadyShown = false;

    try {
      const isStandalone =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches;

      const isTwaReferrer =
        typeof document !== 'undefined' &&
        typeof document.referrer === 'string' &&
        document.referrer.startsWith('android-app://');

      isTwa = Boolean(isStandalone || isTwaReferrer);
      alreadyShown = Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY));
    } catch {
      // In case of security sandbox / private mode errors
    }

    // Dismiss immediately if not running in TWA or already shown during this session
    if (!isTwa || alreadyShown) {
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

    // Begin 300ms fade out after ~1.8s (reveals app around 2.1s)
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 1800);

    // Unmount after fade transition completes
    const unmountTimer = setTimeout(() => {
      setMounted(false);
      try {
        document.documentElement.classList.add('twa-splash-dismissed');
        document.documentElement.classList.remove('twa-splash-active');
      } catch {}
    }, 2150);

    // Hard safety timeout: never block the app for longer than 3 seconds
    const safetyTimer = setTimeout(() => {
      setMounted(false);
      try {
        document.documentElement.classList.add('twa-splash-dismissed');
        document.documentElement.classList.remove('twa-splash-active');
      } catch {}
    }, 2800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
      clearTimeout(safetyTimer);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div
      id="twa-splash-screen"
      aria-hidden="true"
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black overflow-hidden select-none transition-opacity duration-300 ease-out ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background radial gradient glow (soft blue-to-orange theme style) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.18) 0%, rgba(249, 115, 22, 0.12) 35%, rgba(0, 0, 0, 0) 70%)',
        }}
      />

      {/* Faint floating particles like home page hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="splash-particle"
            style={{
              left: p.left,
              bottom: p.bottom,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
      </div>

      {/* Centered content */}
      <div className="relative flex flex-col items-center justify-center z-10 px-4">
        {/* Gentle pulsing glow behind the logo */}
        <div className="splash-glow" />

        {/* Logo container with continuous diagonal shine sweep */}
        <div className="splash-logo-container w-28 h-28 sm:w-36 sm:h-36">
          <img
            src="/logo/image_21332e.jpg"
            alt="NEOBATTLE"
            width={144}
            height={144}
            className="w-full h-full object-contain mix-blend-screen relative z-10"
            loading="eager"
            decoding="sync"
          />
        </div>

        {/* Brand name */}
        <div className="mt-5 text-center">
          <span className="font-display font-black text-2xl sm:text-3xl tracking-widest gradient-text">
            NEOBATTLE
          </span>
        </div>
      </div>
    </div>
  );
}
