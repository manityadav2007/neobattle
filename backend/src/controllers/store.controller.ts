import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType } from '@prisma/client';

export async function listItems(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const codes = await prisma.storeItem.findMany({
    where: { isRedeemed: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, amount: true, createdAt: true },
  });

  const grouped: Record<string, { id: string; type: string; amount: number; createdAt: Date }[]> = {};
  for (const code of codes) {
    const key = `${code.type}-${code.amount}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(code);
  }

  const items = Object.entries(grouped).map(([, codes]) => ({
    type: codes[0].type,
    amount: codes[0].amount,
    label: codes[0].type === 'GOOGLE_PLAY' ? 'Google Play' : 'Amazon',
    available: codes.length,
  }));

  res.json({ success: true, data: items });
}

export async function redeemItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { itemType, amount } = req.body;
  const userId = req.user!.id;

  if (!itemType || !amount || Number(amount) <= 0) {
    res.status(400).json({ success: false, message: 'Valid itemType and amount required' });
    return;
  }

  const redeemAmount = Number(amount);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find an available code
      const code = await tx.storeItem.findFirst({
        where: { type: itemType, amount: redeemAmount, isRedeemed: false },
        orderBy: { createdAt: 'asc' },
      });

      if (!code) {
        throw new Error('No codes available for this item');
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || Number(wallet.balance) < redeemAmount) {
        throw new Error('Insufficient balance');
      }

      // Atomic wallet decrement
      const walletRes = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: redeemAmount } },
        data: { balance: { decrement: redeemAmount } },
      });
      if (walletRes.count === 0) {
        throw new Error('Insufficient balance');
      }

      // Atomic store item claim
      const storeRes = await tx.storeItem.updateMany({
        where: { id: code.id, isRedeemed: false },
        data: { isRedeemed: true, redeemedBy: userId, redeemedAt: new Date() },
      });
      if (storeRes.count === 0) {
        throw new Error('This code was just claimed by another user. Please try again.');
      }

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(redeemAmount),
          description: `Redeemed ${itemType === 'GOOGLE_PLAY' ? 'Google Play' : 'Amazon'} ₹${redeemAmount} code`,
          metadata: { storeCode: code.code, storeItemId: code.id },
        },
      });

      return { code: code.code, type: itemType, amount: redeemAmount };
    });

    res.json({
      success: true,
      message: `Code redeemed! Code: ${result.code}`,
      data: result,
    });
  } catch (err: any) {
    const isNotFound = err.message === 'No codes available for this item';
    const isConflict = err.message.includes('just claimed');
    const status = isNotFound ? 404 : isConflict ? 409 : 400;
    res.status(status).json({ success: false, message: err.message || 'Redemption failed' });
  }
}

export async function withdrawToCode(_req: AuthenticatedRequest, res: Response): Promise<void> {
  res.status(403).json({
    success: false,
    message: 'Direct automated code withdrawal is disabled for security. Please use the Gift Card withdrawal system for verified fulfillment.',
  });
}

export async function addCode(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { code, type, amount } = req.body;

  if (!code || !type || !amount) {
    res.status(400).json({ success: false, message: 'code, type, and amount required' });
    return;
  }

  const item = await prisma.storeItem.create({ data: { code, type, amount } });
  res.status(201).json({ success: true, data: item });
}

export async function listAllCodes(req: AuthenticatedRequest, res: Response): Promise<void> {
  const items = await prisma.storeItem.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: items });
}
