import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary';

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neobattle/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'limit', quality: 'auto' }],
  } as any,
});

const teamLogoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neobattle/team-logos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 200, height: 200, crop: 'limit', quality: 'auto' }],
  } as any,
});

const verificationStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neobattle/verification',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  } as any,
});

const giftCardStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neobattle/gift-cards',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  } as any,
});

const fileFilter = (_req: any, file: any, cb: any) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
  if (allowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'));
  }
};

export const uploadAvatar = multer({ storage: avatarStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).single('avatar');
export const uploadTeamLogo = multer({ storage: teamLogoStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).single('teamLogo');
export const uploadVerificationScreenshot = multer({ storage: verificationStorage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }).single('screenshot');
export const uploadGiftCardImage = multer({ storage: giftCardStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).single('image');
