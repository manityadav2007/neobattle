import { Router } from 'express';
import * as hostController from '../controllers/host.controller';
import { authenticate } from '../middleware/authMiddleware';
import { hostOrSuper } from '../middleware/adminCheck';
import { validate } from '../middleware/validate';
import { createTournamentSchema } from '../utils/validation.schemas';

const router = Router();

router.use(authenticate, hostOrSuper);

router.get('/tournaments', hostController.getMyTournaments);
router.post('/tournaments', validate(createTournamentSchema), hostController.createTournament);
router.patch('/tournaments/:id/status', hostController.updateTournamentStatus);
router.patch('/tournaments/:id/delay', hostController.delayTournament);
router.get('/tournaments/:id/entries', hostController.getTournamentEntries);
router.post('/tournaments/:id/complete', hostController.completeTournament);

export default router;
