import { Router } from 'express';
import * as gameController from '../controllers/game.controller';

const router = Router();

router.get('/profile/:uid', gameController.fetchGameProfile);
router.get('/lookup/:uid', gameController.lookupRegisteredUid);

export default router;
