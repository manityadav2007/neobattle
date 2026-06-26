import { Router } from 'express';
import * as depositController from '../controllers/deposit.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.post('/request', authenticate, depositController.createDepositRequest);
router.get('/pending', authenticate, adminCheck, depositController.listDepositRequests);
router.patch('/:id/review', authenticate, adminCheck, depositController.reviewDepositRequest);

export default router;
