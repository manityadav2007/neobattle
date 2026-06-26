import { Router } from 'express';
import * as winnerProofController from '../controllers/winnerProof.controller';
import { authenticate } from '../middleware/authMiddleware';
import { hostOrSuper, superAdminOnly } from '../middleware/adminCheck';

const router = Router();

router.post('/submit', authenticate, hostOrSuper, winnerProofController.submitWinnerProof);
router.get('/pending', authenticate, superAdminOnly, winnerProofController.listPendingPayouts);
router.patch('/:id/review', authenticate, superAdminOnly, winnerProofController.reviewWinnerProof);

export default router;
