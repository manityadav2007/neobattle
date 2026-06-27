import { Request, RequestHandler } from 'express';
import passport from '../config/passport';
 
export type AuthUser = Express.User;
export interface AuthenticatedRequest extends Request {
  params: Record<string, string>;
  user?: AuthUser;
  body: any;
  query: any;
 file?: any;
files?: any[];
headers: any;
}

export const authenticate: RequestHandler = (req, res, next): void => {
  passport.authenticate('jwt', { session: false }, (err: Error | null, user: AuthUser | false) => {
    if (err) {
      res.status(500).json({ success: false, message: 'Authentication error' });
      return;
    }
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    req.user = user;
    next();
  })(req, res, next);
};

export const optionalAuth: RequestHandler = (req, res, next): void => {
  passport.authenticate('jwt', { session: false }, (_err: Error | null, user: AuthUser | false) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};
