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

  // Accept various field names commonly provided by SMS / Notification forwarding apps
  const message =
    req.body.message ||
    req.body.body ||
    req.body.text ||
    req.body.msg ||
    req.body.content ||
    req.body.notification ||
    (typeof req.body === 'string' ? req.body : '');
  const sender = req.body.sender || req.body.from || req.body.address || req.body.phone || req.body.title || null;

  if (!message || typeof message !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid "message" in webhook payload',
    });
    return;
  }

  try {
    const parsed = parseBankSms(message, sender);
    const result = await paymentMatchingService.processIncomingPayment(parsed);

    // Final parsed result log showing amount, isCredit, and matched order if any
    console.log('[SMS Webhook] Final Parsed Result:', {
      amount: parsed.amount,
      isCredit: parsed.isCredit,
      utr: parsed.utrNumber,
      sender: parsed.sender,
      rawMessage: parsed.rawMessage,
      matched: result.matched,
      matchedOrder: result.matched
        ? {
            transactionId: (result as any).transactionId,
            userId: (result as any).userId,
            username: (result as any).username,
            creditedAmount: (result as any).creditedAmount,
            actualAmount: (result as any).actualAmount,
          }
        : null,
      reason: (result as any).reason || null,
    });

    res.json({
      success: true,
      data: result,
      message: result.matched
        ? `Payment matched! Credited ₹${(result as any).creditedAmount} to ${(result as any).username}`
        : `Payment logged to Unmatched: ${(result as any).reason}`,
    });
  } catch (err: any) {
    console.error('[SMS Webhook] Error processing SMS payment:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error processing SMS webhook',
    });
  }
}
