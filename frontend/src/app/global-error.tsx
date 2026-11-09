'use client';

import { useEffect, useState } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [hasRetried, setHasRetried] = useState(false);

  useEffect(() => {
    try {
      const isApp =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches ||
          document.documentElement.classList.contains('app-mode') ||
          (window.navigator as any)?.standalone === true ||
          typeof (window as any).Capacitor !== 'undefined' ||
          window.navigator?.userAgent?.includes('NeoBattleApp'));

      if (isApp) {
        console.error('[App Global Error]', error);
      }
    } catch {}
  }, [error]);

  useEffect(() => {
    // One automatic retry before showing Try again button
    try {
      const alreadyAutoRetried = sessionStorage.getItem('neobattle_auto_retry_done') === '1';
      if (!alreadyAutoRetried) {
        sessionStorage.setItem('neobattle_auto_retry_done', '1');
        setHasRetried(true);
        reset();
        return;
      }
    } catch {}
    setHasRetried(true);
  }, [reset]);

  const handleManualRetry = () => {
    try {
      sessionStorage.removeItem('neobattle_auto_retry_done');
    } catch {}
    reset();
  };

  return (
    <html lang="en" className="dark" style={{ background: '#000', colorScheme: 'dark' }}>
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
        <style
          dangerouslySetInnerHTML={{
            __html: 'html,body{background:#000 !important;color-scheme:dark;}',
          }}
        />
      </head>
      <body
        className="bg-black text-white min-h-screen flex items-center justify-center p-4 font-sans select-none"
        style={{ background: '#000' }}
      >
        <div className="max-w-md w-full text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Something went wrong</h2>
          <p className="text-sm text-zinc-400">
            An unexpected error occurred while loading the app.
          </p>
          {hasRetried && (
            <button
              type="button"
              onClick={handleManualRetry}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-all"
            >
              Try again
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
