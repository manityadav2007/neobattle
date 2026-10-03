'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens, api, ApiResponse } from '@/lib/api';
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

  const isProcessingRef = useRef(false);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (user && hasCompletedRef.current) {
      router.replace('/dashboard');
      return;
    }

    let attempts = 0;
    const maxAttempts = 15; // 1.5 seconds max polling window
    let timerId: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const checkAndProcess = async () => {
      if (isCancelled || hasCompletedRef.current) return;

      const params = extractAuthParams(searchParams);

      if (params.authError) {
        setError(`Authentication failed (${params.authError}). Please try again.`);
        return;
      }

      if (!params.code && (!params.accessToken || !params.refreshToken)) {
        attempts++;
        if (attempts < maxAttempts) {
          timerId = setTimeout(checkAndProcess, 100);
          return;
        }
        setError('Invalid authentication response.');
        return;
      }

      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

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
          isProcessingRef.current = false;
          return;
        }
      }

      if (!finalAccessToken || !finalRefreshToken) {
        setError('Missing authentication tokens');
        isProcessingRef.current = false;
        return;
      }

      setStep('Storing session...');
      setAuthTokens(finalAccessToken, finalRefreshToken);

      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/auth/callback');
      }

      setStep('Verifying session...');
      let profileUser = null;
      for (let retry = 0; retry < 3 && !profileUser && !isCancelled; retry++) {
        try {
          const res = await authApi.me();
          if (res.data) {
            profileUser = res.data;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (isCancelled) return;

      hasCompletedRef.current = true;
      setStep('Redirecting...');
      if (profileUser) {
        setUser(profileUser);
      }
      router.replace('/dashboard');
    };

    checkAndProcess();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
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