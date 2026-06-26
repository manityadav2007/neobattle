import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import teamRoutes from './team.routes';
import tournamentRoutes from './tournament.routes';
import walletRoutes from './wallet.routes';
import verificationRoutes from './verification.routes';
import adminRoutes from './admin.routes';
import gameRoutes from './game.routes';
import hostRoutes from './host.routes';
import winnerProofRoutes from './winnerProof.routes';
import depositRoutes from './deposit.routes';
import redeemRoutes from './redeem.routes';
import esportsRoutes from './esports.routes';
import paymentRoutes from './payment.routes';
import notificationRoutes from './notification.routes';
import storeRoutes from './store.routes';
import warningRoutes from './warning.routes';
import supportRoutes from './support.routes';
import uploadRoutes from './upload.routes';
import giftCardRoutes from './giftCard.routes';
import * as statsController from '../controllers/stats.controller';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'NEOBATTLE API is running', version: '1.0.0' });
});

router.get('/stats', statsController.getPlatformStats);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/wallet', walletRoutes);
router.use('/verification', verificationRoutes);
router.use('/admin', adminRoutes);
router.use('/game', gameRoutes);
router.use('/host', hostRoutes);
router.use('/winner-proof', winnerProofRoutes);
router.use('/deposits', depositRoutes);
router.use('/redeem', redeemRoutes);
router.use('/esports', esportsRoutes);
router.use('/payment', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/store', storeRoutes);
router.use('/warnings', warningRoutes);
router.use('/support', supportRoutes);
router.use('/upload', uploadRoutes);
router.use('/gift-cards', giftCardRoutes);

export default router;
