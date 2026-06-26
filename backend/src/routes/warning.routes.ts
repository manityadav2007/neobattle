import { Router } from 'express';
import * as warningController from '../controllers/warning.controller';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';

const router = Router();

router.get('/my', authenticate, warningController.getMyWarnings);
router.patch('/:id/read', authenticate, warningController.markWarningRead);
router.post('/', authenticate, ownerOnly, warningController.sendWarning);
router.get('/', authenticate, ownerOnly, warningController.listWarnings);

export default router;
