import QRCode from 'qrcode';
import { prisma } from '../config/db';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { notificationService } from './notification.service';
import { ParsedSmsPayment } from './smsParser';

// Simple in-process mutex to avoid race conditions when reserving decimal slots
class SimpleMutex {
  private queue: Array<(release: () => void) => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const dispatch = () => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          const next = this.queue.shift();
          if (next) next(dispatch);
        });
      };
      if (!this.locked) {
        dispatch();
      } else {
        this.queue.push(dispatch);
      }
    });
  }
}

const poolMutex = new SimpleMutex();

export interface DepositOrderResult {
  transactionId: string;
  requestedAmount: number;
  actualQrAmount: number;
  upiDeepLink: string;
  qrCodeDataUrl: string;
  timerExpiresAt: Date;
  expiresAt: Date;
}

export class PaymentMatchingService {
  /**
   * Cleans up expired orders older than 60 minutes and releases their decimal offsets.
   */
  async cleanupExpiredOrders(): Promise<number> {
    const now = new Date();
    const result = await prisma.transaction.updateMany({
      where: {
        type: TransactionType.DEPOSIT,
        status: { in: [TransactionStatus.PENDING, TransactionStatus.AWAITING_LATE_MATCH] },
        expiresAt: { lte: now },
      },
      data: {
        status: TransactionStatus.EXPIRED,
        decimalOffset: null,
      },
    });
    return result.count;
  }

  /**
   * Picks the next available decimal offset (.01 to .99) from the pool.
   * Slot 1 = .01, Slot 99 = .99.
   */
  private async getNextAvailableOffset(): Promise<number> {
    // 1. Clear any overdue orders first to maximize slot availability
    await this.cleanupExpiredOrders();

    const now = new Date();
    const activeOrders = await prisma.transaction.findMany({
      where: {
        type: TransactionType.DEPOSIT,
        status: { in: [TransactionStatus.PENDING, TransactionStatus.AWAITING_LATE_MATCH] },
        expiresAt: { gt: now },
        decimalOffset: { not: null },
      },
      select: { decimalOffset: true },
    });

    const inUseSet = new Set(activeOrders.map((o) => o.decimalOffset).filter((o): o is number => o !== null));

    // Slots range from 1 (.01) to 99 (.99)
    for (let slot = 1; slot <= 99; slot++) {
      if (!inUseSet.has(slot)) {
        return slot;
      }
    }

    throw new Error('High traffic right now, please try again in a moment.');
  }

  /**
   * Creates a new dynamic QR deposit order for a user.
   */
  async createDepositOrder(userId: string, requestedAmount: number): Promise<DepositOrderResult> {
    if (!requestedAmount || requestedAmount <= 0) {
      throw new Error('Please enter a valid deposit amount');
    }
    const cleanRequested = Math.floor(requestedAmount); // Ensure integer base amount
    if (cleanRequested <= 0) {
      throw new Error('Deposit amount must be at least ₹1');
    }

    // Acquire lock to avoid slot collision between concurrent users
    const release = await poolMutex.acquire();
    try {
      // Find or create user wallet
      let wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: { userId, balance: new Decimal(0) },
        });
      }

      // Pick next available offset (1..99)
      const offset = await this.getNextAvailableOffset();
      const decimalFraction = offset / 100;
      const actualQrAmount = Number((cleanRequested + decimalFraction).toFixed(2));

      const now = new Date();
      const timerExpiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes UI countdown
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 60 minutes late match

      const upiId = (process.env.MERCHANT_UPI_ID || process.env.UPI_ID || '').trim();
      if (!upiId) {
        throw new Error('Merchant UPI ID is not configured on the server. Please set MERCHANT_UPI_ID in the environment variables (.env).');
      }
      const merchantName = (process.env.UPI_MERCHANT_NAME || 'NeoBattle').trim();
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${actualQrAmount.toFixed(2)}&cu=INR`;

      // Generate Base64 QR code image
      const qrCodeDataUrl = await QRCode.toDataURL(upiDeepLink, {
        margin: 1,
        width: 320,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          amount: new Decimal(cleanRequested),
          requestedAmount: new Decimal(cleanRequested),
          actualQrAmount: new Decimal(actualQrAmount),
          decimalOffset: offset,
          timerExpiresAt,
          expiresAt,
          description: `Automated UPI deposit of ₹${cleanRequested}`,
          metadata: {
            upiDeepLink,
            offset,
          },
        },
      });

      return {
        transactionId: transaction.id,
        requestedAmount: cleanRequested,
        actualQrAmount,
        upiDeepLink,
        qrCodeDataUrl,
        timerExpiresAt,
        expiresAt,
      };
    } finally {
      release();
    }
  }

  /**
   * Fetches the current status of a deposit order for frontend polling.
   */
  async getDepositStatus(userId: string, transactionId: string) {
    const tx = await prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { wallet: { select: { balance: true } } },
    });

    if (!tx) {
      throw new Error('Deposit order not found');
    }

    const now = new Date();
    let currentStatus = tx.status;

    // Check if 5-minute timer expired -> transition to AWAITING_LATE_MATCH
    if (tx.status === TransactionStatus.PENDING && tx.timerExpiresAt && now > tx.timerExpiresAt) {
      currentStatus = TransactionStatus.AWAITING_LATE_MATCH;
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.AWAITING_LATE_MATCH },
      });
    }

    // Check if 60-minute cutoff expired -> transition to EXPIRED & release slot
    if (
      (tx.status === TransactionStatus.PENDING || tx.status === TransactionStatus.AWAITING_LATE_MATCH) &&
      tx.expiresAt &&
      now > tx.expiresAt
    ) {
      currentStatus = TransactionStatus.EXPIRED;
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.EXPIRED, decimalOffset: null },
      });
    }

    return {
      transactionId: tx.id,
      status: currentStatus,
      isCompleted: currentStatus === TransactionStatus.COMPLETED,
      isExpired: currentStatus === TransactionStatus.EXPIRED,
      isLateMatch: currentStatus === TransactionStatus.AWAITING_LATE_MATCH,
      requestedAmount: tx.requestedAmount ? Number(tx.requestedAmount) : Number(tx.amount),
      actualQrAmount: tx.actualQrAmount ? Number(tx.actualQrAmount) : Number(tx.amount),
      timerExpiresAt: tx.timerExpiresAt,
      expiresAt: tx.expiresAt,
      balance: tx.wallet ? Number(tx.wallet.balance) : 0,
    };
  }

  /**
   * Processes incoming SMS bank credit notifications and matches against pending orders.
   */
  async processIncomingPayment(parsed: ParsedSmsPayment) {
    const { amount, utrNumber, rawMessage, sender, isCredit } = parsed;

    if (!isCredit || !amount || amount <= 0) {
      // Store non-credit or unparseable messages for admin review if needed
      await prisma.unmatchedPayment.create({
        data: {
          amount: new Decimal(amount || 0),
          rawMessage,
          sender,
          utrNumber,
          status: 'PENDING',
          notes: !isCredit ? 'Ignored: Message is not identified as a credit notification' : 'Could not extract valid credit amount from SMS',
        },
      });
      return { matched: false, reason: 'INVALID_OR_NON_CREDIT_SMS' };
    }

    // Clean up expired orders first
    await this.cleanupExpiredOrders();

    const normalizedAmount = Number(amount.toFixed(2));
    const now = new Date();

    // Look up Transaction where actualQrAmount === extracted amount AND status is PENDING or AWAITING_LATE_MATCH
    const candidates = await prisma.transaction.findMany({
      where: {
        type: TransactionType.DEPOSIT,
        actualQrAmount: new Decimal(normalizedAmount),
        status: { in: [TransactionStatus.PENDING, TransactionStatus.AWAITING_LATE_MATCH] },
        expiresAt: { gt: now },
      },
      include: {
        wallet: true,
        user: { select: { id: true, username: true, email: true } },
      },
    });

    // Case 1: Exactly one match found -> Instant Success & Auto Credit
    if (candidates.length === 1) {
      const match = candidates[0];
      const creditAmount = match.requestedAmount ? Number(match.requestedAmount) : Math.floor(normalizedAmount);

      await prisma.$transaction(async (txPrisma) => {
        // 1. Credit requestedAmount (round amount) to user's wallet
        await txPrisma.wallet.update({
          where: { id: match.walletId },
          data: { balance: { increment: creditAmount } },
        });

        // 2. Mark transaction as COMPLETED, release decimalOffset back to pool immediately
        await txPrisma.transaction.update({
          where: { id: match.id },
          data: {
            status: TransactionStatus.COMPLETED,
            decimalOffset: null, // Released back to pool!
            reference: utrNumber || match.reference || `UPI-${Date.now()}`,
            description: `UPI deposit verified (₹${creditAmount} credited via SMS match)`,
            metadata: {
              ...(typeof match.metadata === 'object' && match.metadata !== null ? match.metadata : {}),
              rawSms: rawMessage,
              sender,
              utrNumber,
              matchedActualAmount: normalizedAmount,
              creditedAmount: creditAmount,
              matchedAt: new Date().toISOString(),
            },
          },
        });
      });

      // Send in-app notification to the user
      notificationService
        .notifyDepositApproved(match.userId, creditAmount, utrNumber || undefined)
        .catch((err) => console.error('[Notification] Failed to notify user of deposit match:', err));

      return {
        matched: true,
        transactionId: match.id,
        userId: match.userId,
        username: match.user.username,
        creditedAmount: creditAmount,
        actualAmount: normalizedAmount,
        utrNumber,
      };
    }

    // Case 2: No match found -> Log to UnmatchedPayment
    if (candidates.length === 0) {
      const unmatched = await prisma.unmatchedPayment.create({
        data: {
          amount: new Decimal(normalizedAmount),
          rawMessage,
          sender,
          utrNumber,
          status: 'PENDING',
          notes: `No pending order found for actual amount ₹${normalizedAmount.toFixed(2)}`,
        },
      });

      return {
        matched: false,
        reason: 'NO_MATCH',
        unmatchedId: unmatched.id,
        amount: normalizedAmount,
      };
    }

    // Case 3: Multiple matches found (defensive fallback) -> Log to UnmatchedPayment
    const unmatched = await prisma.unmatchedPayment.create({
      data: {
        amount: new Decimal(normalizedAmount),
        rawMessage,
        sender,
        utrNumber,
        status: 'PENDING',
        notes: `Multiple pending matches (${candidates.length}) found for amount ₹${normalizedAmount.toFixed(2)}: Order IDs [${candidates.map((c) => c.id).join(', ')}]`,
      },
    });

    return {
      matched: false,
      reason: 'MULTIPLE_MATCHES',
      unmatchedId: unmatched.id,
      amount: normalizedAmount,
      candidatesCount: candidates.length,
    };
  }

  /**
   * Manually credits an unmatched payment to a user's wallet from the admin panel.
   */
  async resolveUnmatchedPayment(
    unmatchedId: string,
    targetUserId: string,
    adminUserId: string,
    notes?: string
  ) {
    const record = await prisma.unmatchedPayment.findUnique({
      where: { id: unmatchedId },
    });

    if (!record) {
      throw new Error('Unmatched payment record not found');
    }
    if (record.status === 'RESOLVED') {
      throw new Error('This payment has already been resolved');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { wallet: true },
    });

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    const creditAmount = Number(record.amount);

    await prisma.$transaction(async (txPrisma) => {
      let wallet = targetUser.wallet;
      if (!wallet) {
        wallet = await txPrisma.wallet.create({
          data: { userId: targetUser.id, balance: new Decimal(0) },
        });
      }

      // 1. Credit wallet
      await txPrisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: creditAmount } },
      });

      // 2. Create completed deposit transaction
      await txPrisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId: targetUser.id,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(creditAmount),
          requestedAmount: new Decimal(creditAmount),
          actualQrAmount: record.amount,
          description: `Manual credit for unmatched UPI payment (Admin: ${adminUserId})`,
          reference: record.utrNumber || `MANUAL-${Date.now()}`,
          metadata: {
            unmatchedPaymentId: record.id,
            rawSms: record.rawMessage,
            sender: record.sender,
            utrNumber: record.utrNumber,
            adminUserId,
            notes: notes || 'Manually credited by admin',
          },
        },
      });

      // 3. Mark unmatched payment as resolved
      await txPrisma.unmatchedPayment.update({
        where: { id: unmatchedId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedBy: adminUserId,
          resolvedUserId: targetUser.id,
          notes: notes || 'Manually credited by admin',
        },
      });
    });

    // Notify user
    notificationService
      .notifyDepositApproved(targetUser.id, creditAmount, record.utrNumber || undefined)
      .catch((err) => console.error('[Notification] Failed to notify user of manual credit:', err));

    return {
      success: true,
      amount: creditAmount,
      targetUsername: targetUser.username,
    };
  }
}

export const paymentMatchingService = new PaymentMatchingService();
