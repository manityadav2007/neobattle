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

  console.log('[Payment] createOrder called', { amount, userId: userId?.slice(0, 8), hasKey: !!RAZORPAY_KEY_ID, hasSecret: !!RAZORPAY_KEY_SECRET, url: req.headers.origin });

  if (!amount || amount <= 0) {
    console.log('[Payment] Invalid amount:', amount);
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
    console.log('[Payment] Wallet not found for userId:', userId?.slice(0, 8));
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  console.log('[Payment] Wallet found:', { walletId: wallet.id?.slice(0, 8), balance: wallet.balance });

  try {
    const Razorpay = require('razorpay');
    console.log('[Payment] Initializing Razorpay with key_id:', RAZORPAY_KEY_ID.slice(0, 8) + '...');
    const instance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });

    const orderPayload = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `DEP-${userId.slice(0, 8)}-${Date.now()}`,
      notes: { userId },
    };
    console.log('[Payment] Creating Razorpay order:', { amountPaise: orderPayload.amount, currency: orderPayload.currency });

    const order = await instance.orders.create(orderPayload);
    console.log('[Payment] Razorpay order created:', { orderId: order.id, amount: order.amount });

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

    console.log('[Payment] Transaction record created for order:', order.id);
    res.json({ success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency } });
  } catch (err: any) {
    console.error('[Payment] createOrder FAILED:', {
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
      statusCode: err.statusCode,
      error: err.error,
      name: err.name,
    });
    res.status(500).json({ success: false, message: 'Failed to create payment order: ' + (err.message || 'Unknown error') });
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
