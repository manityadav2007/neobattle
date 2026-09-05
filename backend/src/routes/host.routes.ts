import { Router } from 'express';
import * as hostController from '../controllers/host.controller';
import * as tournamentController from '../controllers/tournament.controller';
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
router.patch('/tournaments/:id/room', hostController.updateRoomDetails);
router.get('/tournaments/:id/entries', hostController.getTournamentEntries);
router.post('/tournaments/:id/complete', hostController.completeTournament);
router.delete('/tournaments/:id', tournamentController.deleteTournament);

export default router;
