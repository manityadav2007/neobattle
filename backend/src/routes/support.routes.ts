import { Router } from 'express';
import * as supportController from '../controllers/support.controller';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';

const router = Router();

router.post('/', supportController.createTicket);
router.get('/', authenticate, ownerOnly, supportController.listTickets);
router.patch('/:id/resolve', authenticate, ownerOnly, supportController.resolveTicket);
router.delete('/:id', authenticate, ownerOnly, supportController.deleteTicket);

export default router;
