'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registerPushNotifications } from '@/lib/pushNotifications';
import { useIsApp } from '@/hooks/useIsApp';

/**
 * Hook to initialize push notification tap and foreground listeners in app mode.
 */
export function usePushNotifications() {
  const router = useRouter();
  const isApp = useIsApp();

  useEffect(() => {
    if (!isApp) return;

    registerPushNotifications(router.push).catch((err) => {
      console.warn('[usePushNotifications] Failed to initialize listeners:', err);
    });
  }, [isApp, router]);
}

export default usePushNotifications;
