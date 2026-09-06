import { Router } from 'express';
import * as teamController from '../controllers/team.controller';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createTeamSchema, joinTeamSchema, requestJoinTeamSchema, reviewJoinRequestSchema } from '../utils/validation.schemas';

const router = Router();

router.use(authenticate);

router.get('/', teamController.listTeams);
router.get('/my', teamController.getMyTeam);
router.get('/:id', teamController.getTeam);
router.get('/:id/requests', teamController.getTeamJoinRequests);
router.post('/', validate(createTeamSchema), teamController.createTeam);
router.post('/join', validate(joinTeamSchema), teamController.joinTeam);
router.post('/request-join', validate(requestJoinTeamSchema), teamController.requestJoinTeam);
router.post('/requests/:requestId/review', validate(reviewJoinRequestSchema), teamController.reviewJoinRequest);
router.post('/leave', teamController.leaveTeam);
router.delete('/:id', teamController.disbandTeam);

export default router;
