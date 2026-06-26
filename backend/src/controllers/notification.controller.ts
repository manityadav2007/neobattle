import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

export async function getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  res.json({
    success: true,
    data: notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user!.id;

  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) {
    res.status(404).json({ success: false, message: 'Notification not found' });
    return;
  }

  await prisma.notification.update({ where: { id }, data: { isRead: true } });
  res.json({ success: true });
}

export async function markAllRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ success: true });
}

export async function sendNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { userId, type, title, message, link } = req.body;

  if (!userId || !type || !title || !message) {
    res.status(400).json({ success: false, message: 'userId, type, title, message are required' });
    return;
  }

  const notification = await prisma.notification.create({
    data: { userId, type, title, message, link },
  });

  res.status(201).json({ success: true, data: notification });
}
