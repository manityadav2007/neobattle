import { Router } from 'express';
import * as tournamentController from '../controllers/tournament.controller';
import { authenticate, optionalAuth } from '../middleware/authMiddleware';
import { adminCheck, hostOrSuper } from '../middleware/adminCheck';
import { validate } from '../middleware/validate';
import { tournamentLimiter } from '../middleware/rateLimiter';
import {
  createTournamentSchema,
  updateTournamentSchema,
  registerTournamentSchema,
  updateEntryScoreSchema,
  paginationSchema,
} from '../utils/validation.schemas';

const router = Router();

router.get('/', optionalAuth, validate(paginationSchema, 'query'), tournamentController.listTournaments);
router.get('/my', authenticate, tournamentController.getMyTournaments);
router.get('/:id', optionalAuth, tournamentController.getTournament);

router.post('/', authenticate, hostOrSuper, validate(createTournamentSchema), tournamentController.createTournament);
router.patch('/:id', authenticate, validate(updateTournamentSchema), tournamentController.updateTournament);
router.delete('/:id', authenticate, adminCheck, tournamentController.deleteTournament);

router.post(
  '/register',
  authenticate,
  tournamentLimiter,
  validate(registerTournamentSchema),
  tournamentController.registerForTournament
);

router.patch(
  '/entries/:entryId/score',
  authenticate,
  adminCheck,
  validate(updateEntryScoreSchema),
  tournamentController.updateEntryScore
);

export default router;
