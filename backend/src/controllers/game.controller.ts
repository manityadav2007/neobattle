import { Request, Response } from 'express';
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
