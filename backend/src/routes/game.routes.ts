import { Router } from 'express';
import * as gameController from '../controllers/game.controller';

const router = Router();

router.get('/profile/:uid', gameController.fetchGameProfile);

export default router;
