import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType } from '@prisma/client';

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

export async function listRedeemRequests(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const requests = await prisma.redeemRequest.findMany({
    where: { status: 'PENDING' },
    include: { user: { select: { id: true, username: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: requests.map((r) => ({ ...r, amount: Number(r.amount) })),
  });
}

export async function reviewRedeemRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status, rejectionReason } = req.body;
  const requestId = req.params.id;

  const request = await prisma.redeemRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    res.status(404).json({ success: false, message: 'Redeem request not found' });
    return;
  }

  if (request.status !== 'PENDING') {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  if (status === 'REJECTED' && !rejectionReason) {
    res.status(400).json({ success: false, message: 'Rejection reason required' });
    return;
  }

  await prisma.redeemRequest.update({
    where: { id: requestId },
    data: {
      status,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      ...(status === 'REJECTED' ? { rejectionReason } : {}),
    },
  });

  if (status === 'REJECTED') {
    const wallet = await prisma.wallet.findUnique({ where: { userId: request.userId } });
    if (wallet) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: request.amount } },
        }),
        prisma.transaction.create({
          data: {
            walletId: wallet.id,
            userId: request.userId,
            type: TransactionType.REFUND,
            status: TransactionStatus.COMPLETED,
            amount: request.amount,
            description: 'Redeem request rejected — funds returned',
            metadata: { redeemRequestId: requestId },
          },
        }),
      ]);
    }
  }

  if (status === 'APPROVED') {
    const wallet = await prisma.wallet.findUnique({ where: { userId: request.userId } });
    if (wallet) {
      await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId: request.userId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: request.amount,
          description: `${request.type} redeem approved — funds released`,
          metadata: { redeemRequestId: requestId, approvedBy: req.user!.id },
        },
      });
    }
  }

  res.json({ success: true, message: `Redeem ${status.toLowerCase()}` });
}
