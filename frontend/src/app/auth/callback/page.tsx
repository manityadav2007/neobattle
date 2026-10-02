'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens, api, ApiResponse } from '@/lib/api';
import { authApi } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, user } = useAuth();
  const [error, setError] = useState('');
  const [step, setStep] = useState('Processing...');

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
      return;
    }

    const code = searchParams.get('code');
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!code && (!accessToken || !refreshToken)) {
      const authError = searchParams.get('error');
      setError(authError ? `Authentication failed (${authError}). Please try again.` : 'Invalid authentication response.');
      return;
    }

    let cancelled = false;

    (async () => {
      let finalAccessToken = accessToken;
      let finalRefreshToken = refreshToken;

      if (code) {
        setStep('Exchanging authorization code...');
        try {
          const res = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>('/auth/oauth-exchange', { code });
          if (cancelled) return;
          if (res.data?.data) {
            finalAccessToken = res.data.data.accessToken;
            finalRefreshToken = res.data.data.refreshToken;
          } else {
            setError(res.data?.message || 'Failed to exchange authorization code');
            return;
          }
        } catch (err: any) {
          if (cancelled) return;
          setError(err.response?.data?.message || 'Authorization exchange failed');
          return;
        }
      }

      if (!finalAccessToken || !finalRefreshToken) {
        setError('Missing authentication tokens');
        return;
      }

      setStep('Storing session...');
      setAuthTokens(finalAccessToken, finalRefreshToken);

      // Clean sensitive query parameters from browser history immediately
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/auth/callback');
      }

      setStep('Verifying session...');
      try {
        const res = await authApi.me();
        if (cancelled) return;
        if (res.data) {
          setStep('Redirecting...');
          setUser(res.data);
          router.replace('/dashboard');
        } else {
          setError('Failed to load user profile');
        }
      } catch (err) {
        if (cancelled) return;
        setError('Session verification failed. Please try logging in again.');
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, router, setUser, user]);

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <a href="/login" className="text-fire-400 hover:underline">Back to Login</a>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20 flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      <p className="text-sm text-zinc-400">{step}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-20 flex justify-center"><Loader2 className="w-8 h-8 text-fire-400 animate-spin" /></div>}>
      <CallbackContent />
    </Suspense>
  );
}