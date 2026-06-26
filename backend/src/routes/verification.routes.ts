import { Router } from 'express';
import * as verificationController from '../controllers/verification.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck } from '../middleware/adminCheck';
import { validate } from '../middleware/validate';
import { verificationSubmitSchema, verificationReviewSchema } from '../utils/validation.schemas';

const router = Router();

router.use(authenticate);

router.post('/submit', validate(verificationSubmitSchema), verificationController.submitVerification);
router.get('/my', verificationController.getMyVerification);
router.get('/pending', adminCheck, verificationController.listPendingVerifications);
router.patch('/:id/review', adminCheck, validate(verificationReviewSchema), verificationController.reviewVerification);

export default router;
