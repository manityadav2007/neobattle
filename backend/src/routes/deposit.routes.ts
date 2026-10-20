import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as depositController from '../controllers/deposit.controller';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/authMiddleware';
import { adminOnly } from '../middleware/adminCheck';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Memory storage so the file buffer is inspected for magic bytes and EXIF stripped before storing
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Rate limiter per IP (Requirement 6)
const depositClaimIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Too many deposit claims from this IP address. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 1. Static routes must always be declared BEFORE parameterized routes
router.get('/active', authenticate, asyncHandler(paymentController.getActiveDepositOrder));
router.get('/my-claims', authenticate, asyncHandler(depositController.listMyDepositClaims));
router.get('/pending', authenticate, adminOnly, asyncHandler(depositController.listDepositRequests));
router.post(
  '/claim',
  authenticate,
  depositClaimIpLimiter,
  memoryUpload.single('screenshot'),
  asyncHandler(depositController.submitDepositClaim)
);
router.post('/request', authenticate, asyncHandler(depositController.createDepositRequest));
router.get('/screenshot/view', asyncHandler(depositController.viewFallbackScreenshot));

// 2. Parameterized routes with guard against reserved static paths
router.get('/:id/resume', authenticate, asyncHandler(paymentController.getResumableDepositOrder));
router.get('/:id', authenticate, (req, res, next) => {
  // Prevent any known static sub-path from being treated as an ID
  const reservedPaths = ['pending', 'active', 'request', 'my-claims', 'claim', 'screenshot'];
  const idStr = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (idStr && reservedPaths.includes(idStr.toLowerCase())) {
    res.status(404).json({ success: false, message: 'Deposit request not found' });
    return;
  }
  return asyncHandler(paymentController.getResumableDepositOrder)(req as any, res, next);
});
router.patch('/:id/review', authenticate, adminOnly, asyncHandler(depositController.reviewDepositRequest));

export default router;
