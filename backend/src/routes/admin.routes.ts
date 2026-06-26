import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';

const router = Router();

router.use(authenticate, ownerOnly);

router.get('/stats', adminController.getDashboardStats);
router.get('/health', adminController.getSystemHealth);
router.get('/users', adminController.listAllUsers);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/promote-user/:id', adminController.promoteUser);
router.patch('/demote-user/:id', adminController.demoteUser);
router.patch('/users/:id/toggle-active', adminController.toggleUserActive);
router.post('/tournaments/:id/release-prizes', ownerOnly, adminController.releaseTournamentPrizes);
router.post('/tournaments/:id/refund', ownerOnly, adminController.refundTournament);

export default router;
