'use client';

import { Chrome, Disc3 } from 'lucide-react';
import { useState } from 'react';

type Provider = 'google' | 'discord';

const providerConfig: Record<
  Provider,
  {
    label: string;
    icon: typeof Chrome;
    url: string | undefined;
    accentClass: string;
  }
> = {
  google: {
    label: 'Sign in with Google',
    icon: Chrome,
    url: process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL,
    accentClass: 'hover:border-red-500/40 hover:bg-red-500/10',
  },
  discord: {
    label: 'Sign in with Discord',
    icon: Disc3,
    url: process.env.NEXT_PUBLIC_DISCORD_AUTH_URL,
    accentClass: 'hover:border-indigo-500/40 hover:bg-indigo-500/10',
  },
};

export default function AuthSocialButtons() {
  const [error, setError] = useState('');

  const handleProviderClick = (provider: Provider) => {
    const config = providerConfig[provider];
    if (!config.url) {
      setError(`${config.label} is not configured yet. Add the public OAuth URL to your frontend environment to enable it.`);
      return;
    }

    setError('');
    window.location.href = config.url;
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(['google', 'discord'] as Provider[]).map((provider) => {
          const config = providerConfig[provider];
          const Icon = config.icon;

          return (
            <button
              key={provider}
              type="button"
              onClick={() => handleProviderClick(provider)}
              className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-200 transition-all ${config.accentClass}`}
            >
              <Icon className="h-4 w-4" />
              {config.label}
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
