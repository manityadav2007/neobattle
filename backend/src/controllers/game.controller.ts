import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { gameProfileService } from '../services/gameProfile.service';

export async function fetchGameProfile(req: Request, res: Response): Promise<void> {
  const uid = String(req.params.uid);

  if (!uid || uid.length < 5) {
    res.status(400).json({ success: false, message: 'Invalid UID (minimum 5 characters)' });
    return;
  }

  const profile = await gameProfileService.fetchByUid(uid);
  if (!profile) {
    res.status(404).json({ success: false, message: 'Game profile not found for this UID' });
    return;
  }

  res.json({ success: true, data: profile });
}

export async function lookupRegisteredUid(req: Request, res: Response): Promise<void> {
  const uid = String(req.params.uid).trim();

  if (!uid || uid.length < 5) {
    res.status(400).json({ success: false, message: 'Invalid UID (minimum 5 characters)' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { freeFireId: uid },
    select: {
      username: true,
      displayName: true,
      ign: true,
      isVerified: true,
      gameLevel: true,
    },
  });

  if (!user) {
    res.status(404).json({ success: false, message: 'Player UID not registered on Neobattle' });
    return;
  }

  if (!user.isVerified) {
    res.status(403).json({ success: false, message: 'This UID exists but the player has not completed ID verification on Neobattle' });
    return;
  }

  res.json({
    success: true,
    data: {
      username: user.username,
      ign: user.ign || user.displayName || user.username,
      level: user.gameLevel,
    },
  });
}
