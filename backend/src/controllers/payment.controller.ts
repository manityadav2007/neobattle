import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType } from '@prisma/client';

export async function createUpiPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount, tournamentId, utrNumber } = req.body;
  const userId = req.user!.id;

  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid amount' });
    return;
  }

  if (!utrNumber || utrNumber.trim().length < 4) {
    res.status(400).json({ success: false, message: 'Valid UTR/Transaction ID is required' });
    return;
  }

  if (tournamentId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ success: false, message: 'Tournament not found' });
      return;
    }
    if (Number(tournament.entryFee) !== Number(amount)) {
      res.status(400).json({ success: false, message: `Amount must match entry fee (₹${Number(tournament.entryFee)})` });
      return;
    }
  }

  const existing = await prisma.upiPayment.findFirst({
    where: { utrNumber: utrNumber.trim(), status: 'PENDING' },
  });
  if (existing) {
    res.status(409).json({ success: false, message: 'This UTR number is already submitted and pending' });
    return;
  }

  const payment = await prisma.upiPayment.create({
    data: {
      userId,
      tournamentId: tournamentId || null,
      amount: new Decimal(amount),
      utrNumber: utrNumber.trim(),
    },
  });

  res.status(201).json({
    success: true,
    data: payment,
    message: tournamentId ? 'Payment submitted for tournament entry. Awaiting admin approval.' : 'Deposit request submitted. Awaiting admin approval.',
  });
}

export async function approveUpiPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const paymentId = req.params.id;
  const reviewerId = req.user!.id;

  const payment = await prisma.upiPayment.findUnique({
    where: { id: paymentId },
    include: { user: { include: { wallet: true } } },
  });

  if (!payment) {
    res.status(404).json({ success: false, message: 'Payment not found' });
    return;
  }

  if (payment.status !== 'PENDING') {
    res.status(400).json({ success: false, message: `Payment is already ${payment.status.toLowerCase()}` });
    return;
  }

  await prisma.$transaction(async (tx) => {
    let wallet = payment.user.wallet;
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: { userId: payment.userId, balance: 0 },
      });
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: payment.amount } },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        userId: payment.userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        amount: payment.amount,
        description: payment.tournamentId
          ? `UPI payment for tournament entry (UTR: ${payment.utrNumber})`
          : `UPI wallet deposit (UTR: ${payment.utrNumber})`,
        reference: payment.utrNumber,
      },
    });

    if (payment.tournamentId) {
      const existing = await tx.tournamentEntry.findUnique({
        where: { tournamentId_userId: { tournamentId: payment.tournamentId, userId: payment.userId } },
      });
      if (!existing) {
        await tx.tournamentEntry.create({
          data: {
            tournamentId: payment.tournamentId,
            userId: payment.userId,
            isPaid: true,
          },
        });
      }
    }

    await tx.upiPayment.update({
      where: { id: paymentId },
      data: { status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
  });

  res.json({ success: true, message: 'Payment approved' });
}

export async function rejectUpiPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const paymentId = req.params.id;
  const reviewerId = req.user!.id;

  const payment = await prisma.upiPayment.findUnique({ where: { id: paymentId } });

  if (!payment) {
    res.status(404).json({ success: false, message: 'Payment not found' });
    return;
  }

  if (payment.status !== 'PENDING') {
    res.status(400).json({ success: false, message: `Payment is already ${payment.status.toLowerCase()}` });
    return;
  }

  await prisma.upiPayment.update({
    where: { id: paymentId },
    data: { status: 'REJECTED', reviewedBy: reviewerId, reviewedAt: new Date() },
  });

  res.json({ success: true, message: 'Payment rejected' });
}

export async function listPendingUpiPayments(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const payments = await prisma.upiPayment.findMany({
    where: { status: 'PENDING' },
    include: {
      user: { select: { id: true, uid: true, username: true, email: true } },
      tournament: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: payments });
}

export async function listAllUpiPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status } = req.query;
  const where: any = {};
  if (status) where.status = status;

  const payments = await prisma.upiPayment.findMany({
    where,
    include: {
      user: { select: { id: true, uid: true, username: true, email: true } },
      tournament: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: payments });
}

export async function getMyUpiPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const payments = await prisma.upiPayment.findMany({
    where: { userId: req.user!.id },
    include: { tournament: { select: { id: true, title: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: payments });
}
