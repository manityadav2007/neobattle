import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType, RedeemStatus } from '@prisma/client';

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
  const validStatuses: RedeemStatus[] = [RedeemStatus.PENDING, RedeemStatus.APPROVED, RedeemStatus.COMPLETED, RedeemStatus.REJECTED];
  const statusParam = req.query.status;
  const statusFilter = typeof statusParam === 'string' && (validStatuses as string[]).includes(statusParam as string) ? statusParam as RedeemStatus : undefined;
  const where = statusFilter ? { status: statusFilter } : {};
  const requests = await prisma.redeemRequest.findMany({
    where,
    include: { user: { select: { id: true, username: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({
    success: true,
    data: requests.map((r) => ({ ...r, amount: Number(r.amount) })),
  });
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
  const { status: rawStatus, rejectionReason, giftCode } = req.body;
  const requestId = req.params.id;
  const status = rawStatus as RedeemStatus;

  const validStatuses: RedeemStatus[] = [RedeemStatus.PENDING, RedeemStatus.APPROVED, RedeemStatus.COMPLETED, RedeemStatus.REJECTED];
  if (!(validStatuses as RedeemStatus[]).includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid status' });
    return;
  }

  const request = await prisma.redeemRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    res.status(404).json({ success: false, message: 'Redeem request not found' });
    return;
  }

  if (request.status !== RedeemStatus.PENDING) {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  if (status === RedeemStatus.REJECTED && !rejectionReason) {
    res.status(400).json({ success: false, message: 'Rejection reason required' });
    return;
  }

  if (status === RedeemStatus.COMPLETED && !giftCode) {
    res.status(400).json({ success: false, message: 'Gift code required to complete' });
    return;
  }

  await prisma.redeemRequest.update({
    where: { id: requestId },
    data: {
      status,
      giftCode: status === RedeemStatus.COMPLETED ? giftCode : null,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      ...(status === RedeemStatus.REJECTED ? { rejectionReason } : {}),
    },
  });

  if (status === RedeemStatus.REJECTED) {
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

  if (status === RedeemStatus.APPROVED || status === RedeemStatus.COMPLETED) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: request.userId } });
    if (wallet) {
      await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId: request.userId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: request.amount,
          description: status === RedeemStatus.COMPLETED
            ? `${request.type} redeem completed — gift code provided`
            : `${request.type} redeem approved — funds released`,
          metadata: {
            redeemRequestId: requestId,
            approvedBy: req.user!.id,
            ...(giftCode ? { giftCode } : {}),
          },
        },
      });
    }
  }

  res.json({ success: true, message: `Redeem ${status.toLowerCase()}` });
}
