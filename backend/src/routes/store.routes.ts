import { Router } from 'express';
import * as storeController from '../controllers/store.controller';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';

const router = Router();

router.get('/items', storeController.listItems);
router.post('/redeem', authenticate, storeController.redeemItem);
router.post('/withdraw', authenticate, storeController.withdrawToCode);

router.post('/codes', authenticate, ownerOnly, storeController.addCode);
router.get('/codes', authenticate, ownerOnly, storeController.listAllCodes);

export default router;
