import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { Decimal } from '@prisma/client/runtime/library';

export async function listGiftCards(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const cards = await prisma.giftCard.findMany({
    where: { isActive: true },
    orderBy: { value: 'asc' },
  });
  res.json({ success: true, data: cards });
}

export async function listAllGiftCards(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const cards = await prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: cards });
}

export async function createGiftCard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, value, imageUrl, priceInCoins } = req.body;
  if (!name || value === undefined || priceInCoins === undefined) {
    res.status(400).json({ success: false, message: 'name, value, and priceInCoins are required' });
    return;
  }
  const card = await prisma.giftCard.create({
    data: { name, value: Number(value), imageUrl: imageUrl || null, priceInCoins: Number(priceInCoins) },
  });
  res.status(201).json({ success: true, data: card, message: 'Gift card created' });
}

export async function updateGiftCard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, value, imageUrl, priceInCoins, isActive } = req.body;
  const card = await prisma.giftCard.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(value !== undefined && { value: Number(value) }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(priceInCoins !== undefined && { priceInCoins: Number(priceInCoins) }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  res.json({ success: true, data: card, message: 'Gift card updated' });
}

export async function redeemGiftCard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { giftCardId } = req.body;
  const userId = req.user!.id;

  const giftCard = await prisma.giftCard.findUnique({ where: { id: giftCardId } });
  if (!giftCard) {
    res.status(404).json({ success: false, message: 'Gift card not found' });
    return;
  }
  if (!giftCard.isActive) {
    res.status(400).json({ success: false, message: 'This gift card is currently unavailable' });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < Number(giftCard.priceInCoins)) {
    res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    return;
  }

  const redemption = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: giftCard.priceInCoins } },
    });

    const created = await tx.giftCardRedemption.create({
      data: { userId, giftCardId, status: 'PENDING' },
    });

    await tx.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        status: 'PENDING',
        amount: new Decimal(Number(giftCard.priceInCoins)),
        description: `Gift card purchase: ${giftCard.name} (₹${Number(giftCard.value)}) — pending admin approval`,
        metadata: { redemptionId: created.id, method: 'GIFT_CARD' },
      },
    });

    return created;
  });

  res.json({
    success: true,
    data: redemption,
    message: 'Purchase complete! Your redeem code will appear in My Redemptions once the admin approves your request.',
  });
}

export async function listRedemptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const redemptions = await prisma.giftCardRedemption.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, email: true } },
      giftCard: { select: { name: true, value: true, priceInCoins: true } },
    },
  });
  res.json({ success: true, data: redemptions });
}

export async function listMyRedemptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const redemptions = await prisma.giftCardRedemption.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: {
      giftCard: { select: { id: true, name: true, value: true, priceInCoins: true, imageUrl: true } },
    },
  });

  res.json({
    success: true,
    data: redemptions.map((r) => ({
      ...r,
      amountPaid: Number(r.giftCard.priceInCoins),
      code: r.status === 'APPROVED' ? r.code : null,
    })),
  });
}

export async function updateRedemptionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, code } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    return;
  }
  if (status === 'APPROVED' && !code?.trim()) {
    res.status(400).json({ success: false, message: 'A redeem code is required to approve' });
    return;
  }

  const redemption = await prisma.giftCardRedemption.findUnique({
    where: { id },
    include: { giftCard: true },
  });
  if (!redemption) {
    res.status(404).json({ success: false, message: 'Redemption not found' });
    return;
  }
  if (redemption.status !== 'PENDING') {
    res.status(400).json({ success: false, message: 'Already reviewed' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.giftCardRedemption.update({
      where: { id },
      data: {
        status,
        ...(status === 'APPROVED' ? { code: code!.trim(), reviewedAt: new Date() } : {}),
        reviewedAt: new Date(),
      },
    });

    if (status === 'APPROVED') {
      await tx.transaction.updateMany({
        where: { metadata: { path: ['redemptionId'], equals: id }, type: 'WITHDRAWAL', status: 'PENDING' },
        data: { status: 'COMPLETED', description: `Gift card delivered: ${redemption.giftCard.name} (₹${Number(redemption.giftCard.value)})` },
      });
    }

    if (status === 'REJECTED') {
      const wallet = await tx.wallet.findUnique({ where: { userId: redemption.userId } });
      if (wallet) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: redemption.giftCard.priceInCoins } },
        });
        await tx.transaction.create({
          data: {
            userId: redemption.userId,
            walletId: wallet.id,
            type: 'REFUND',
            status: 'COMPLETED',
            amount: new Decimal(Number(redemption.giftCard.priceInCoins)),
            description: `Refund — gift card request rejected: ${redemption.giftCard.name}`,
            metadata: { redemptionId: id },
          },
        });
      }
      await tx.transaction.updateMany({
        where: { metadata: { path: ['redemptionId'], equals: id }, type: 'WITHDRAWAL', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }
  });

  res.json({
    success: true,
    message: status === 'APPROVED'
      ? 'Code assigned — user can now view it in My Redemptions'
      : 'Rejected — wallet refunded and stock restored',
  });
}
