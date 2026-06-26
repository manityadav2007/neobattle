import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

export async function listGiftCards(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const cards = await prisma.giftCard.findMany({
    where: { isActive: true, stockCount: { gt: 0 } },
    orderBy: { value: 'asc' },
  });
  res.json({ success: true, data: cards });
}

export async function listAllGiftCards(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const cards = await prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: cards });
}

export async function createGiftCard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, value, imageUrl, priceInCoins, stockCount } = req.body;
  if (!name || value === undefined || priceInCoins === undefined || stockCount === undefined) {
    res.status(400).json({ success: false, message: 'name, value, priceInCoins, and stockCount are required' });
    return;
  }
  const card = await prisma.giftCard.create({
    data: { name, value: Number(value), imageUrl: imageUrl || null, priceInCoins: Number(priceInCoins), stockCount: Number(stockCount) },
  });
  res.status(201).json({ success: true, data: card, message: 'Gift card created' });
}

export async function updateGiftCard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, value, imageUrl, priceInCoins, stockCount, isActive } = req.body;
  const card = await prisma.giftCard.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(value !== undefined && { value: Number(value) }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(priceInCoins !== undefined && { priceInCoins: Number(priceInCoins) }),
      ...(stockCount !== undefined && { stockCount: Number(stockCount) }),
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
  if (!giftCard.isActive || giftCard.stockCount < 1) {
    res.status(400).json({ success: false, message: 'Gift card is out of stock' });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < giftCard.priceInCoins) {
    res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    return;
  }

  const redemption = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: giftCard.priceInCoins } },
    });

    await tx.giftCard.update({
      where: { id: giftCardId },
      data: { stockCount: { decrement: 1 } },
    });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: giftCard.priceInCoins,
          description: `Redeemed gift card: ${giftCard.name} (${giftCard.value})`,
        },
      });

    return tx.giftCardRedemption.create({
      data: { userId, giftCardId, status: 'PENDING' },
    });
  });

  res.json({ success: true, data: redemption, message: 'Redemption request submitted for admin approval' });
}

export async function listRedemptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const redemptions = await prisma.giftCardRedemption.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, email: true } },
      giftCard: { select: { name: true, value: true } },
    },
  });
  res.json({ success: true, data: redemptions });
}

export async function updateRedemptionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    return;
  }

  const redemption = await prisma.giftCardRedemption.update({
    where: { id },
    data: { status },
  });
  res.json({ success: true, data: redemption, message: `Redemption ${status.toLowerCase()}` });
}
