import { Router } from 'express';
import { handleSmsWebhook } from '../controllers/webhook.controller';

const router = Router();

// POST /api/webhooks/sms-payment
router.post('/sms-payment', handleSmsWebhook);

export default router;
