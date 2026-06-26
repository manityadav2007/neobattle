import { Router } from 'express';
import * as uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/authMiddleware';
import { uploadAvatar, uploadTeamLogo, uploadVerificationScreenshot, uploadGiftCardImage } from '../middleware/upload';

const router = Router();

router.post('/avatar', authenticate, (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      console.error('[UploadRoute] multer error on /avatar:', err.code, err.message);
      return res.status(400).json({ success: false, message: err.message, code: err.code });
    }
    console.log('[UploadRoute] multer OK, file:', (req as any).file?.originalname);
    next();
  });
}, uploadController.uploadAvatar);

router.post('/team-logo', authenticate, (req, res, next) => {
  uploadTeamLogo(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, uploadController.uploadTeamLogo);

router.post('/verification', authenticate, (req, res, next) => {
  uploadVerificationScreenshot(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, uploadController.uploadVerificationScreenshot);

router.post('/gift-card-image', authenticate, (req, res, next) => {
  uploadGiftCardImage(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, uploadController.uploadGiftCardImage);

export default router;
