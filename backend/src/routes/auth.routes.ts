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
router.post('/oauth-exchange', authLimiter, authController.exchangeOAuthCode);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/ign', authenticate, authController.updateIgn);

const getFrontendUrl = (): string => {
  const origin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
  return origin.split(',')[0].trim().replace(/\/+$/, '');
};

router.get('/google', authLimiter, authController.googleAuth);
router.get(
  '/google/callback',
  authController.validateOAuthStateMiddleware,
  (req, res, next) => {
    if (req.query.error) {
      authController.handleGoogleOAuthError(req, res);
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

router.get('/discord', authLimiter, authController.discordAuth);
router.get('/discord/callback', authController.discordCallback);

export default router;
