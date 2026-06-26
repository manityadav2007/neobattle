'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens } from '@/lib/api';
import { Loader2 } from 'lucide-react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      setAuthTokens(accessToken, refreshToken);
      router.push('/dashboard');
    } else if (searchParams.get('error')) {
      setError('Google authentication failed. Please try again.');
    } else {
      setError('Invalid authentication response.');
    }
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <a href="/login" className="text-fire-400 hover:underline">Back to Login</a>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20 flex justify-center">
      <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
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
