import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType, RedeemStatus } from '@prisma/client';
import * as adminController from './admin.controller';

export async function createRedeemRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount, type, accountDetails } = req.body;
  const userId = req.user!.id;

  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid amount' });
    return;
  }

  if (!['GIFT_CARD', 'BANK_TRANSFER'].includes(type)) {
    res.status(400).json({ success: false, message: 'Invalid redeem type' });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < amount) {
    res.status(400).json({ success: false, message: 'Insufficient balance' });
    return;
  }

  const request = await prisma.redeemRequest.create({
    data: {
      userId,
      amount: new Decimal(amount),
      type,
      accountDetails: accountDetails || null,
    },
  });

  await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: amount } },
  });

  await prisma.transaction.create({
    data: {
      walletId: wallet.id,
      userId,
      type: TransactionType.WITHDRAWAL,
      status: TransactionStatus.PENDING,
      amount: new Decimal(amount),
      description: `Redeem request: ${type} — pending admin approval`,
      metadata: { redeemRequestId: request.id },
    },
  });

  res.status(201).json({
    success: true,
    message: 'Redeem request submitted for admin approval. Funds held until review.',
    data: request,
  });
}

export async function listRedeemRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  return adminController.listWithdrawals(req, res);
}

export async function listMyRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  const requests = await prisma.redeemRequest.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: requests.map((r) => ({ ...r, amount: Number(r.amount) })),
  });
}

export async function reviewRedeemRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  return adminController.reviewWithdrawal(req, res);
}
