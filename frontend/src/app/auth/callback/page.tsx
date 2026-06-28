'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens } from '@/lib/api';
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

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!accessToken || !refreshToken) {
      setError(searchParams.get('error') ? 'Google authentication failed. Please try again.' : 'Invalid authentication response.');
      return;
    }

    let cancelled = false;

    (async () => {
      setStep('Storing session...');
      setAuthTokens(accessToken, refreshToken);

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