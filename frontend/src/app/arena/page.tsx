'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHomeScreen from '@/components/app/AppHomeScreen';

export default function ArenaPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Android APK (Capacitor native platform)
    const isCapacitor = Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      (window as any).Capacitor ||
      window.navigator?.userAgent?.includes('NeoBattleApp')
    );

    // 2. iOS Home Screen App (PWA Standalone)
    const isStandalonePWA = Boolean(
      (window.navigator as any)?.standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    );

    if (isCapacitor || isStandalonePWA) {
      setIsAuthorized(true);
    } else {
      router.replace('/?download=required');
    }
  }, [router]);

  if (!isAuthorized) {
    return null;
  }

  return <AppHomeScreen />;
}
