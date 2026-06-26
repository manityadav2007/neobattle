import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { VerificationStatus } from '@prisma/client';

export async function submitVerification(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { freeFireId, screenshotUrl } = req.body;
  const userId = req.user!.id;

  const existingFreeFire = await prisma.user.findUnique({ where: { freeFireId } });
  if (existingFreeFire && existingFreeFire.id !== userId) {
    res.status(409).json({ success: false, message: 'Free Fire ID already linked to another account' });
    return;
  }

  const pending = await prisma.verificationRequest.findFirst({
    where: { userId, status: VerificationStatus.PENDING },
  });

  if (pending) {
    res.status(409).json({ success: false, message: 'You already have a pending verification request' });
    return;
  }

  const request = await prisma.verificationRequest.create({
    data: { userId, freeFireId, screenshotUrl, status: VerificationStatus.PENDING },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { freeFireId, verificationScreenshotUrl: screenshotUrl, isVerified: false },
  });

  res.status(201).json({
    success: true,
    data: request,
    message: 'Verification submitted for review',
  });
}

export async function getMyVerification(req: AuthenticatedRequest, res: Response): Promise<void> {
  const requests = await prisma.verificationRequest.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  res.json({ success: true, data: requests });
}

export async function listPendingVerifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where: { status: VerificationStatus.PENDING },
      include: {
        user: { select: { id: true, username: true, email: true, freeFireId: true, verificationScreenshotUrl: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.verificationRequest.count({ where: { status: VerificationStatus.PENDING } }),
  ]);

  res.json({
    success: true,
    data: requests,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function reviewVerification(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { status, rejectionReason } = req.body;
  const requestId = req.params.id;

  if (status === 'REJECTED' && !rejectionReason) {
    res.status(400).json({ success: false, message: 'Rejection reason is required' });
    return;
  }

  const verification = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
  });

  if (!verification) {
    res.status(404).json({ success: false, message: 'Verification request not found' });
    return;
  }

  if (verification.status !== VerificationStatus.PENDING) {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const req_updated = await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: status as VerificationStatus,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    if (status === 'APPROVED') {
      await tx.user.update({
        where: { id: verification.userId },
        data: { isVerified: true },
      });
    }

    return req_updated;
  });

  res.json({ success: true, data: updated });
}
