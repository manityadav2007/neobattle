import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { adminOnly } from '../middleware/adminCheck';
import * as killCounterController from '../controllers/killCounter.controller';
import * as screenshotKillCounterController from '../controllers/screenshotKillCounter.controller';

const router = Router();

// Signed screenshot viewing (validated by HMAC signature & expiration)
router.get('/screenshot/view', screenshotKillCounterController.viewAdminScreenshot);

// Restrict all AI kill counter endpoints to authenticated admins
router.use(authenticate, adminOnly);

// 1. Search PER_KILL tournaments
router.get('/tournaments', killCounterController.searchPerKillTournaments);

// 2. Get tournament details and roster
router.get('/tournaments/:id', killCounterController.getTournamentDetailsAndRoster);

// 3. Upload gameplay video
router.post('/upload-video', killCounterController.uploadVideoMiddleware, killCounterController.uploadVideo);

// 4. Start AI analysis for uploaded job
router.post('/jobs/:jobId/start', killCounterController.startAnalysis);

// 5. Get job status and live progress
router.get('/jobs/:jobId/status', killCounterController.getJobStatus);

// 6. Finalize tournament kills
router.post('/tournaments/:id/finalize', killCounterController.finalizeTournamentKills);

// === Screenshot Kill Counter Endpoints ===
// 7. Get tournament screenshot data & candidates
router.get('/tournaments/:id/screenshot-data', screenshotKillCounterController.getTournamentScreenshotData);

// 8. Scan screenshots with Gemini AI
router.post(
  '/scan-screenshots',
  screenshotKillCounterController.screenshotUploadMiddleware,
  screenshotKillCounterController.scanScreenshots
);

// 9. Distribute per-kill prizes
router.post('/distribute-per-kill', screenshotKillCounterController.distributePerKillPrizes);

export default router;
