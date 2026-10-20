import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck, adminOnly, ownerOnly } from '../middleware/adminCheck';

const router = Router();

// AI Counter Playground - test video feed without tournament constraints
router.post(
  '/test-ai-feed',
  authenticate,
  adminCheck,
  adminController.uploadTestVideoMiddleware,
  adminController.testAiFeed
);

// General Admin Routes (accessible by SUPER_ADMIN, owner, and ADMIN)
router.use(authenticate, adminOnly);

router.get('/stats', adminController.getDashboardStats);
router.get('/health', adminController.getSystemHealth);
router.get('/users', adminController.listAllUsers);
router.patch('/users/:id/toggle-active', adminController.toggleUserActive);
router.patch('/users/:id/verify-game-level', adminController.verifyUserGameLevel);
router.get('/revenue', adminController.getRevenueStats);
router.get('/transactions', adminController.getTransactions);
router.get('/withdrawals', adminController.listWithdrawals);
router.patch('/withdrawals/:id/review', adminController.reviewWithdrawal);
router.post('/tournaments/:id/distribute-prizes', adminController.distributeTournamentPrizes);

// Owner / Super Admin only critical actions
router.patch('/users/:id/role', ownerOnly, adminController.updateUserRole);
router.patch('/promote-user/:id', ownerOnly, adminController.promoteUser);
router.patch('/demote-user/:id', ownerOnly, adminController.demoteUser);
router.post('/tournaments/:id/release-prizes', ownerOnly, adminController.releaseTournamentPrizes);
router.post('/tournaments/:id/refund', ownerOnly, adminController.refundTournament);
router.post('/award-prize', ownerOnly, adminController.awardPrize);
router.post('/wallet/adjust', ownerOnly, adminController.adjustWallet);
router.post('/wallet/adjust-by-uid', ownerOnly, adminController.adjustWalletByUid);
router.post('/add-balance', ownerOnly, adminController.adjustWallet);

export default router;
