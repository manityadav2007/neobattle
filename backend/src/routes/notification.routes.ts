import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';

const router = Router();

router.get('/', authenticate, notificationController.getNotifications);
router.patch('/:id/read', authenticate, notificationController.markAsRead);
router.patch('/read-all', authenticate, notificationController.markAllRead);
router.post('/send', authenticate, ownerOnly, notificationController.sendNotification);

export default router;
