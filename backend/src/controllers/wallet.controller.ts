import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { paymentGateway } from '../services/paymentGateway.service';

export async function getWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: req.user!.id },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!wallet) {
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      id: wallet.id,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      transactions: wallet.transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
    },
  });
}

export async function deposit(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount } = req.body;
  const userId = req.user!.id;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  const payment = await paymentGateway.createDeposit({
    amount,
    userId,
      description: `Wallet deposit of ₹${amount}`,
  });

  if (!payment.success) {
    res.status(400).json({ success: false, message: payment.message });
    return;
  }

  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        amount: new Decimal(amount),
        description: 'Wallet deposit',
        reference: payment.reference,
        metadata: { transactionId: payment.transactionId },
      },
    }),
  ]);

  res.json({
    success: true,
    message: payment.message,
    data: {
      balance: Number(updatedWallet.balance),
      transaction: { ...transaction, amount: Number(transaction.amount) },
    },
  });
}

export async function withdraw(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount } = req.body;
  const userId = req.user!.id;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  if (Number(wallet.balance) < amount) {
    res.status(400).json({ success: false, message: 'Insufficient balance' });
    return;
  }

  const payment = await paymentGateway.processWithdrawal({
    amount,
    userId,
      description: `Wallet withdrawal of ₹${amount}`,
  });

  if (!payment.success) {
    res.status(400).json({ success: false, message: payment.message });
    return;
  }

  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.COMPLETED,
        amount: new Decimal(amount),
        description: 'Wallet withdrawal',
        reference: payment.reference,
        metadata: { transactionId: payment.transactionId },
      },
    }),
  ]);

  res.json({
    success: true,
    message: payment.message,
    data: {
      balance: Number(updatedWallet.balance),
      transaction: { ...transaction, amount: Number(transaction.amount) },
    },
  });
}

export async function getTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
  if (!wallet) {
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where: { walletId: wallet.id } }),
  ]);

  res.json({
    success: true,
    data: transactions.map((t) => ({ ...t, amount: Number(t.amount) })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
