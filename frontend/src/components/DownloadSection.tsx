'use client';

import { useEffect, useState } from 'react';
import { APP_APK_URL } from '@/config/download';

export { APP_APK_URL };

export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneDisplay = Boolean(
      window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
    );
    const isNavStandalone = Boolean(
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
    const isAndroidAppReferrer = Boolean(
      typeof document !== 'undefined' &&
      typeof document.referrer === 'string' &&
      document.referrer.startsWith('android-app://')
    );
    return isStandaloneDisplay || isNavStandalone || isAndroidAppReferrer;
  } catch {
    return false;
  }
}

export function AndroidIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="m380.91 199 42.47-73.57a8.63 8.63 0 0 0-3.12-11.76 8.52 8.52 0 0 0-11.71 3.12l-43 74.52c-32.83-15-69.78-23.35-109.52-23.35s-76.69 8.36-109.52 23.35l-43-74.52a8.6 8.6 0 1 0-14.88 8.64L131 199C57.8 238.64 8.19 312.77 0 399.55h512c-8.19-86.78-57.8-160.91-131.09-200.55zM138.45 327.65a21.46 21.46 0 1 1 21.46-21.46 21.47 21.47 0 0 1-21.46 21.46zm235 0A21.46 21.46 0 1 1 395 306.19a21.47 21.47 0 0 1-21.51 21.46z" />
    </svg>
  );
}

export function AppleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M349.13 136.86c-40.32 0-57.36 19.24-85.44 19.24-28.79 0-50.75-19.1-85.69-19.1-34.2 0-70.67 20.88-93.83 56.45-32.52 50.16-27 144.63 25.67 225.11 18.84 28.81 44 61.12 77 61.47h.6c28.68 0 37.2-18.78 76.67-19h.6c38.88 0 46.68 18.89 75.24 18.89h.6c33-.35 59.51-36.15 78.35-64.85 13.56-20.64 18.6-31 29-54.35-76.19-28.92-88.43-136.93-13.08-178.34-23-28.8-55.32-45.48-85.79-45.48z" />
      <path d="M340.25 32c-24 1.63-52 16.91-68.4 36.86-14.88 18.08-27.12 44.9-22.32 70.91h1.92c25.56 0 51.72-15.39 67-35.11 14.72-18.77 25.88-45.37 21.8-72.66z" />
    </svg>
  );
}

function CloseIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export const IOS_STEPS = [
  '1. Open this site in Safari',
  '2. Tap the Share button',
  '3. Choose Add to Home Screen',
  '4. Tap Add',
] as const;

export default function DownloadSection() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIosModalOpen, setIsIosModalOpen] = useState(false);

  useEffect(() => {
    if (isInstalledApp()) {
      setIsInstalled(true);
    }

    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
      setIsAndroid(true);
    }

    // Reactive listener for standalone display-mode changes
    try {
      const mq = window.matchMedia('(display-mode: standalone)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) setIsInstalled(true);
      };
      mq.addEventListener?.('change', handler);
      return () => mq.removeEventListener?.('change', handler);
    } catch {
      // Ignore
    }
  }, []);

  // Handle escape key to close iOS modal
  useEffect(() => {
    if (!isIosModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsIosModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isIosModalOpen]);

  // Hide the whole section when already running as an installed app
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <section className="relative z-10 py-12 sm:py-16 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto glass-card rounded-2xl p-5 sm:p-6 text-center border border-white/10 hover:border-white/20 transition-all">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-white mb-5 tracking-tight">
              Download NeoBattle
            </h2>

            <div className="flex flex-col min-[360px]:flex-row items-center justify-center gap-3 w-full">
              <a
                href={APP_APK_URL}
                download
                className="w-full min-[360px]:w-auto min-w-[130px] sm:min-w-[140px] px-5 py-3 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 hover:border-fire-500/50 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)] cursor-pointer"
                title="Download NeoBattle for Android"
              >
                <AndroidIcon className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Android</span>
              </a>

              <button
                type="button"
                onClick={() => setIsIosModalOpen(true)}
                className="w-full min-[360px]:w-auto min-w-[130px] sm:min-w-[140px] px-5 py-3 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 hover:border-neo-400/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] cursor-pointer"
                title="Install NeoBattle on iOS"
              >
                <AppleIcon className="w-5 h-5 text-zinc-100 shrink-0" />
                <span>iOS</span>
              </button>
            </div>

            {isAndroid && (
              <p className="mt-3.5 text-xs text-zinc-400">
                Allow &apos;Install unknown apps&apos; when asked.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* iOS Installation Modal */}
      {isIosModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsIosModalOpen(false)}
        >
          <div
            className="glass-card rounded-2xl p-5 sm:p-6 border border-white/15 max-w-xs sm:max-w-sm w-full space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <AppleIcon className="w-5 h-5 text-white shrink-0" />
                <h3 id="ios-modal-title" className="text-base font-bold text-white">
                  Install NeoBattle on iOS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsIosModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-2.5 text-sm text-zinc-300">
              {IOS_STEPS.map((step) => (
                <li key={step} className="flex items-center gap-2.5">
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setIsIosModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors mt-2 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
