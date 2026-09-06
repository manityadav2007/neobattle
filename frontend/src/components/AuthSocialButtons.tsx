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
 * Guaranteed to return a valid URL (backend auth route or configured public OAuth URL).
 */
export function getProviderOAuthUrl(provider: Provider): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  if (provider === 'google') {
    return process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL || `${apiUrl}/auth/google`;
  }

  if (provider === 'discord') {
    // 1. Explicit Discord Auth URL configured in env
    if (process.env.NEXT_PUBLIC_DISCORD_AUTH_URL && process.env.NEXT_PUBLIC_DISCORD_AUTH_URL.trim() !== '') {
      return process.env.NEXT_PUBLIC_DISCORD_AUTH_URL.trim();
    }

    // 2. Default cleanly to backend Discord auth route
    return `${apiUrl}/auth/discord`;
  }

  return `${apiUrl}/auth/${provider}`;
}

export default function AuthSocialButtons() {
  const [error, setError] = useState('');

  const handleProviderClick = (provider: Provider) => {
    const targetUrl = getProviderOAuthUrl(provider);

    if (!targetUrl) {
      const meta = providerMeta[provider];
      setError(`${meta.label} is not configured yet.`);
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

          return (
            <button
              key={provider}
              type="button"
              onClick={() => handleProviderClick(provider)}
              title={meta.label}
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
