import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType } from '@prisma/client';
import crypto from 'crypto';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount } = req.body;
  const userId = req.user!.id;

  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid amount' });
    return;
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error('[Payment] Missing Razorpay credentials — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
    res.status(500).json({ success: false, message: 'Payment gateway not configured. Please contact support.' });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  try {
    const Razorpay = require('razorpay');
    const instance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });

    const order = await instance.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `DEP-${userId.slice(0, 8)}-${Date.now()}`,
      notes: { userId },
    });

    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        amount: new Decimal(amount),
        description: `Razorpay deposit order ${order.id}`,
        reference: order.id,
        metadata: { orderId: order.id, gateway: 'razorpay' },
      },
    });

    res.json({ success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency } });
  } catch (err) {
    console.error('[Payment] createOrder error:', err);
    res.status(500).json({ success: false, message: 'Failed to create payment order: ' + (err instanceof Error ? err.message : 'Unknown error') });
  }
}

export async function verifyPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');

  if (expectedSignature !== razorpay_signature) {
    res.status(400).json({ success: false, message: 'Invalid signature' });
    return;
  }

  const transaction = await prisma.transaction.findFirst({
    where: { reference: razorpay_order_id, status: 'PENDING' },
    include: { wallet: true },
  });

  if (!transaction) {
    res.status(404).json({ success: false, message: 'Transaction not found' });
    return;
  }

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: transaction.walletId },
      data: { balance: { increment: transaction.amount } },
    }),
    prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.COMPLETED,
        metadata: { ...(transaction.metadata as any), paymentId: razorpay_payment_id, verified: true },
      },
    }),
  ]);

  res.json({ success: true, message: 'Payment verified and wallet credited' });
}

export async function handleWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const signature = req.headers['x-razorpay-signature'] as string;

  const expectedSig = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body)).digest('hex');
  if (signature !== expectedSig) {
    res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    return;
  }

  const event = req.body.event;
  if (event === 'payment.captured') {
    const payment = req.body.payload.payment.entity;
    const orderId = payment.order_id;
    const userId = payment.notes?.userId;

    if (!userId) {
      res.json({ success: true });
      return;
    }

    const transaction = await prisma.transaction.findFirst({
      where: { reference: orderId, status: 'PENDING' },
      include: { wallet: true },
    });

    if (transaction) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: transaction.walletId },
          data: { balance: { increment: transaction.amount } },
        }),
        prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: TransactionStatus.COMPLETED, metadata: { paymentId: payment.id, webhook: true } },
        }),
      ]);
    }
  }

  res.json({ success: true });
}
