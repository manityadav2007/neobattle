'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        className="bg-black text-white min-h-screen flex items-center justify-center p-4 font-sans"
        style={{ background: '#000' }}
      >
        <div className="max-w-md w-full text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Something went wrong</h2>
          <p className="text-sm text-zinc-400">
            An unexpected error occurred while loading the app.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-all"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
