import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

export async function uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('[Upload] avatar called for user:', req.user?.id);

    if (!req.file) {
      console.error('[Upload] No file in request');
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    console.log('[Upload] File received:', req.file.originalname, req.file.filename, req.file.size, 'bytes');

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const { prisma } = await import('../config/db');
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl },
    });

    console.log('[Upload] Avatar saved for user:', req.user!.id, 'URL:', avatarUrl);
    res.json({ success: true, data: { avatarUrl } });
  } catch (error) {
    console.error('[Upload] avatar error:', error);
    res.status(500).json({ success: false, message: 'Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
  }
}

export async function uploadTeamLogo(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const logoUrl = `/uploads/team-logos/${req.file.filename}`;
    res.json({ success: true, data: { logoUrl } });
  } catch (error) {
    console.error('[Upload] team logo error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
}

export async function uploadVerificationScreenshot(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const screenshotUrl = `/uploads/verification/${req.file.filename}`;
    res.json({ success: true, data: { screenshotUrl } });
  } catch (error) {
    console.error('[Upload] verification screenshot error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
}

export async function uploadGiftCardImage(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const imageUrl = `/uploads/verification/${req.file.filename}`;
    res.json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('[Upload] gift card image error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
}
