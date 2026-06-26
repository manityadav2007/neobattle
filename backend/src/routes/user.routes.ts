import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate, optionalAuth } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { updateProfileSchema } from '../utils/validation.schemas';

const router = Router();

router.get('/leaderboard', optionalAuth, userController.getLeaderboard);
router.get('/me/stats', authenticate, userController.getUserStats);
router.get('/search', authenticate, userController.searchUsers);
router.patch('/profile', authenticate, validate(updateProfileSchema), userController.updateProfile);
router.post('/change-password', authenticate, userController.changePassword);
router.post('/delete-account', authenticate, userController.deleteAccount);
router.get('/:id/stats', authenticate, userController.getUserStats);
router.get('/:id', authenticate, userController.getProfile);

export default router;
