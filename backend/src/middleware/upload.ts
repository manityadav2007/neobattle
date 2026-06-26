import multer from 'multer';
import path from 'path';

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads', 'avatars')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${Date.now()}${ext}`);
  },
});

const teamLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads', 'team-logos')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  },
});

const verificationStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads', 'verification')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `verify-${Date.now()}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'));
  }
};

export const uploadAvatar = multer({ storage: avatarStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).single('avatar');
export const uploadTeamLogo = multer({ storage: teamLogoStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).single('teamLogo');
export const uploadVerificationScreenshot = multer({ storage: verificationStorage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }).single('screenshot');
export const uploadGiftCardImage = multer({ storage: verificationStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }).single('image');
