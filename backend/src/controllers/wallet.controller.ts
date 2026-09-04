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
      currency: wallet.currency === 'USD' ? 'INR' : (wallet.currency || 'INR'),
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
  const { amount, payoutMethod, upiId, bankAccountNumber, bankIfsc, accountHolderName } = req.body;
  const userId = req.user!.id;

  if (!amount || Number(amount) <= 0) {
    res.status(400).json({ success: false, message: 'Valid amount is required' });
    return;
  }

  if (!['UPI', 'BANK_TRANSFER'].includes(payoutMethod)) {
    res.status(400).json({ success: false, message: 'payoutMethod must be UPI or BANK_TRANSFER' });
    return;
  }

  let payoutDetails: Record<string, string>;
  let payoutLabel: string;

  if (payoutMethod === 'UPI') {
    if (!upiId || !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim())) {
      res.status(400).json({ success: false, message: 'A valid UPI ID is required (e.g. name@bank)' });
      return;
    }
    payoutDetails = { method: 'UPI', upiId: upiId.trim() };
    payoutLabel = `UPI: ${upiId.trim()}`;
  } else {
    if (!bankAccountNumber || bankAccountNumber.trim().length < 8) {
      res.status(400).json({ success: false, message: 'A valid bank account number is required' });
      return;
    }
    if (!bankIfsc || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(bankIfsc.trim())) {
      res.status(400).json({ success: false, message: 'A valid IFSC code is required (e.g. SBIN0001234)' });
      return;
    }
    payoutDetails = {
      method: 'BANK_TRANSFER',
      bankAccountNumber: bankAccountNumber.trim(),
      bankIfsc: bankIfsc.trim().toUpperCase(),
      ...(accountHolderName && { accountHolderName: accountHolderName.trim() }),
    };
    payoutLabel = `A/C ••${bankAccountNumber.trim().slice(-4)} (${bankIfsc.trim().toUpperCase()})`;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    res.status(404).json({ success: false, message: 'Wallet not found' });
    return;
  }

  if (Number(wallet.balance) < Number(amount)) {
    res.status(400).json({ success: false, message: 'Insufficient balance' });
    return;
  }

  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: Number(amount) } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: new Decimal(Number(amount)),
        description: `Withdrawal request to ${payoutLabel} — pending admin approval`,
        metadata: { payout: payoutDetails, isAdminReviewRequired: true },
      },
    }),
  ]);

  res.json({
    success: true,
    message: 'Withdrawal request submitted! Funds are held until the admin processes your payout.',
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
