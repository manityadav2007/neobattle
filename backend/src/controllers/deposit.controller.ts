import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType } from '@prisma/client';

export async function createDepositRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount, screenshotUrl } = req.body;
  const userId = req.user!.id;

  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid amount' });
    return;
  }

  if (!screenshotUrl) {
    res.status(400).json({ success: false, message: 'Payment screenshot URL is required' });
    return;
  }

  const request = await prisma.depositRequest.create({
    data: {
      userId,
      amount: new Decimal(amount),
      screenshotUrl,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Deposit request submitted for admin approval',
    data: request,
  });
}

export async function listDepositRequests(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const requests = await prisma.depositRequest.findMany({
    where: { status: 'PENDING' },
    include: { user: { select: { id: true, username: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: requests.map((r) => ({ ...r, amount: Number(r.amount) })),
  });
}

export async function reviewDepositRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status, rejectionReason } = req.body;
  const requestId = req.params.id;

  const request = await prisma.depositRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    res.status(404).json({ success: false, message: 'Deposit request not found' });
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

  await prisma.depositRequest.update({
    where: { id: requestId },
    data: {
      status,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      ...(status === 'REJECTED' ? { rejectionReason } : {}),
    },
  });

  if (status === 'APPROVED') {
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
            type: TransactionType.DEPOSIT,
            status: TransactionStatus.COMPLETED,
            amount: request.amount,
            description: 'Deposit approved via manual screenshot verification',
            metadata: { depositRequestId: requestId, approvedBy: req.user!.id },
          },
        }),
      ]);
    }
  }

  res.json({ success: true, message: `Deposit ${status.toLowerCase()}` });
}
