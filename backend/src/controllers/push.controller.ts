import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';

const registerPushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10, 'Token too short')
    .max(500, 'Token too long')
    .regex(/^[a-zA-Z0-9_\-:]+$/, 'Invalid push token format'),
  platform: z.enum(['android', 'ios', 'web']).optional().default('android'),
});

const unregisterPushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10, 'Token too short')
    .max(500, 'Token too long')
    .regex(/^[a-zA-Z0-9_\-:]+$/, 'Invalid push token format'),
});

const togglePushSchema = z.object({
  enabled: z.boolean(),
});

/**
 * POST /api/push/register
 * Registers or updates an FCM push token for the authenticated user
 */
export async function registerPushToken(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = registerPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parsed.error.issues.map((i) => i.message),
      });
      return;
    }

    const { token, platform } = parsed.data;

    // Security: associate token with authenticated user. If token was previously associated with another user,
    // re-bind it to the new user.
    await prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform,
        lastSeenAt: new Date(),
      },
    });

    // Ensure user pushNotificationsEnabled is set to true on registration
    await prisma.user.update({
      where: { id: userId },
      data: { pushNotificationsEnabled: true },
    });

    res.status(200).json({
      success: true,
      message: 'Push token registered successfully',
    });
  } catch (err) {
    console.error('[PushController] Error in registerPushToken:', err);
    res.status(500).json({ success: false, message: 'Failed to register push token' });
  }
}

/**
 * POST /api/push/unregister
 * Unregisters a push token for the authenticated user (cannot delete other users' tokens)
 */
export async function unregisterPushToken(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = unregisterPushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parsed.error.issues.map((i) => i.message),
      });
      return;
    }

    const { token } = parsed.data;

    // Strict security check: only delete token belonging to requesting user
    const deleted = await prisma.pushToken.deleteMany({
      where: {
        token,
        userId,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Push token unregistered',
      removed: deleted.count > 0,
    });
  } catch (err) {
    console.error('[PushController] Error in unregisterPushToken:', err);
    res.status(500).json({ success: false, message: 'Failed to unregister push token' });
  }
}

/**
 * POST /api/push/toggle
 * Updates master notification toggle. If disabled, deletes user tokens.
 */
export async function togglePushNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = togglePushSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid boolean value for enabled' });
      return;
    }

    const { enabled } = parsed.data;

    await prisma.user.update({
      where: { id: userId },
      data: { pushNotificationsEnabled: enabled },
    });

    if (!enabled) {
      // Remove all active tokens for this user so no FCM calls can reach them
      await prisma.pushToken.deleteMany({
        where: { userId },
      });
    }

    res.status(200).json({
      success: true,
      enabled,
    });
  } catch (err) {
    console.error('[PushController] Error in togglePushNotifications:', err);
    res.status(500).json({ success: false, message: 'Failed to update notification settings' });
  }
}

/**
 * GET /api/push/status
 * Returns push notification toggle state and token status for current user
 */
export async function getPushStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const [user, tokenCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { pushNotificationsEnabled: true },
      }),
      prisma.pushToken.count({ where: { userId } }),
    ]);

    res.status(200).json({
      success: true,
      pushNotificationsEnabled: user?.pushNotificationsEnabled ?? true,
      hasRegisteredToken: tokenCount > 0,
    });
  } catch (err) {
    console.error('[PushController] Error in getPushStatus:', err);
    res.status(500).json({ success: false, message: 'Failed to get push status' });
  }
}
