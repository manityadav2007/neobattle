import { Router } from 'express';
import * as redeemController from '../controllers/redeem.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';

const router = Router();

router.post('/request', authenticate, redeemController.createRedeemRequest);
router.get('/my-requests', authenticate, redeemController.listMyRequests);
router.get('/pending', authenticate, adminCheck, (req, res) => {
  req.query.status = 'PENDING';
  return redeemController.listRedeemRequests(req as any, res);
});
router.get('/all', authenticate, adminCheck, redeemController.listRedeemRequests);
router.patch('/:id/review', authenticate, adminCheck, redeemController.reviewRedeemRequest);

export default router;
