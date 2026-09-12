import { Router } from 'express';
import * as verificationController from '../controllers/verification.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.use(authenticate);

// Auto API-based linking (no screenshot, no admin review)
router.post('/link', verificationController.linkFreeFireId);
router.post('/refresh', verificationController.refreshPlayerInfo);
router.get('/my', verificationController.getMyLinkStatus);

// Admin read-only linked players list
router.get('/linked', adminCheck, verificationController.listLinkedPlayers);

export default router;