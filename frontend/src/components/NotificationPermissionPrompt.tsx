'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, Settings, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsApp } from '@/hooks/useIsApp';
import {
  checkPushPermission,
  requestPushPermission,
  registerPushNotifications,
  openAppNotificationSettings,
  shouldShowPushPrompt,
  recordPushPromptDismissed,
  recordPushPromptGranted,
} from '@/lib/pushNotifications';

export default function NotificationPermissionPrompt() {
  const isApp = useIsApp();
  const { user } = useAuth();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [deniedPermanently, setDeniedPermanently] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    // Only run in installed app mode and when user is logged in
    if (!isApp || !user) return;

    let mounted = true;

    async function evaluatePermission() {
      try {
        const permission = await checkPushPermission();
        if (!mounted) return;

        if (permission === 'granted') {
          // Already granted - ensure push listener and token registration are active
          await registerPushNotifications(router.push);
          return;
        }

        // If not granted, check if we should prompt the user
        if (shouldShowPushPrompt()) {
          setDeniedPermanently(permission === 'denied');
          setIsOpen(true);
        }
      } catch (err) {
        console.error('[NotificationPrompt] Check error:', err);
      }
    }

    // Delay slightly after app start so it doesn't appear instantaneously
    const timer = setTimeout(() => {
      evaluatePermission();
    }, 1200);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [isApp, user, router]);

  if (!isApp || !user || !isOpen) {
    return null;
  }

  const handleAllow = async () => {
    setRequesting(true);
    try {
      const result = await requestPushPermission();
      if (result === 'granted') {
        recordPushPromptGranted();
        await registerPushNotifications(router.push);
        setIsOpen(false);
      } else {
        // System refused permission or it was denied permanently
        setDeniedPermanently(true);
        recordPushPromptDismissed();
      }
    } catch {
      setDeniedPermanently(true);
    } finally {
      setRequesting(false);
    }
  };

  const handleDismiss = () => {
    recordPushPromptDismissed();
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-[#0f0f14] border border-orange-500/30 p-5 shadow-2xl shadow-orange-500/10 text-white">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
            {deniedPermanently ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-base text-white">Stay Updated</h3>
            <p className="text-xs text-gray-400">Never miss your matches</p>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed mb-4">
          Get match alerts: tournament starts, results and announcements.
        </p>

        {deniedPermanently ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-orange-950/30 border border-orange-500/20 p-2.5 text-xs text-orange-200">
              Notification permissions are currently disabled. You can turn them on in your device settings.
            </div>
            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={openAppNotificationSettings}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition"
              >
                <Settings className="w-3.5 h-3.5 mr-1.5" />
                Open Settings
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={requesting}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition disabled:opacity-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleAllow}
              disabled={requesting}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-medium transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
            >
              {requesting ? 'Enabling...' : 'Allow'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
