import { Router } from 'express';
import * as redeemController from '../controllers/redeem.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.post('/request', authenticate, redeemController.createRedeemRequest);
router.get('/pending', authenticate, adminCheck, redeemController.listRedeemRequests);
router.patch('/:id/review', authenticate, adminCheck, redeemController.reviewRedeemRequest);

export default router;
