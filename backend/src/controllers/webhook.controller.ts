import { Request, Response } from 'express';
import { parseBankSms } from '../services/smsParser';
import { paymentMatchingService } from '../services/paymentMatchingService';

export async function handleSmsWebhook(req: Request, res: Response): Promise<void> {
  const configuredSecret = process.env.WEBHOOK_SECRET?.trim();
  const incomingSecret = (req.header('X-Webhook-Secret') || req.header('x-webhook-secret') || req.query.secret)?.toString()?.trim();

  // Validate shared secret if configured in environment
  if (configuredSecret && configuredSecret !== incomingSecret) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing X-Webhook-Secret header',
    });
    return;
  }

  // Accept various field names commonly provided by SMS forwarding apps
  const message = req.body.message || req.body.body || req.body.text || req.body.msg || '';
  const sender = req.body.sender || req.body.from || req.body.address || req.body.phone || null;

  if (!message || typeof message !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid "message" in webhook payload',
    });
    return;
  }

  try {
    const parsed = parseBankSms(message, sender);
    console.log(`[SMS Webhook] Received SMS from "${sender}":`, {
      parsedAmount: parsed.amount,
      parsedUtr: parsed.utrNumber,
      isCredit: parsed.isCredit,
    });

    const result = await paymentMatchingService.processIncomingPayment(parsed);

    res.json({
      success: true,
      data: result,
      message: result.matched
        ? `Payment matched! Credited ₹${result.creditedAmount} to ${result.username}`
        : `Payment logged to Unmatched: ${result.reason}`,
    });
  } catch (err: any) {
    console.error('[SMS Webhook] Error processing SMS payment:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error processing SMS webhook',
    });
  }
}
