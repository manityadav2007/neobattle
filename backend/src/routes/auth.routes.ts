import { Router } from 'express';
import passport from 'passport';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authMiddleware';
import { authLimiter } from '../middleware/rateLimiter';
import { registerSchema, loginSchema, refreshTokenSchema } from '../utils/validation.schemas';

const router = Router();

router.get('/check-username', authController.checkUsername);
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/ign', authenticate, authController.updateIgn);

const getFrontendUrl = (): string => {
  const origin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
  return origin.split(',')[0].trim().replace(/\/+$/, '');
};

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  (req, res, next) => {
    if (req.query.error) {
      const errorMsg = encodeURIComponent(String(req.query.error));
      res.redirect(`${getFrontendUrl()}/login?error=${errorMsg}`);
      return;
    }
    next();
  },
  (req, res, next) => {
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${getFrontendUrl()}/login?error=google_auth_failed`,
    })(req, res, next);
  },
  authController.googleCallback
);


router.get('/discord', authController.discordAuth);
router.get('/discord/callback', authController.discordCallback);

export default router;
