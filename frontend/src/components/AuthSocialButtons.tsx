'use client';

import { Chrome, Disc3 } from 'lucide-react';
import { useState } from 'react';

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
 * Supports explicit URLs or client ID configuration.
 */
export function getProviderOAuthUrl(provider: Provider): string | undefined {
  if (provider === 'google') {
    if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL) {
      return process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL;
    }
    if (process.env.NEXT_PUBLIC_API_URL) {
      return `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
    }
    return undefined;
  }

  if (provider === 'discord') {
    // 1. Check direct Discord OAuth or custom auth URL
    if (process.env.NEXT_PUBLIC_DISCORD_AUTH_URL) {
      return process.env.NEXT_PUBLIC_DISCORD_AUTH_URL;
    }

    // 2. Build URL from Discord Client ID if available
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (clientId && clientId.trim() !== '') {
      const redirectUri =
        process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI ||
        (typeof window !== 'undefined' && window.location.origin
          ? `${window.location.origin}/auth/callback`
          : '');

      const params = new URLSearchParams({
        client_id: clientId.trim(),
        response_type: 'code',
        scope: 'identify email',
      });

      if (redirectUri) {
        params.set('redirect_uri', redirectUri);
      }

      return `https://discord.com/oauth2/authorize?${params.toString()}`;
    }

    return undefined;
  }

  return undefined;
}

export default function AuthSocialButtons() {
  const [error, setError] = useState('');

  const handleProviderClick = (provider: Provider) => {
    const meta = providerMeta[provider];
    const targetUrl = getProviderOAuthUrl(provider);

    if (!targetUrl) {
      const envHint =
        provider === 'discord'
          ? 'NEXT_PUBLIC_DISCORD_CLIENT_ID or NEXT_PUBLIC_DISCORD_AUTH_URL'
          : 'NEXT_PUBLIC_GOOGLE_AUTH_URL';
      setError(`${meta.label} is not configured yet. Add ${envHint} to your frontend environment to enable it.`);
      return;
    }

    setError('');
    window.location.href = targetUrl;
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(['google', 'discord'] as Provider[]).map((provider) => {
          const meta = providerMeta[provider];
          const Icon = meta.icon;
          const url = getProviderOAuthUrl(provider);
          const isConfigured = Boolean(url);

          return (
            <button
              key={provider}
              type="button"
              onClick={() => handleProviderClick(provider)}
              title={isConfigured ? meta.label : `${meta.label} (Not configured)`}
              className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-200 transition-all ${meta.accentClass}`}
            >
              <Icon className="h-4 w-4" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
          {error}
        </p>
      )}
    </div>
  );
}
