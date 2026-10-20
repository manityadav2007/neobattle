import { Router } from 'express';
import { handleSmsWebhook } from '../controllers/webhook.controller';
import { webhookLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/webhooks/sms-payment
router.post('/sms-payment', webhookLimiter, handleSmsWebhook);

export default router;
