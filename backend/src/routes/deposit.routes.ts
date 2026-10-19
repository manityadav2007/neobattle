import { Router } from 'express';
import * as depositController from '../controllers/deposit.controller';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.get('/active', authenticate, paymentController.getActiveDepositOrder);
router.get('/:id/resume', authenticate, paymentController.getResumableDepositOrder);
router.get('/:id', authenticate, paymentController.getResumableDepositOrder);
router.post('/request', authenticate, depositController.createDepositRequest);
router.get('/pending', authenticate, adminCheck, depositController.listDepositRequests);
router.patch('/:id/review', authenticate, adminCheck, depositController.reviewDepositRequest);

export default router;
