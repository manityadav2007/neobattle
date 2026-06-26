import { Router } from 'express';
import * as giftCardController from '../controllers/giftCard.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.get('/list', giftCardController.listGiftCards);
router.get('/all', authenticate, adminCheck, giftCardController.listAllGiftCards);
router.post('/create', authenticate, adminCheck, giftCardController.createGiftCard);
router.patch('/:id', authenticate, adminCheck, giftCardController.updateGiftCard);
router.post('/redeem', authenticate, giftCardController.redeemGiftCard);
router.get('/redemptions', authenticate, adminCheck, giftCardController.listRedemptions);
router.patch('/redemptions/:id', authenticate, adminCheck, giftCardController.updateRedemptionStatus);

export default router;
