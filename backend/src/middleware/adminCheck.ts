import { RequestHandler } from 'express';
import { UserRole } from '@prisma/client';

const SUPER_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MODERATOR];
const SUPER_ONLY: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

export const adminCheck: RequestHandler = (req, res, next): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (!SUPER_ROLES.includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return;
  }

  next();
};

export const adminOnly: RequestHandler = (req, res, next): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (!SUPER_ONLY.includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'Admin only' });
    return;
  }

  next();
};

export const superAdminOnly: RequestHandler = (req, res, next): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ success: false, message: 'Super admin only' });
    return;
  }

  next();
};

export const hostOrSuper: RequestHandler = (req, res, next): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.user.role !== UserRole.HOST && !SUPER_ROLES.includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'Host or admin access required' });
    return;
  }

  next();
};

const OWNER_EMAIL = 'ymanit330@gmail.com';

export const ownerOnly: RequestHandler = (req, res, next): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.user.role !== UserRole.SUPER_ADMIN && req.user.email !== OWNER_EMAIL) {
    res.status(403).json({ success: false, message: 'Owner access required' });
    return;
  }

  next();
};
