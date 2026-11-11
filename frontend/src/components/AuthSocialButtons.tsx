'use client';

import { Chrome, Disc3, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIsApp } from '@/hooks/useIsApp';
import {
  startCapacitorOAuth,
  registerCapacitorAuthListener,
} from '@/lib/capacitorAuth';

type Provider = 'google' | 'discord';

interface ProviderMeta {
  label: string;
  icon: typeof Chrome;
  accentClass: string;
}

const providerMeta: Record<Provider, ProviderMeta> = {
  google: {
    label: 'Sign in with Google',
    icon: Chrome,
    accentClass: 'hover:border-red-500/40 hover:bg-red-500/10',
  },
  discord: {
    label: 'Sign in with Discord',
    icon: Disc3,
    accentClass: 'hover:border-indigo-500/40 hover:bg-indigo-500/10',
  },
};

/**
 * Returns the public OAuth URL for the given provider.
 * Guaranteed to return a valid URL (backend auth route or configured public OAuth URL).
 */
export function getProviderOAuthUrl(provider: Provider): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  if (provider === 'google') {
    return process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL || `${apiUrl}/auth/google`;
  }

  if (provider === 'discord') {
    if (
      process.env.NEXT_PUBLIC_DISCORD_AUTH_URL &&
      process.env.NEXT_PUBLIC_DISCORD_AUTH_URL.trim() !== ''
    ) {
      return process.env.NEXT_PUBLIC_DISCORD_AUTH_URL.trim();
    }
    return `${apiUrl}/auth/discord`;
  }

  return `${apiUrl}/auth/${provider}`;
}

export default function AuthSocialButtons() {
  const router = useRouter();
  const isApp = useIsApp();
  const [error, setError] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const lastProviderRef = useRef<Provider | null>(null);

  // In app mode, listen for neobattle://auth deep links
  useEffect(() => {
    if (!isApp) return;

    let cleanupFn: (() => void) | undefined;
    registerCapacitorAuthListener(
      () => {
        setLoadingProvider(null);
        setError('');
        const target = isApp ? '/arena' : '/dashboard';
        router.push(target);
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
  }, [isApp, router]);

  const handleProviderClick = async (provider: Provider) => {
    setError('');
    lastProviderRef.current = provider;

    if (isApp) {
      setLoadingProvider(provider);
      try {
        await startCapacitorOAuth(provider);
      } catch (err: any) {
        setLoadingProvider(null);
        setError(err.message || 'Failed to start authorization flow.');
      }
      return;
    }

    // Normal browser flow: unchanged
    const targetUrl = getProviderOAuthUrl(provider);
    if (!targetUrl) {
      const meta = providerMeta[provider];
      setError(`${meta.label} is not configured yet.`);
      return;
    }
    window.location.href = targetUrl;
  };

  const handleRetry = () => {
    if (lastProviderRef.current) {
      handleProviderClick(lastProviderRef.current);
    } else {
      setError('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(['google', 'discord'] as Provider[]).map((provider) => {
          const meta = providerMeta[provider];
          const Icon = meta.icon;
          const isLoading = loadingProvider === provider;

          return (
            <button
              key={provider}
              type="button"
              disabled={isLoading}
              onClick={() => handleProviderClick(provider)}
              title={meta.label}
              className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-200 transition-all ${meta.accentClass} ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {meta.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
          <span>{error}</span>
          {isApp && (
            <button
              type="button"
              onClick={handleRetry}
              className="self-start rounded bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
