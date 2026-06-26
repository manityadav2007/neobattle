import { Router } from 'express';
import * as teamController from '../controllers/team.controller';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createTeamSchema, joinTeamSchema } from '../utils/validation.schemas';

const router = Router();

router.use(authenticate);

router.get('/', teamController.listTeams);
router.get('/my', teamController.getMyTeam);
router.get('/:id', teamController.getTeam);
router.post('/', validate(createTeamSchema), teamController.createTeam);
router.post('/join', validate(joinTeamSchema), teamController.joinTeam);
router.post('/leave', teamController.leaveTeam);
router.delete('/:id', teamController.disbandTeam);

export default router;
