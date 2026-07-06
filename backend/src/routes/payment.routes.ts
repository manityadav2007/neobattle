import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.post('/upi/create', authenticate, paymentController.createUpiPayment);
router.get('/upi/my', authenticate, paymentController.getMyUpiPayments);
router.get('/pending', authenticate, adminCheck, paymentController.listPendingUpiPayments);
router.get('/all', authenticate, adminCheck, paymentController.listAllUpiPayments);
router.patch('/:id/approve', authenticate, adminCheck, paymentController.approveUpiPayment);
router.patch('/:id/reject', authenticate, adminCheck, paymentController.rejectUpiPayment);

export default router;
