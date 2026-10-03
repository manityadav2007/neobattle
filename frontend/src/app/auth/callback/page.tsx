'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens, isAuthenticated, api, ApiResponse } from '@/lib/api';
import { authApi } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

function extractAuthParams(searchParams: URLSearchParams | null): {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  authError: string | null;
} {
  let code = searchParams?.get('code') || null;
  let accessToken = searchParams?.get('accessToken') || null;
  let refreshToken = searchParams?.get('refreshToken') || null;
  let authError = searchParams?.get('error') || null;

  if (typeof window !== 'undefined' && window.location.search) {
    const sp = new URLSearchParams(window.location.search);
    if (!code) code = sp.get('code');
    if (!accessToken) accessToken = sp.get('accessToken');
    if (!refreshToken) refreshToken = sp.get('refreshToken');
    if (!authError) authError = sp.get('error');
  }

  return { code, accessToken, refreshToken, authError };
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, user } = useAuth();
  const [error, setError] = useState('');
  const [step, setStep] = useState('Processing...');

  const hasProcessedRef = useRef(false);

  // 1. Immediately redirect whenever authenticated
  useEffect(() => {
    if (user || isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // 2. Perform code exchange once on mount
  useEffect(() => {
    if (hasProcessedRef.current) return;
    if (isAuthenticated() || user) {
      router.replace('/dashboard');
      return;
    }

    let isCancelled = false;
    let timerId: NodeJS.Timeout | null = null;
    let attempts = 0;
    const maxAttempts = 15; // 1.5 seconds max polling for hydration

    const processAuth = async () => {
      if (isCancelled || hasProcessedRef.current) return;

      const params = extractAuthParams(searchParams);

      if (params.authError) {
        hasProcessedRef.current = true;
        setError(`Authentication failed (${params.authError}). Please try again.`);
        return;
      }

      // If no code and no tokens yet, wait for router hydration
      if (!params.code && (!params.accessToken || !params.refreshToken)) {
        attempts++;
        if (attempts < maxAttempts) {
          timerId = setTimeout(processAuth, 100);
          return;
        }

        // Before declaring error, check if user is already authenticated
        if (isAuthenticated() || user) {
          router.replace('/dashboard');
          return;
        }

        hasProcessedRef.current = true;
        setError('Invalid authentication response.');
        return;
      }

      hasProcessedRef.current = true;

      let finalAccessToken = params.accessToken;
      let finalRefreshToken = params.refreshToken;

      if (params.code) {
        setStep('Exchanging authorization code...');
        let exchangeSuccess = false;
        let lastErrorMsg = '';

        for (let retry = 0; retry < 3 && !exchangeSuccess && !isCancelled; retry++) {
          try {
            const res = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
              '/auth/oauth-exchange',
              { code: params.code }
            );
            if (res.data?.data) {
              finalAccessToken = res.data.data.accessToken;
              finalRefreshToken = res.data.data.refreshToken;
              exchangeSuccess = true;
            } else {
              lastErrorMsg = res.data?.message || 'Failed to exchange authorization code';
            }
          } catch (err: any) {
            lastErrorMsg = err.response?.data?.message || 'Authorization exchange failed';
            await new Promise((r) => setTimeout(r, 200));
          }
        }

        if (isCancelled) return;

        if (!exchangeSuccess || !finalAccessToken || !finalRefreshToken) {
          setError(lastErrorMsg || 'Authorization exchange failed. Please try logging in again.');
          return;
        }
      }

      if (!finalAccessToken || !finalRefreshToken) {
        setError('Missing authentication tokens');
        return;
      }

      setStep('Storing session...');
      setAuthTokens(finalAccessToken, finalRefreshToken);

      setStep('Verifying session...');
      try {
        const res = await authApi.me();
        if (res.data) {
          setUser(res.data);
        }
      } catch {
        // Non-blocking: tokens are stored, AuthProvider will reconcile profile
      }

      if (isCancelled) return;

      setStep('Redirecting...');
      router.replace('/dashboard');
    };

    processAuth();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []); // Run strictly once on mount

  if (error && !isAuthenticated() && !user) {
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