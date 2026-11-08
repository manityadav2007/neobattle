import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';
import { getApiRateLimitKey } from '../middleware/rateLimiter';
import {
  registerPushToken,
  unregisterPushToken,
  togglePushNotifications,
  getPushStatus,
} from '../controllers/push.controller';

const router = Router();

// Rate limiter for push registration/unregistration: max 30 requests per 15 minutes per user
const pushRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: getApiRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many push notification requests, please try again later.',
  },
});

router.post('/register', authenticate, pushRateLimiter, registerPushToken);
router.post('/unregister', authenticate, pushRateLimiter, unregisterPushToken);
router.post('/toggle', authenticate, pushRateLimiter, togglePushNotifications);
router.get('/status', authenticate, getPushStatus);

export default router;
