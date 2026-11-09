'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertCircle, Chrome, Disc3, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsApp } from '@/hooks/useIsApp';
import LogoAsset from '@/components/LogoAsset';
import { authApi } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import {
  startCapacitorOAuth,
  registerCapacitorAuthListener,
} from '@/lib/capacitorAuth';

type Provider = 'google' | 'discord';

const ALLOWED_PUBLIC_APP_ROUTES = new Set([
  '/register',
  '/terms',
  '/privacy',
  '/refund',
  '/fair-play',
  '/prize-policy',
  '/disclaimer',
]);

export default function AppLoginGate({ children }: { children: ReactNode }) {
  const isApp = useIsApp();
  const { user, loading, refetch } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Cached login hint so logged-in users never see this screen or a flash of it
  const [cachedTokenHint, setCachedTokenHint] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(localStorage.getItem('accessToken'));
    } catch {
      return false;
    }
  });

  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Update token hint if user logs in
  useEffect(() => {
    if (user) {
      setCachedTokenHint(true);
    }
  }, [user]);

  // In app mode, register deep link listener for OAuth callback
  useEffect(() => {
    if (!isApp) return;

    let cleanupFn: (() => void) | undefined;
    registerCapacitorAuthListener(
      async () => {
        setLoadingProvider(null);
        setError('');
        setCachedTokenHint(true);
        await refetch();
        router.push('/');
      },
      (err) => {
        setLoadingProvider(null);
        setError(err || 'Authentication failed. Please try again.');
      }
    ).then((cleanup) => {
      cleanupFn = cleanup;
    });

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [isApp, refetch, router]);

  // Notify splash screen that route content has painted when not verifying auth
  useEffect(() => {
    if (!isApp) return;
    if (!loading || !cachedTokenHint) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            window.dispatchEvent(new CustomEvent('app:route-painted'));
          } catch {}
        });
      });
    }
  }, [isApp, loading, cachedTokenHint, user]);

  // If not running in installed app mode, don't gate: normal browser view unchanged
  if (!isApp) {
    return <>{children}</>;
  }

  // If user is already authenticated, allow through
  if (user) {
    return <>{children}</>;
  }

  // If user has a cached login token and auth is still verifying with server,
  // hold a clean black state so logged-in users never see the login gate or flash
  if (loading && cachedTokenHint) {
    return <div className="min-h-screen bg-black" />;
  }

  // If visiting an allowed registration or policy screen, let them through
  if (pathname && ALLOWED_PUBLIC_APP_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  // Otherwise in app mode with no valid session: show full-screen login gate
  const handleOAuthClick = async (provider: Provider) => {
    setError('');
    setLoadingProvider(provider);
    try {
      await startCapacitorOAuth(provider);
    } catch (err: any) {
      setLoadingProvider(null);
      setError(err?.message || `Failed to start ${provider} authentication.`);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setError('');
    setSubmitting(true);
    try {
      await authApi.login({ email, password });
      setCachedTokenHint(true);
      await refetch();
      router.push('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-between bg-black text-white px-6 py-8 overflow-y-auto select-none safe-top safe-bottom">
      {/* Background ambient gradient glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(59, 130, 246, 0.15) 0%, rgba(249, 115, 22, 0.1) 40%, rgba(0, 0, 0, 0) 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 my-auto flex flex-col items-center max-w-sm mx-auto w-full">
        {/* Shield Logo with gentle glow */}
        <div className="relative mb-4 flex items-center justify-center">
          <div className="absolute w-28 h-28 rounded-full bg-fire-500/15 blur-xl pointer-events-none" />
          <div className="relative flex items-center justify-center w-20 h-20">
            <LogoAsset className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Heading & Subtitle */}
        <h1 className="text-2xl sm:text-3xl font-display font-black text-white tracking-wide text-center">
          Welcome to <span className="gradient-text">NEOBATTLE</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2 text-center max-w-xs leading-relaxed">
          Compete in elite Free Fire tournaments. Win prizes. Dominate the arena.
        </p>

        {error && (
          <div className="mt-4 w-full flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Primary OAuth Actions */}
        <div className="mt-6 w-full space-y-3">
          <button
            type="button"
            disabled={loadingProvider !== null || submitting}
            onClick={() => handleOAuthClick('google')}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-semibold text-white transition-all active:scale-[0.985] disabled:opacity-60"
          >
            {loadingProvider === 'google' ? (
              <Loader2 className="w-5 h-5 animate-spin text-fire-400" />
            ) : (
              <Chrome className="w-5 h-5 text-red-400" />
            )}
            <span>Continue with Google</span>
          </button>

          <button
            type="button"
            disabled={loadingProvider !== null || submitting}
            onClick={() => handleOAuthClick('discord')}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-semibold text-white transition-all active:scale-[0.985] disabled:opacity-60"
          >
            {loadingProvider === 'discord' ? (
              <Loader2 className="w-5 h-5 animate-spin text-fire-400" />
            ) : (
              <Disc3 className="w-5 h-5 text-indigo-400" />
            )}
            <span>Continue with Discord</span>
          </button>
        </div>

        {/* Email Login Form / Toggle */}
        <div className="mt-4 w-full">
          {!emailMode ? (
            <button
              type="button"
              onClick={() => setEmailMode(true)}
              className="w-full text-center py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Or sign in with email &amp; password
            </button>
          ) : (
            <form onSubmit={handleEmailSubmit} className="mt-2 space-y-3 pt-2 border-t border-white/10">
              <div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    required
                    className="input-field w-full pl-9 pr-3 py-2.5 rounded-xl text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="input-field w-full pl-9 pr-3 py-2.5 rounded-xl text-xs text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || loadingProvider !== null}
                className="w-full btn-fire py-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Sign In</span>
              </button>
            </form>
          )}
        </div>

        {/* Link to create account */}
        <div className="mt-6 text-center text-xs text-zinc-400">
          <span>Don&apos;t have an account? </span>
          <Link
            href="/register"
            className="text-fire-400 hover:text-fire-300 font-semibold underline underline-offset-4"
          >
            Create an account
          </Link>
        </div>
      </div>

      {/* Footer legal policies notice */}
      <div className="relative z-10 pt-4 text-center text-[11px] text-zinc-500">
        By continuing, you agree to our{' '}
        <Link href="/terms" className="underline hover:text-zinc-300">
          Terms
        </Link>{' '}
        &amp;{' '}
        <Link href="/privacy" className="underline hover:text-zinc-300">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
