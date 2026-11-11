import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { prisma } from '../config/db';

export interface PushMessagePayload {
  title: string;
  body: string;
  path?: string;
  data?: Record<string, string>;
}

// Allowlist of allowed relative in-app paths
const ALLOWED_PATH_PATTERNS = [
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

export function sanitizeInAppPath(path?: string): string {
  if (!path || typeof path !== 'string') return '/';
  const trimmed = path.trim();
  // Must start with '/' and not be protocol-relative '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  // Block any scheme / script injection
  if (/[\\<>"'`\r\n\t]|javascript:|data:|http:|https:/i.test(trimmed)) return '/';
  // Check against pattern allowlist
  const isAllowed = ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(trimmed));
  return isAllowed ? trimmed : '/';
}

// Sanitize text so payment details, balances, or email addresses are never sent in push notifications
export function sanitizeNotificationText(text: string): string {
  if (!text) return '';
  return text
    // Replace emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    // Replace card / account numbers (12-19 digits)
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{0,7}\b/g, '[account]')
    // Replace explicit balance statements
    .replace(/(balance\s*(?:is|:)?\s*(?:₹|INR)?\s*)\d+(\.\d{1,2})?/gi, '$1***')
    .slice(0, 300);
}

class FcmService {
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init(): void {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson || !serviceAccountJson.trim()) {
      console.log('[FCM] Push notifications disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
      return;
    }

    try {
      if (getApps().length > 0) {
        this.isInitialized = true;
        return;
      }

      const credentials = JSON.parse(serviceAccountJson);
      if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
        console.warn('[FCM] Invalid service account format: missing required credentials.');
        return;
      }

      initializeApp({
        credential: cert(credentials),
      });

      this.isInitialized = true;
      console.log('[FCM] Firebase Admin successfully initialized.');
    } catch (err) {
      // Security rule: Never log raw credentials or secrets
      console.error('[FCM] Failed to initialize Firebase Admin SDK. Check JSON syntax.');
    }
  }

  public isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Sends multicast FCM message to an array of push tokens with auto-cleanup of dead tokens
   */
  public async sendToTokens(
    tokens: string[],
    payload: PushMessagePayload
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!this.isInitialized || !tokens || tokens.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const title = sanitizeNotificationText(payload.title || 'NeoBattle');
    const body = sanitizeNotificationText(payload.body || '');
    const cleanPath = sanitizeInAppPath(payload.path);

    let totalSuccess = 0;
    let totalFailure = 0;
    const tokensToDelete: string[] = [];

    // Multicast allows up to 500 tokens per batch
    const BATCH_SIZE = 500;
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);

      const dataPayload: Record<string, string> = {
        path: cleanPath,
        route: cleanPath,
        timestamp: Date.now().toString(),
      };
      if (payload.data) {
        for (const [k, v] of Object.entries(payload.data)) {
          if (v !== undefined && v !== null) {
            dataPayload[k] = String(v);
          }
        }
      }

      const message: MulticastMessage = {
        tokens: batch,
        notification: {
          title,
          body,
        },
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'neobattle_default_channel',
            icon: 'ic_stat_neobattle',
            color: '#F97316',
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      };

      try {
        const response = await getMessaging().sendEachForMulticast(message);
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errCode = resp.error.code;
            // Clean up unregistered or invalid tokens
            if (
              errCode === 'messaging/registration-token-not-registered' ||
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/invalid-argument'
            ) {
              tokensToDelete.push(batch[idx]);
            }
          }
        });
      } catch (err: any) {
        const errCode = typeof err?.code === 'string' ? err.code : 'unknown';
        console.error('[FCM] Batch send error, code:', errCode);
        totalFailure += batch.length;
      }
    }

    // Clean up stale or unregistered tokens
    if (tokensToDelete.length > 0) {
      try {
        await prisma.pushToken.deleteMany({
          where: { token: { in: tokensToDelete } },
        });
        console.log(`[FCM] Cleaned up ${tokensToDelete.length} unregistered / invalid push token(s)`);
      } catch {
        console.error('[FCM] Failed to clean up dead tokens');
      }
    }

    return { successCount: totalSuccess, failureCount: totalFailure };
  }

  /**
   * Sends push notification to a single user (respecting master toggle and optional category toggle)
   */
  public async sendToUser(
    userId: string,
    payload: PushMessagePayload,
    category?: 'notifyTournaments' | 'notifyResults' | 'notifyAlerts'
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!this.isInitialized || !userId) {
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          pushNotificationsEnabled: true,
          notifyTournaments: true,
          notifyResults: true,
          notifyAlerts: true,
          pushTokens: {
            where: { platform: 'android' },
            select: { token: true },
          },
        },
      });

      if (!user || user.pushNotificationsEnabled === false || !user.pushTokens || user.pushTokens.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      if (category && user[category] === false) {
        return { successCount: 0, failureCount: 0 };
      }

      const tokens = user.pushTokens.map((t) => t.token);
      return await this.sendToTokens(tokens, payload);
    } catch (err: any) {
      const errCode = typeof err?.code === 'string' ? err.code : 'unknown';
      console.error(`[FCM] Error sending to user ${userId}, code: ${errCode}`);
      return { successCount: 0, failureCount: 0 };
    }
  }

  /**
   * Broadcasts push notification to all active users with push notifications enabled.
   * Queries push_tokens directly for platform 'android'.
   * Does NOT drop users if their notification preference is null; defaults to true.
   */
  public async sendToAll(
    payload: PushMessagePayload
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!this.isInitialized) {
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const pushTokens = await prisma.pushToken.findMany({
        where: {
          platform: 'android',
          user: {
            isActive: { not: false },
            pushNotificationsEnabled: { not: false },
          },
        },
        select: { token: true },
      });

      if (pushTokens.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      const tokens = pushTokens.map((t) => t.token);
      return await this.sendToTokens(tokens, payload);
    } catch (err: any) {
      const errCode = typeof err?.code === 'string' ? err.code : 'unknown';
      console.error('[FCM] Error in broadcast sendToAll, code:', errCode);
      return { successCount: 0, failureCount: 0 };
    }
  }

  /**
   * Sends push notification to multiple user IDs.
   * Queries push_tokens directly for platform 'android'.
   * Does NOT drop users if their notification preference is null; defaults to true.
   */
  public async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!this.isInitialized || !userIds || userIds.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
      if (uniqueUserIds.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      const pushTokens = await prisma.pushToken.findMany({
        where: {
          userId: { in: uniqueUserIds },
          platform: 'android',
          user: {
            isActive: { not: false },
            pushNotificationsEnabled: { not: false },
          },
        },
        select: { token: true },
      });

      if (pushTokens.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      const tokens = pushTokens.map((t) => t.token);
      const stringData: Record<string, string> = {};
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined && v !== null) {
            stringData[k] = String(v);
          }
        }
      }

      return await this.sendToTokens(tokens, {
        title,
        body,
        path: data?.route || data?.path,
        data: stringData,
      });
    } catch (err: any) {
      const errCode = typeof err?.code === 'string' ? err.code : 'unknown';
      console.error('[FCM] Error in sendToUsers, code:', errCode);
      return { successCount: 0, failureCount: 0 };
    }
  }
}

export const fcmService = new FcmService();

export const sendToUsers = (
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) => fcmService.sendToUsers(userIds, title, body, data);
