import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

export async function sendWarning(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId, reason } = req.body;
  const adminId = req.user!.id;

  if (!userId || !reason) {
    res.status(400).json({ success: false, message: 'userId and reason required' });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const warning = await prisma.warning.create({
    data: { userId, issuedById: adminId, reason },
  });

  await prisma.notification.create({
    data: {
      userId,
      type: 'WARNING',
      title: 'Warning Issued',
      message: `Admin warning: ${reason}`,
      link: '/dashboard',
    },
  });

  res.status(201).json({ success: true, data: warning });
}

export async function getMyWarnings(req: AuthenticatedRequest, res: Response): Promise<void> {
  const warnings = await prisma.warning.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });

  const unreadCount = warnings.filter((w) => !w.isRead).length;

  res.json({ success: true, data: warnings, unreadCount });
}

export async function markWarningRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const warning = await prisma.warning.findFirst({ where: { id, userId: req.user!.id } });
  if (!warning) {
    res.status(404).json({ success: false, message: 'Warning not found' });
    return;
  }
  await prisma.warning.update({ where: { id }, data: { isRead: true } });
  res.json({ success: true });
}

export async function listWarnings(req: AuthenticatedRequest, res: Response): Promise<void> {
  const warnings = await prisma.warning.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, uid: true } },
      issuedBy: { select: { id: true, username: true } },
    },
    take: 100,
  });

  res.json({ success: true, data: warnings });
}
