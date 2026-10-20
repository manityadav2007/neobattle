import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionStatus, TransactionType, UserRole } from '@prisma/client';
import { privateStorageService } from '../services/privateStorage.service';
import { notificationService } from '../services/notification.service';

/**
 * Submits a new "I already paid" deposit claim for an expired deposit order.
 * Strictly verifies ownership, expiry, UTR uniqueness, magic bytes, and rate limits.
 */
export async function submitDepositClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { depositTransactionId, utrNumber, notes } = req.body;

  // 1. Parameter presence checks
  if (!depositTransactionId) {
    res.status(400).json({ success: false, message: 'depositTransactionId is required' });
    return;
  }

  if (!utrNumber) {
    res.status(400).json({ success: false, message: 'UTR / reference number is required' });
    return;
  }

  // 2. 12-digit UTR validation
  const cleanUtr = String(utrNumber).trim();
  if (!/^\d{12}$/.test(cleanUtr)) {
    res.status(400).json({
      success: false,
      message: 'UTR / reference number must be exactly 12 digits (found on your payment receipt)',
    });
    return;
  }

  // 3. User Rate Limit: max 3 claims per 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const claimsLast24h = await prisma.depositRequest.count({
    where: {
      userId,
      createdAt: { gte: twentyFourHoursAgo },
    },
  });

  if (claimsLast24h >= 3) {
    res.status(429).json({
      success: false,
      message: 'Daily claim limit reached. You can submit up to 3 deposit claims per 24 hours. Please contact support if you need further help.',
    });
    return;
  }

  // 4. Repeated rejection block check (>= 3 rejected claims blocks submission)
  const rejectedClaimsCount = await prisma.depositRequest.count({
    where: {
      userId,
      status: 'REJECTED',
    },
  });

  if (rejectedClaimsCount >= 3) {
    res.status(403).json({
      success: false,
      message: 'Your account is restricted from submitting deposit claims due to multiple rejected claims. Please contact support for assistance.',
    });
    return;
  }

  // 5. Verify the deposit order belongs to the user and is really expired
  const depositTx = await prisma.transaction.findUnique({
    where: { id: depositTransactionId },
  });

  if (!depositTx || depositTx.userId !== userId) {
    res.status(404).json({ success: false, message: 'Deposit request not found for your account' });
    return;
  }

  if (depositTx.type !== TransactionType.DEPOSIT) {
    res.status(400).json({ success: false, message: 'Invalid transaction type' });
    return;
  }

  if (depositTx.status === TransactionStatus.COMPLETED) {
    res.status(400).json({ success: false, message: 'This deposit has already been verified and credited to your wallet' });
    return;
  }

  // Check that the request REALLY expired
  const now = new Date();
  const isTimerExpired = depositTx.timerExpiresAt ? depositTx.timerExpiresAt.getTime() <= now.getTime() : false;
  const isHardExpired = depositTx.expiresAt ? depositTx.expiresAt.getTime() <= now.getTime() : false;
  const isStatusExpired = depositTx.status === TransactionStatus.AWAITING_LATE_MATCH || depositTx.status === TransactionStatus.EXPIRED;

  if (!isTimerExpired && !isHardExpired && !isStatusExpired) {
    res.status(400).json({
      success: false,
      message: 'This deposit request has not expired yet. Please complete payment using the active QR code or wait until the timer expires.',
    });
    return;
  }

  // 6. One claim per deposit request
  const existingClaimForTx = await prisma.depositRequest.findFirst({
    where: { depositTransactionId },
  });

  if (existingClaimForTx) {
    res.status(400).json({
      success: false,
      message: `A claim has already been submitted for this deposit request (Status: ${existingClaimForTx.status}).`,
    });
    return;
  }

  // 7. UTR uniqueness checks
  // 7a. Across existing claims
  const existingClaimWithUtr = await prisma.depositRequest.findFirst({
    where: { utrNumber: cleanUtr },
  });

  if (existingClaimWithUtr) {
    res.status(400).json({
      success: false,
      message: 'This UTR / reference number has already been submitted in another claim.',
    });
    return;
  }

  // 7b. Across already credited auto-deposits (Transaction reference or metadata)
  const alreadyCreditedTx = await prisma.transaction.findFirst({
    where: {
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.COMPLETED,
      OR: [
        { reference: cleanUtr },
        { metadata: { path: ['utrNumber'], equals: cleanUtr } },
      ],
    },
  });

  if (alreadyCreditedTx) {
    res.status(400).json({
      success: false,
      message: 'This UTR / reference number has already been matched and credited to a wallet.',
    });
    return;
  }

  // 7c. Across resolved unmatched payments
  const resolvedUnmatched = await prisma.unmatchedPayment.findFirst({
    where: {
      utrNumber: cleanUtr,
      status: 'RESOLVED',
    },
  });

  if (resolvedUnmatched) {
    res.status(400).json({
      success: false,
      message: 'This UTR / reference number has already been resolved and credited by an administrator.',
    });
    return;
  }

  // 8. File validation (magic bytes, size <= 5MB) & EXIF stripping
  if (!req.file || !req.file.buffer) {
    res.status(400).json({ success: false, message: 'Payment screenshot is required (JPG, PNG, or WebP, max 5MB)' });
    return;
  }

  if (req.file.size > 5 * 1024 * 1024) {
    res.status(400).json({ success: false, message: 'Screenshot file size cannot exceed 5MB' });
    return;
  }

  let sanitizedFile: { buffer: Buffer; format: 'jpeg' | 'png' | 'webp' };
  try {
    sanitizedFile = await privateStorageService.stripExifAndSanitize(req.file.buffer);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Invalid screenshot file format' });
    return;
  }

  // 9. Server-side amount retrieval (never trust user input!)
  const exactAmount = depositTx.actualQrAmount
    ? Number(depositTx.actualQrAmount)
    : Number(depositTx.amount);

  const baseAmount = depositTx.requestedAmount
    ? Number(depositTx.requestedAmount)
    : Math.floor(exactAmount);

  // 10. Upload to PRIVATE storage (authenticated Cloudinary or Supabase Storage private bucket)
  const tempClaimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let storedScreenshot;
  try {
    storedScreenshot = await privateStorageService.uploadPrivateScreenshot(
      sanitizedFile.buffer,
      tempClaimId,
      sanitizedFile.format
    );
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload screenshot to secure storage: ' + (err.message || 'Storage error'),
    });
    return;
  }

  // 11. Create DepositRequest in Database
  const claim = await prisma.depositRequest.create({
    data: {
      userId,
      amount: new Decimal(baseAmount),
      exactAmount: new Decimal(exactAmount),
      baseAmount: new Decimal(baseAmount),
      utrNumber: cleanUtr,
      notes: notes ? String(notes).trim().slice(0, 500) : null,
      depositTransactionId,
      screenshotUrl: '[SECURE_STORAGE]', // Storage path NEVER exposed in public responses
      screenshotStorageKey: storedScreenshot.storageKey,
      status: 'PENDING',
    },
  });

  // Safe response without internal storage details
  res.status(201).json({
    success: true,
    message: 'Deposit claim submitted successfully. Status: Under review.',
    data: {
      id: claim.id,
      amount: Number(claim.amount),
      exactAmount: claim.exactAmount ? Number(claim.exactAmount) : Number(claim.amount),
      utrNumber: claim.utrNumber,
      status: claim.status,
      createdAt: claim.createdAt,
    },
  });
}

/**
 * Lists deposit claims for the logged-in user ("My deposit claims").
 */
export async function listMyDepositClaims(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  const claims = await prisma.depositRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      exactAmount: true,
      baseAmount: true,
      utrNumber: true,
      status: true,
      rejectionReason: true,
      notes: true,
      createdAt: true,
      reviewedAt: true,
      depositTransactionId: true,
    },
  });

  res.json({
    success: true,
    data: claims.map((c) => ({
      ...c,
      amount: Number(c.amount),
      exactAmount: c.exactAmount ? Number(c.exactAmount) : Number(c.amount),
      baseAmount: c.baseAmount ? Number(c.baseAmount) : Number(c.amount),
    })),
  });
}

/**
 * Admin Queue: Lists all pending deposit requests with signed screenshot URLs and auto-suggested SMS matches.
 * RLS: Admin and Super Admin only (Moderator is forbidden).
 */
export async function listDepositRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Enforce Admin and Super Admin only (moderators cannot approve money)
  if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPER_ADMIN)) {
    res.status(403).json({ success: false, message: 'Admin or Super Admin access required' });
    return;
  }

  const requests = await prisma.depositRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      user: { select: { id: true, username: true, email: true } },
      depositTransaction: {
        select: {
          id: true,
          amount: true,
          requestedAmount: true,
          actualQrAmount: true,
          createdAt: true,
          expiresAt: true,
          timerExpiresAt: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch pending unmatched payments for auto-suggestions
  const pendingUnmatched = await prisma.unmatchedPayment.findMany({
    where: { status: 'PENDING' },
    orderBy: { receivedAt: 'desc' },
    take: 100,
  });

  const enrichedRequests = await Promise.all(
    requests.map(async (r) => {
      // Short-lived signed URL for admin viewing (15 min)
      const signedUrl = await privateStorageService.getAdminSignedUrl(
        r.screenshotStorageKey || r.screenshotUrl
      );

      const exactAmt = r.exactAmount ? Number(r.exactAmount) : Number(r.amount);
      const baseAmt = r.baseAmount ? Number(r.baseAmount) : Number(r.amount);

      // Auto-suggest matching bank SMS from Unmatched (SMS) list:
      // Match if exact amount matches OR UTR matches
      const suggested = pendingUnmatched.find((u) => {
        const uAmt = Number(u.amount);
        const amountMatch = Math.abs(uAmt - exactAmt) < 0.005;
        const utrMatch = r.utrNumber && u.utrNumber && r.utrNumber.trim() === u.utrNumber.trim();
        return utrMatch || amountMatch;
      });

      const reqCreatedAt = r.depositTransaction?.createdAt || r.createdAt;
      const reqExpiredAt =
        r.depositTransaction?.timerExpiresAt || r.depositTransaction?.expiresAt || null;

      const timeSinceExpiryMs = reqExpiredAt ? Math.max(0, Date.now() - new Date(reqExpiredAt).getTime()) : 0;

      return {
        id: r.id,
        userId: r.userId,
        user: r.user,
        amount: baseAmt,
        exactAmount: exactAmt,
        baseAmount: baseAmt,
        utrNumber: r.utrNumber,
        notes: r.notes,
        screenshotUrl: signedUrl,
        status: r.status,
        createdAt: r.createdAt,
        requestCreatedAt: reqCreatedAt,
        requestExpiredAt: reqExpiredAt,
        timeSinceExpiryMs,
        suggestedMatch: suggested
          ? {
              id: suggested.id,
              amount: Number(suggested.amount),
              sender: suggested.sender,
              utrNumber: suggested.utrNumber,
              receivedAt: suggested.receivedAt,
              rawMessage: suggested.rawMessage,
            }
          : null,
      };
    })
  );

  res.json({
    success: true,
    data: enrichedRequests,
  });
}

/**
 * Admin Review: Approves or rejects a deposit claim.
 * Approving credits the user wallet exactly once (base amount) and writes a transaction and audit log.
 * Rejecting requires a reason. Both notify the user.
 * RLS: Admin and Super Admin only (Moderator is forbidden).
 */
export async function reviewDepositRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Enforce Admin and Super Admin only (moderators cannot approve money)
  if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPER_ADMIN)) {
    res.status(403).json({ success: false, message: 'Admin or Super Admin access required' });
    return;
  }

  const { status, rejectionReason, unmatchedPaymentId } = req.body;
  const requestId = req.params.id;
  const adminUserId = req.user.id;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    return;
  }

  if (status === 'REJECTED' && (!rejectionReason || !String(rejectionReason).trim())) {
    res.status(400).json({ success: false, message: 'Rejection reason is required' });
    return;
  }

  let approvedClaim: any = null;
  let rejectedClaim: any = null;

  try {
    await prisma.$transaction(async (txPrisma) => {
      // 1. Fetch claim with lock
      const claim = await txPrisma.depositRequest.findUnique({
        where: { id: requestId },
        include: { depositTransaction: true },
      });

      if (!claim) {
        throw new Error('Deposit request not found');
      }

      if (claim.status !== 'PENDING') {
        throw new Error(`Deposit claim is already ${claim.status.toLowerCase()}`);
      }

      // 2. APPROVE FLOW
      if (status === 'APPROVED') {
        // Guard: check that the linked deposit transaction has NOT already been completed/credited
        if (claim.depositTransactionId) {
          const linkedTx = await txPrisma.transaction.findUnique({
            where: { id: claim.depositTransactionId },
          });

          if (linkedTx && linkedTx.status === TransactionStatus.COMPLETED) {
            throw new Error('Associated deposit request was already completed and credited');
          }
        }

        const creditAmount = claim.baseAmount ? Number(claim.baseAmount) : Number(claim.amount);
        const creditDecimal = new Decimal(creditAmount);

        // Fetch or create user's wallet
        const wallet = await txPrisma.wallet.findUnique({ where: { userId: claim.userId } });
        if (!wallet) {
          throw new Error('User wallet not found');
        }

        // Single Credit: increment wallet balance exactly once
        await txPrisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: creditDecimal } },
        });

        // Update or create Transaction record
        if (claim.depositTransactionId) {
          await txPrisma.transaction.update({
            where: { id: claim.depositTransactionId },
            data: {
              status: TransactionStatus.COMPLETED,
              decimalOffset: null, // Release decimal offset back to pool
              reference: claim.utrNumber || `MANUAL-${Date.now()}`,
              description: `Deposit approved via manual screenshot verification (Ref: ${claim.utrNumber || claim.id})`,
              metadata: {
                ...(typeof claim.depositTransaction?.metadata === 'object' && claim.depositTransaction?.metadata !== null
                  ? (claim.depositTransaction.metadata as object)
                  : {}),
                depositRequestId: claim.id,
                approvedBy: adminUserId,
                approvedAt: new Date().toISOString(),
                utrNumber: claim.utrNumber,
                unmatchedPaymentId: unmatchedPaymentId || undefined,
              },
            },
          });
        } else {
          await txPrisma.transaction.create({
            data: {
              walletId: wallet.id,
              userId: claim.userId,
              type: TransactionType.DEPOSIT,
              status: TransactionStatus.COMPLETED,
              amount: creditDecimal,
              reference: claim.utrNumber || `MANUAL-${Date.now()}`,
              description: `Deposit approved via manual screenshot verification (Ref: ${claim.utrNumber || claim.id})`,
              metadata: {
                depositRequestId: claim.id,
                approvedBy: adminUserId,
                approvedAt: new Date().toISOString(),
                utrNumber: claim.utrNumber,
              },
            },
          });
        }

        // If an unmatched payment was linked, mark it as RESOLVED
        if (unmatchedPaymentId) {
          await txPrisma.unmatchedPayment.update({
            where: { id: unmatchedPaymentId },
            data: {
              status: 'RESOLVED',
              resolvedAt: new Date(),
              resolvedBy: adminUserId,
              resolvedUserId: claim.userId,
              notes: `Linked to deposit claim ${claim.id} by admin ${req.user!.username || adminUserId}`,
            },
          });
        }

        // Update DepositRequest status
        await txPrisma.depositRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            reviewedBy: adminUserId,
            reviewedAt: new Date(),
          },
        });

        // Audit Log entry with admin id and timestamp
        await txPrisma.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'DEPOSIT_CLAIM_APPROVED',
            targetId: claim.id,
            details: {
              claimId: claim.id,
              userId: claim.userId,
              creditAmount,
              utrNumber: claim.utrNumber,
              unmatchedPaymentId: unmatchedPaymentId || null,
              approvedAt: new Date().toISOString(),
            },
          },
        });

        approvedClaim = {
          userId: claim.userId,
          amount: creditAmount,
          utrNumber: claim.utrNumber,
        };
      }

      // 3. REJECT FLOW
      if (status === 'REJECTED') {
        const reason = String(rejectionReason).trim();

        await txPrisma.depositRequest.update({
          where: { id: requestId },
          data: {
            status: 'REJECTED',
            rejectionReason: reason,
            reviewedBy: adminUserId,
            reviewedAt: new Date(),
          },
        });

        // Audit Log entry with admin id, reason, and timestamp
        await txPrisma.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'DEPOSIT_CLAIM_REJECTED',
            targetId: claim.id,
            details: {
              claimId: claim.id,
              userId: claim.userId,
              rejectionReason: reason,
              rejectedAt: new Date().toISOString(),
            },
          },
        });

        rejectedClaim = {
          userId: claim.userId,
          amount: Number(claim.amount),
          reason,
        };
      }
    });

    // Notify user after successful transaction
    if (approvedClaim) {
      notificationService
        .notifyDepositApproved(approvedClaim.userId, approvedClaim.amount, approvedClaim.utrNumber || undefined)
        .catch((err) => console.error('[Notification] Failed to send approval notification:', err));
    } else if (rejectedClaim) {
      notificationService
        .notifyDepositRejected(rejectedClaim.userId, rejectedClaim.amount, rejectedClaim.reason)
        .catch((err) => console.error('[Notification] Failed to send rejection notification:', err));
    }

    res.json({ success: true, message: `Deposit ${status.toLowerCase()}` });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Failed to review deposit' });
  }
}

/**
 * Endpoint to securely view fallback screenshots (for testing / dev environment).
 */
export async function viewFallbackScreenshot(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { key, exp, sig } = req.query;

  if (!key || !exp || !sig) {
    res.status(400).send('Invalid signature parameters');
    return;
  }

  const result = privateStorageService.getFallbackImage(String(key), Number(exp), String(sig));
  if (!result) {
    res.status(403).send('Screenshot expired or invalid signature');
    return;
  }

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.send(result.buffer);
}

/**
 * Legacy deposit request creation (maintained for backward compatibility).
 */
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
