'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHomeScreen from '@/components/app/AppHomeScreen';
import { useIsApp } from '@/hooks/useIsApp';

export default function ArenaPage() {
  const router = useRouter();
  const isApp = useIsApp();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Strict Native Check: redirect immediately to / if accessed via desktop/mobile browser without Capacitor
    const isCapacitor =
      typeof window !== 'undefined' &&
      (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
       Boolean((window as any).Capacitor) ||
       window.navigator?.userAgent?.includes('NeoBattleApp') ||
       document.documentElement.classList.contains('app-mode'));

    if (isCapacitor || isApp) {
      setIsAuthorized(true);
    } else {
      router.replace('/');
    }
  }, [isApp, router]);

  if (!isAuthorized) {
    return null;
  }

  return <AppHomeScreen />;
}
