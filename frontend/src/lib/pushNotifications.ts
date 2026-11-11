'use client';

import { detectAppMode } from '@/hooks/useIsApp';
import { api } from '@/lib/api';

const STORAGE_PROMPT_COUNT = 'neobattle_push_prompt_count';
const STORAGE_LAST_PROMPT = 'neobattle_push_prompt_last_time';
const STORAGE_REGISTERED_TOKEN = 'neobattle_push_registered_token';
const PROMPT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_PROMPT_COUNT = 3;

export const PUSH_RECEIVED_EVENT = 'neobattle:push-received';

export interface PushReceivedEventDetail {
  id?: string;
  title: string;
  body: string;
  path?: string;
}

// Allowlisted safe in-app path regex patterns
const ALLOWED_APP_PATTERNS = [
  /^\/$/,
  /^\/tournaments(\/[a-zA-Z0-9_-]+)?$/,
  /^\/dashboard(\/[a-zA-Z0-9_-]+)?$/,
  /^\/wallet(\/[a-zA-Z0-9_-]+)?$/,
  /^\/profile(\/[a-zA-Z0-9_-]+)?$/,
  /^\/settings$/,
  /^\/stats$/,
  /^\/shop$/,
  /^\/leaderboards$/,
  /^\/esports$/,
  /^\/help-feedback$/,
  /^\/about$/,
  /^\/admin(\/[a-zA-Z0-9_-]+)?$/,
];

export function isSafeAppPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  // Must start with '/' and not be protocol-relative '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  // Block any scheme / protocol
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  // Block unsafe characters
  if (/[\\<>"'`\r\n\t]|javascript:|data:|http:|https:/i.test(trimmed)) return false;

  return ALLOWED_APP_PATTERNS.some((regex) => regex.test(trimmed));
}

export function shouldShowPushPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!detectAppMode()) return false;

  try {
    const count = parseInt(localStorage.getItem(STORAGE_PROMPT_COUNT) || '0', 10);
    if (count >= MAX_PROMPT_COUNT) return false;

    const lastPrompt = parseInt(localStorage.getItem(STORAGE_LAST_PROMPT) || '0', 10);
    if (lastPrompt > 0 && Date.now() - lastPrompt < PROMPT_INTERVAL_MS) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function recordPushPromptDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    const current = parseInt(localStorage.getItem(STORAGE_PROMPT_COUNT) || '0', 10);
    localStorage.setItem(STORAGE_PROMPT_COUNT, String(current + 1));
    localStorage.setItem(STORAGE_LAST_PROMPT, String(Date.now()));
  } catch {}
}

export function recordPushPromptGranted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PROMPT_COUNT, String(MAX_PROMPT_COUNT));
    localStorage.setItem(STORAGE_LAST_PROMPT, String(Date.now()));
  } catch {}
}

export async function checkPushPermission(): Promise<'prompt' | 'granted' | 'denied'> {
  if (typeof window === 'undefined' || !detectAppMode()) {
    return 'denied';
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const status = await PushNotifications.checkPermissions();
    if (status.receive === 'granted') return 'granted';
    if (status.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'denied';
  }
}

export async function requestPushPermission(): Promise<'granted' | 'denied'> {
  if (typeof window === 'undefined' || !detectAppMode()) {
    return 'denied';
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      recordPushPromptGranted();
      return 'granted';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

export async function openAppNotificationSettings(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    // Try Android intent URL to open notification settings directly for our package
    window.location.href =
      'intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=live.neobattle.twa;end';
  } catch {
    // Fallback to application details settings
    try {
      window.location.href =
        'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:live.neobattle.twa;end';
    } catch {}
  }
}

let listenersInitialized = false;

export async function registerPushNotifications(
  navigate?: (path: string) => void
): Promise<void> {
  if (typeof window === 'undefined' || !detectAppMode()) {
    return;
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    if (!listenersInitialized) {
      listenersInitialized = true;

      // Handle successful registration
      await PushNotifications.addListener('registration', async (token) => {
        try {
          const lastToken = localStorage.getItem(STORAGE_REGISTERED_TOKEN);
          if (lastToken === token.value) {
            // Already synced, but still inform backend if needed
          }
          await api.post('/push/register', {
            token: token.value,
            platform: 'android',
          });
          localStorage.setItem(STORAGE_REGISTERED_TOKEN, token.value);
        } catch (err) {
          console.error('[Push] Failed to register token with backend:', err);
        }
      });

      // Handle registration errors
      await PushNotifications.addListener('registrationError', (error) => {
        console.warn('[Push] Registration error:', error?.error || error);
      });

      // Handle notification received while app is in foreground
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const route =
          notification.data?.route ||
          notification.data?.url ||
          notification.data?.path;

        const detail: PushReceivedEventDetail = {
          id: notification.id,
          title: notification.title || 'NeoBattle',
          body: notification.body || '',
          path: isSafeAppPath(route) ? route : undefined,
        };

        window.dispatchEvent(
          new CustomEvent(PUSH_RECEIVED_EVENT, { detail })
        );
      });

      // Handle user tapping on a notification
      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const route =
          notification.notification.data?.route ||
          notification.notification.data?.url ||
          notification.notification.data?.path ||
          '/';

        const target = isSafeAppPath(route) ? route : '/';
        if (navigate) {
          navigate(target);
        } else if (typeof window !== 'undefined') {
          window.location.href = target;
        }
      });
    }

    await PushNotifications.register();
  } catch (err) {
    console.error('[Push] Register failed:', err);
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (typeof window === 'undefined' || !detectAppMode()) {
    return;
  }

  try {
    const token = localStorage.getItem(STORAGE_REGISTERED_TOKEN);
    if (token) {
      await api.post('/push/unregister', { token }).catch(() => {});
      localStorage.removeItem(STORAGE_REGISTERED_TOKEN);
    }

    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners().catch(() => {});
    listenersInitialized = false;
  } catch (err) {
    console.warn('[Push] Unregister error:', err);
  }
}
