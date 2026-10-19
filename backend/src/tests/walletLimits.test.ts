import test from 'node:test';
import assert from 'node:assert/strict';
import { getWalletLimits, validateAmount } from '../config/walletLimits';
import { paymentMatchingService } from '../services/paymentMatchingService';
import * as walletController from '../controllers/wallet.controller';
import { prisma } from '../config/db';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionType, TransactionStatus } from '@prisma/client';

// ============================================================================
// 1. Configurable limits reading & Amount validation tests
// ============================================================================

test('walletLimits - parses default limits correctly when env vars unset', () => {
  const originalEnv = { ...process.env };
  delete process.env.MIN_DEPOSIT;
  delete process.env.MAX_DEPOSIT;
  delete process.env.MIN_WITHDRAWAL;
  delete process.env.MAX_WITHDRAWAL;
  delete process.env.MAX_DAILY_WITHDRAWAL_PER_USER;

  try {
    const limits = getWalletLimits();
    assert.equal(limits.minDeposit, 10);
    assert.equal(limits.maxDeposit, 10000);
    assert.equal(limits.minWithdrawal, 100);
    assert.equal(limits.maxWithdrawal, 5000);
    assert.equal(limits.maxDailyWithdrawalPerUser, 5000);
  } finally {
    process.env = originalEnv;
  }
});

test('walletLimits - parses custom limits correctly from environment variables', () => {
  const originalEnv = { ...process.env };
  process.env.MIN_DEPOSIT = '25';
  process.env.MAX_DEPOSIT = '50000';
  process.env.MIN_WITHDRAWAL = '200';
  process.env.MAX_WITHDRAWAL = '20000';
  process.env.MAX_DAILY_WITHDRAWAL_PER_USER = '25000';

  try {
    const limits = getWalletLimits();
    assert.equal(limits.minDeposit, 25);
    assert.equal(limits.maxDeposit, 50000);
    assert.equal(limits.minWithdrawal, 200);
    assert.equal(limits.maxWithdrawal, 20000);
    assert.equal(limits.maxDailyWithdrawalPerUser, 25000);
  } finally {
    process.env = originalEnv;
  }
});

test('validateAmount - validates positive numbers with at most 2 decimal places', () => {
  assert.equal(validateAmount(10).isValid, true);
  assert.equal(validateAmount(10.5).isValid, true);
  assert.equal(validateAmount(10.55).isValid, true);
  assert.equal(validateAmount('10.55').isValid, true);

  assert.equal(validateAmount(0).isValid, false);
  assert.equal(validateAmount(-5).isValid, false);
  assert.equal(validateAmount(NaN).isValid, false);
  assert.equal(validateAmount('abc').isValid, false);
  assert.equal(validateAmount(10.555).isValid, false);
  assert.match(validateAmount(10.555).message || validateAmount(10.555).error || '', /at most 2 decimal places/i);
});

// ============================================================================
// 2. Deposit limits enforcement tests
// ============================================================================

test('Deposit - rejects amount below MIN_DEPOSIT', async () => {
  const userId = 'user-dep-below-min';
  const limits = getWalletLimits();

  await assert.rejects(
    async () => {
      await paymentMatchingService.createDepositOrder(userId, limits.minDeposit - 1);
    },
    (err: any) => {
      assert.match(err.message, new RegExp(`Minimum deposit amount is ₹${limits.minDeposit}`));
      return true;
    }
  );
});

test('Deposit - rejects amount above MAX_DEPOSIT', async () => {
  const userId = 'user-dep-above-max';
  const limits = getWalletLimits();

  await assert.rejects(
    async () => {
      await paymentMatchingService.createDepositOrder(userId, limits.maxDeposit + 1);
    },
    (err: any) => {
      assert.match(err.message, new RegExp(`Maximum deposit amount is ₹${limits.maxDeposit.toLocaleString()}`));
      return true;
    }
  );
});

test('Deposit - rejects amount with more than 2 decimal places', async () => {
  const userId = 'user-dep-decimals';

  await assert.rejects(
    async () => {
      await paymentMatchingService.createDepositOrder(userId, 50.123);
    },
    (err: any) => {
      assert.match(err.message, /at most 2 decimal places/i);
      return true;
    }
  );
});

test('Deposit - accepts valid amount within range', async () => {
  const userId = 'user-dep-valid';
  const originalFindUnique = prisma.wallet.findUnique;
  const originalUpdateMany = prisma.transaction.updateMany;
  const originalFindMany = prisma.transaction.findMany;
  const originalUpdate = prisma.transaction.update;
  const originalCreate = prisma.transaction.create;

  try {
    (prisma.wallet.findUnique as any) = async () => ({ id: 'wallet-1', userId, balance: new Decimal(0) });
    (prisma.transaction.updateMany as any) = async () => ({ count: 0 });
    (prisma.transaction.findMany as any) = async () => [];
    (prisma.transaction.update as any) = async () => ({});
    (prisma.transaction.create as any) = async (args: any) => ({
      id: 'tx-valid-dep',
      userId,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      amount: args.data.amount,
      requestedAmount: args.data.requestedAmount,
      actualQrAmount: args.data.actualQrAmount,
      decimalOffset: args.data.decimalOffset,
      timerExpiresAt: args.data.timerExpiresAt,
      expiresAt: args.data.expiresAt,
    });

    const order = await paymentMatchingService.createDepositOrder(userId, 500);
    assert.equal(order.requestedAmount, 500);
    assert.equal(order.transactionId, 'tx-valid-dep');
  } finally {
    prisma.wallet.findUnique = originalFindUnique;
    prisma.transaction.updateMany = originalUpdateMany;
    prisma.transaction.findMany = originalFindMany;
    prisma.transaction.update = originalUpdate;
    prisma.transaction.create = originalCreate;
  }
});

// ============================================================================
// 3. Withdrawal limits enforcement tests
// ============================================================================

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.data = body;
      return this;
    },
  };
  return res;
}

test('Withdrawal - rejects amount below MIN_WITHDRAWAL', async () => {
  const limits = getWalletLimits();
  const req: any = {
    user: { id: 'user-w-min' },
    body: {
      amount: limits.minWithdrawal - 1,
      payoutMethod: 'UPI',
      upiId: 'test@upi',
    },
  };
  const res = createMockResponse();

  await walletController.withdraw(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.data.message, new RegExp(`Minimum withdrawal amount is ₹${limits.minWithdrawal}`));
});

test('Withdrawal - rejects amount above MAX_WITHDRAWAL', async () => {
  const limits = getWalletLimits();
  const req: any = {
    user: { id: 'user-w-max' },
    body: {
      amount: limits.maxWithdrawal + 1,
      payoutMethod: 'UPI',
      upiId: 'test@upi',
    },
  };
  const res = createMockResponse();

  await walletController.withdraw(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.data.message, new RegExp(`Maximum withdrawal amount per request is ₹${limits.maxWithdrawal.toLocaleString()}`));
});

test('Withdrawal - rejects amount with more than 2 decimal places', async () => {
  const req: any = {
    user: { id: 'user-w-decimals' },
    body: {
      amount: 150.123,
      payoutMethod: 'UPI',
      upiId: 'test@upi',
    },
  };
  const res = createMockResponse();

  await walletController.withdraw(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.data.message, /at most 2 decimal places/i);
});

test('Withdrawal - rejects amount exceeding wallet balance', async () => {
  const originalFindUnique = prisma.wallet.findUnique;
  try {
    (prisma.wallet.findUnique as any) = async () => ({
      id: 'wallet-1',
      userId: 'user-w-balance',
      balance: new Decimal(200),
    });

    const req: any = {
      user: { id: 'user-w-balance' },
      body: {
        amount: 300,
        payoutMethod: 'UPI',
        upiId: 'test@upi',
      },
    };
    const res = createMockResponse();

    await walletController.withdraw(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, /Insufficient.*balance/i);
  } finally {
    prisma.wallet.findUnique = originalFindUnique;
  }
});

test('Withdrawal - rejects amount exceeding 24-hour daily withdrawal cap', async () => {
  const limits = getWalletLimits();
  const originalFindUnique = prisma.wallet.findUnique;
  const originalFindMany = prisma.transaction.findMany;

  try {
    (prisma.wallet.findUnique as any) = async () => ({
      id: 'wallet-1',
      userId: 'user-w-daily',
      balance: new Decimal(10000),
    });

    // Mock recent withdrawals in past 24h already totaling 4000
    (prisma.transaction.findMany as any) = async () => [
      { amount: new Decimal(2500) },
      { amount: new Decimal(1500) },
    ];

    // Attempting to withdraw 1500 would push total to 5500 > 5000 daily cap
    const req: any = {
      user: { id: 'user-w-daily' },
      body: {
        amount: 1500,
        payoutMethod: 'UPI',
        upiId: 'test@upi',
      },
    };
    const res = createMockResponse();

    await walletController.withdraw(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.message, new RegExp(`Daily withdrawal limit of ₹${limits.maxDailyWithdrawalPerUser.toLocaleString()} exceeded`));
    assert.match(res.data.message, /up to ₹1,000 more today/i);
  } finally {
    prisma.wallet.findUnique = originalFindUnique;
    prisma.transaction.findMany = originalFindMany;
  }
});

test('Withdrawal - accepts valid withdrawal within all limits', async () => {
  const originalFindUnique = prisma.wallet.findUnique;
  const originalFindMany = prisma.transaction.findMany;
  const originalTransaction = prisma.$transaction;

  try {
    (prisma.wallet.findUnique as any) = async () => ({
      id: 'wallet-1',
      userId: 'user-w-valid',
      balance: new Decimal(5000),
    });

    // Recent withdrawals: 1000 in past 24h
    (prisma.transaction.findMany as any) = async () => [
      { amount: new Decimal(1000) },
    ];

    // Mock interactive transaction
    (prisma.$transaction as any) = async (cb: any) => {
      const txMock = {
        wallet: {
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => ({ id: 'wallet-1', balance: new Decimal(4500) }),
        },
        transaction: {
          create: async (args: any) => ({
            id: 'tx-withdrawn-ok',
            ...args.data,
          }),
        },
      };
      return cb(txMock);
    };

    const req: any = {
      user: { id: 'user-w-valid' },
      body: {
        amount: 500,
        payoutMethod: 'UPI',
        upiId: 'user@okhdfcbank',
      },
    };
    const res = createMockResponse();

    await walletController.withdraw(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.success, true);
    assert.match(res.data.message, /Withdrawal request submitted/i);
  } finally {
    prisma.wallet.findUnique = originalFindUnique;
    prisma.transaction.findMany = originalFindMany;
    prisma.$transaction = originalTransaction;
  }
});
