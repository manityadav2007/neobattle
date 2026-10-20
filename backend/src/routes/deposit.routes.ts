import { Router } from 'express';
import * as depositController from '../controllers/deposit.controller';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

// 1. Static routes must always be declared BEFORE parameterized routes
router.get('/active', authenticate, paymentController.getActiveDepositOrder);
router.get('/pending', authenticate, adminCheck, depositController.listDepositRequests);
router.post('/request', authenticate, depositController.createDepositRequest);

// 2. Parameterized routes with guard against reserved static paths
router.get('/:id/resume', authenticate, paymentController.getResumableDepositOrder);
router.get('/:id', authenticate, (req, res, next) => {
  // Prevent any known static sub-path from being treated as an ID
  const reservedPaths = ['pending', 'active', 'request'];
  const idStr = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (idStr && reservedPaths.includes(idStr.toLowerCase())) {
    return next();
  }
  return paymentController.getResumableDepositOrder(req as any, res);
});
router.patch('/:id/review', authenticate, adminCheck, depositController.reviewDepositRequest);

export default router;
