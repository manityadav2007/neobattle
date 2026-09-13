import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

// Dynamic QR Automated Deposit Flow
router.post('/deposit/initiate', authenticate, paymentController.initiateDynamicDeposit);
router.get('/deposit/status/:transactionId', authenticate, paymentController.getDepositOrderStatus);

// Admin Unmatched & Auto Deposits Management
router.get('/unmatched', authenticate, adminCheck, paymentController.listUnmatchedPayments);
router.post('/unmatched/:id/credit', authenticate, adminCheck, paymentController.creditUnmatchedPayment);
router.get('/auto-deposits', authenticate, adminCheck, paymentController.listAutoDeposits);

// Legacy Manual UPI Payments (preserved for existing tournament entry or pending review)
router.post('/upi/create', authenticate, paymentController.createUpiPayment);
router.get('/upi/my', authenticate, paymentController.getMyUpiPayments);
router.get('/pending', authenticate, adminCheck, paymentController.listPendingUpiPayments);
router.get('/all', authenticate, adminCheck, paymentController.listAllUpiPayments);
router.patch('/:id/approve', authenticate, adminCheck, paymentController.approveUpiPayment);
router.patch('/:id/reject', authenticate, adminCheck, paymentController.rejectUpiPayment);

export default router;
