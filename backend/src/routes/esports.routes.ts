import { Router } from 'express';
import * as esportsController from '../controllers/esports.controller';
import { authenticate } from '../middleware/authMiddleware';
import { ownerOnly } from '../middleware/adminCheck';

const router = Router();

router.get('/season', esportsController.getCurrentSeason);
router.post('/register', authenticate, esportsController.registerTeam);
router.get('/my-team', authenticate, esportsController.getMyTeam);
router.get('/leaderboard', esportsController.getSeasonLeaderboard);
router.get('/bans', esportsController.getBannedUids);

router.post('/bans', authenticate, ownerOnly, esportsController.addBan);
router.delete('/bans/:id', authenticate, ownerOnly, esportsController.removeBan);
router.patch('/season/config', authenticate, ownerOnly, esportsController.updateSeasonConfig);
router.post('/season/create', authenticate, ownerOnly, esportsController.createSeason);
router.post('/season/end', authenticate, ownerOnly, esportsController.endSeason);

export default router;
