import { Router } from 'express';
import * as resultController from '../controllers/result.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminCheck, adminOnly } from '../middleware/adminCheck';

const router = Router();

// Host submits / views own result submissions for a tournament
router.post('/tournament/:id/process-ai', authenticate, resultController.uploadResultVideoMiddleware, resultController.processAiVideo);
router.post('/tournament/:id/submit', authenticate, resultController.submitResult);
router.get('/mine', authenticate, resultController.listMyResultSubmissions);

// Admin
router.get('/pending', authenticate, adminCheck, resultController.listPendingResults);
router.patch('/:id/review', authenticate, adminOnly, resultController.reviewResult);

export default router;
