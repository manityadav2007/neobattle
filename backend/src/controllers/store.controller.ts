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

  if (!itemType || !amount) {
    res.status(400).json({ success: false, message: 'itemType and amount required' });
    return;
  }

  const code = await prisma.storeItem.findFirst({
    where: { type: itemType, amount, isRedeemed: false },
    orderBy: { createdAt: 'asc' },
  });

  if (!code) {
    res.status(404).json({ success: false, message: 'No codes available for this item' });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < amount) {
    res.status(400).json({ success: false, message: 'Insufficient balance' });
    return;
  }

  await prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } }),
    prisma.storeItem.update({
      where: { id: code.id },
      data: { isRedeemed: true, redeemedBy: userId, redeemedAt: new Date() },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.COMPLETED,
        amount: new Decimal(amount),
        description: `Redeemed ${itemType === 'GOOGLE_PLAY' ? 'Google Play' : 'Amazon'} ₹${amount} code`,
        metadata: { storeCode: code.code, storeItemId: code.id },
      },
    }),
  ]);

  res.json({
    success: true,
    message: `Code redeemed! Code: ${code.code}`,
    data: { code: code.code, type: itemType, amount },
  });
}

function generateRedeemCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) group += chars[Math.floor(Math.random() * chars.length)];
    groups.push(group);
  }
  return `GP-${groups.join('-')}`;
}

export async function withdrawToCode(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { amount } = req.body;
    const userId = req.user!.id;
    const withdrawAmount = Number(amount);

    if (!amount || withdrawAmount <= 0) {
      res.status(400).json({ success: false, message: 'Valid amount is required' });
      return;
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || Number(wallet.balance) < withdrawAmount) {
      res.status(400).json({ success: false, message: 'Insufficient balance' });
      return;
    }

    const redeemCode = generateRedeemCode();

    await prisma.$transaction([
      prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: withdrawAmount } } }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(withdrawAmount),
          description: `Withdrew ₹${withdrawAmount} to Google Play redeem code`,
          metadata: { redeemCode, method: 'GOOGLE_PLAY' },
        },
      }),
    ]);

    res.json({
      success: true,
      message: 'Withdrawal successful!',
      data: { code: redeemCode, amount: withdrawAmount },
    });
  } catch (error) {
    console.error('[Store] withdrawToCode error:', error);
    res.status(500).json({ success: false, message: 'Withdrawal failed' });
  }
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
