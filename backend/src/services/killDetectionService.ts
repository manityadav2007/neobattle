import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface CropRegion {
  x: number; // percentage (0-100) or pixel value
  y: number; // percentage (0-100) or pixel value
  width: number;
  height: number;
  unit?: 'percent' | 'pixel';
}

// Configure ffmpeg binary path: try ffmpeg-static first (needed on Render/cloud Linux containers), otherwise fallback to system PATH
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
  }
} catch (err: any) {
  // Fall back to system ffmpeg binary in PATH
}

// Ensure environment variables are loaded
require('dotenv').config();
if (!process.env.GEMINI_API_KEY) {
  const candidateEnvPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      if (process.env.GEMINI_API_KEY) break;
    }
  }
}

// Model & Detection Configuration (Gemini 3.8 Flash on Paid Tier with automatic fallback)
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || 'gemini-3.8-flash';
export const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash'];
export const BATCH_SIZE = 30; // 30 frames per Gemini request (optimal with cropped kill-feed images on paid tier)
export const FRAME_INTERVAL_SECONDS = 1.0; // 1 frame every 1.0s (captures 2-3s kill feed banners without missing)
export const RATE_LIMIT_DELAY_MS = 1000; // 1s pause between requests (well within paid tier's 1,000 RPM)
export const DEDUPLICATION_WINDOW_SECONDS = 3.0; // 3.0s window to deduplicate same kill event across adjacent 1.0s frames
export const MAX_ALLOWED_BATCHES_PER_VIDEO = 100; // Practical safety ceiling (~50 minutes of video at 1.0s/frame)

/**
 * Returns dynamic user-specified prompt for Gemini multimodal vision
 */
export function getGeminiPrompt(frameCount: number = BATCH_SIZE): string {
  return (
    `These are ${frameCount} sequential screenshots from a Free Fire match, taken approximately ${FRAME_INTERVAL_SECONDS} seconds apart, in chronological order. ` +
    'For each image where a kill feed notification is visible (text usually near the top of the screen showing one player ' +
    "eliminated another), extract the eliminator's name and the eliminated player's name. " +
    'Return a JSON array of all kills found across these images, in this format: [{"eliminator": "name", "eliminated": "name"}]. ' +
    'If no kill feed is visible in any image, return an empty array [].'
  );
}

// Fallback constant for backwards compatibility
export const GEMINI_PROMPT = getGeminiPrompt(BATCH_SIZE);

/**
 * Probes the video duration in seconds using ffprobe.
 * Returns 0 if probing fails.
 */
export function probeVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (!err && metadata && metadata.format && typeof metadata.format.duration === 'number' && metadata.format.duration > 0) {
        resolve(metadata.format.duration);
      } else {
        resolve(0);
      }
    });
  });
}

/**
 * Calculates estimated frames and required API calls for a given duration.
 */
export function estimateApiCalls(durationSeconds: number, frameCount?: number): { expectedFrames: number; expectedApiCalls: number } {
  const expectedFrames = frameCount ?? (durationSeconds > 0 ? Math.ceil(durationSeconds / FRAME_INTERVAL_SECONDS) : 0);
  const expectedApiCalls = expectedFrames > 0 ? Math.ceil(expectedFrames / BATCH_SIZE) : 0;
  return { expectedFrames, expectedApiCalls };
}

// Track the timestamp of the last Gemini API call to enforce the rate limit
let lastApiCallTimestamp = 0;

/**
 * Enforces rate limit of maximum 5 requests per minute by ensuring
 * at least RATE_LIMIT_DELAY_MS (13 seconds) elapses between API calls.
 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTimestamp;

  if (lastApiCallTimestamp > 0 && timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
    const waitTimeMs = RATE_LIMIT_DELAY_MS - timeSinceLastCall;
    console.log(`[KillDetection] Rate limit: waiting ${(waitTimeMs / 1000).toFixed(1)}s before next API call...`);
    await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
  }
  lastApiCallTimestamp = Date.now();
}

/**
 * Extracts frames from a video file at 1 frame every 4 seconds.
 */
async function extractFramesFromVideo(videoPath: string, outputDir: string): Promise<string[]> {
  console.log(`[KillDetection] Extracting frames from "${path.basename(videoPath)}" (1 frame every ${FRAME_INTERVAL_SECONDS}s)...`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf`, `fps=1/${FRAME_INTERVAL_SECONDS}`,
        '-q:v', '2', // High quality JPEG output
      ])
      .output(path.join(outputDir, 'frame_%04d.jpg'))
      .on('start', (commandLine) => {
        console.log(`[KillDetection] FFmpeg command: ${commandLine}`);
      })
      .on('error', (err) => {
        console.error(`[KillDetection] FFmpeg extraction failed: ${err.message}`);
        reject(err);
      })
      .on('end', () => {
        console.log('[KillDetection] Frame extraction finished.');
        resolve();
      })
      .run();
  });

  const files = fs
    .readdirSync(outputDir)
    .filter((file) => /^frame_\d+\.jpg$/i.test(file))
    .sort((a, b) => {
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      const numA = matchA ? parseInt(matchA[0], 10) : 0;
      const numB = matchB ? parseInt(matchB[0], 10) : 0;
      return numA - numB;
    })
    .map((file) => path.join(outputDir, file));

  return files;
}

sharp.cache(false);

export interface CropCalculatedDetails {
  applied: boolean;
  sourceWidth: number;
  sourceHeight: number;
  pixelLeft: number;
  pixelTop: number;
  pixelWidth: number;
  pixelHeight: number;
  areaPercent: number;
}

/**
 * Crops extracted frames to the specified region using sharp.
 * If crop fails on any frame or region is invalid, returns the original frame.
 */
export async function cropExtractedFrames(
  frameFiles: string[],
  cropRegion?: CropRegion | null
): Promise<{ frameFiles: string[]; cropDetails: CropCalculatedDetails | null }> {
  if (!cropRegion || typeof cropRegion !== 'object') {
    return { frameFiles, cropDetails: null };
  }

  const { x, y, width, height, unit = 'percent' } = cropRegion;
  if (width <= 0 || height <= 0) {
    console.warn('[KillDetection] Invalid crop dimensions, skipping crop:', cropRegion);
    return { frameFiles, cropDetails: null };
  }

  console.log(
    `[KillDetection] Cropping ${frameFiles.length} frames to region: ` +
    `X=${x}, Y=${y}, W=${width}, H=${height} (${unit}) using sharp...`
  );

  let successCount = 0;
  let firstFrameDetails: CropCalculatedDetails | null = null;

  for (const framePath of frameFiles) {
    try {
      // Read file into Buffer first to prevent file-locking on Windows (EBUSY / UNKNOWN errors)
      const inputBuffer = fs.readFileSync(framePath);
      const metadata = await sharp(inputBuffer).metadata();
      const imgWidth = metadata.width || 0;
      const imgHeight = metadata.height || 0;

      if (!imgWidth || !imgHeight) continue;

      let pixelLeft = 0;
      let pixelTop = 0;
      let pixelWidth = imgWidth;
      let pixelHeight = imgHeight;

      if (unit === 'percent' || (x <= 100 && y <= 100 && width <= 100 && height <= 100)) {
        pixelLeft = Math.round((Math.max(0, x) / 100) * imgWidth);
        pixelTop = Math.round((Math.max(0, y) / 100) * imgHeight);
        pixelWidth = Math.round((Math.min(100 - x, width) / 100) * imgWidth);
        pixelHeight = Math.round((Math.min(100 - y, height) / 100) * imgHeight);
      } else {
        pixelLeft = Math.round(Math.max(0, x));
        pixelTop = Math.round(Math.max(0, y));
        pixelWidth = Math.round(Math.min(imgWidth - pixelLeft, width));
        pixelHeight = Math.round(Math.min(imgHeight - pixelTop, height));
      }

      // Safety bounds clamp
      pixelWidth = Math.max(10, Math.min(imgWidth - pixelLeft, pixelWidth));
      pixelHeight = Math.max(10, Math.min(imgHeight - pixelTop, pixelHeight));

      if (
        pixelWidth > 0 &&
        pixelHeight > 0 &&
        pixelLeft + pixelWidth <= imgWidth &&
        pixelTop + pixelHeight <= imgHeight
      ) {
        const areaPercent = Number((((pixelWidth * pixelHeight) / (imgWidth * imgHeight)) * 100).toFixed(1));
        if (!firstFrameDetails) {
          firstFrameDetails = {
            applied: true,
            sourceWidth: imgWidth,
            sourceHeight: imgHeight,
            pixelLeft,
            pixelTop,
            pixelWidth,
            pixelHeight,
            areaPercent,
          };
          console.log(
            `[KillDetection] ========================================================\n` +
            `[KillDetection] CROP RECTANGLE CONFIRMED AND APPLIED:\n` +
            `[KillDetection] Source Resolution: ${imgWidth}x${imgHeight}px\n` +
            `[KillDetection] Cropped Kill-Feed Area: left=${pixelLeft}px, top=${pixelTop}px, width=${pixelWidth}px, height=${pixelHeight}px\n` +
            `[KillDetection] Image Payload: ${areaPercent}% of original frame size\n` +
            `[KillDetection] ========================================================`
          );
        }
        const croppedBuffer = await sharp(inputBuffer)
          .extract({ left: pixelLeft, top: pixelTop, width: pixelWidth, height: pixelHeight })
          .toBuffer();
        fs.writeFileSync(framePath, croppedBuffer);
        successCount++;
      }
    } catch (cropErr: any) {
      console.warn(`[KillDetection] Error cropping frame ${path.basename(framePath)}:`, cropErr.message);
    }
  }

  console.log(`[KillDetection] Successfully cropped ${successCount} of ${frameFiles.length} frames.`);
  return { frameFiles, cropDetails: firstFrameDetails };
}

/**
 * Parses and sanitizes Gemini JSON response.
 */
function parseGeminiResponse(rawText: string): Array<{ eliminator: string; eliminated: string }> {
  if (!rawText || !rawText.trim()) return [];

  let cleaned = rawText.trim();
  // Strip markdown code fences if returned
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);

    let list: any[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const arrayProp = Object.values(parsed).find((val) => Array.isArray(val));
      if (arrayProp && Array.isArray(arrayProp)) list = arrayProp;
    }

    return list
      .filter((item) => item && typeof item === 'object' && item.eliminator && item.eliminated)
      .map((item) => ({
        eliminator: String(item.eliminator).trim(),
        eliminated: String(item.eliminated).trim(),
      }))
      .filter((item) => item.eliminator.length > 0 && item.eliminated.length > 0);
  } catch (err) {
    console.warn('[KillDetection] Warning: Failed to parse Gemini response as JSON. Raw response:', rawText);
    return [];
  }
}

export interface GeminiCallResult {
  rawText: string;
  modelUsed: string;
  durationMs: number;
}

/**
 * Calls Gemini Multimodal Vision API with detailed pre-flight logging,
 * response timing, raw response logging, error catching with stack traces,
 * and automatic fallback across candidate models on 503/404 errors.
 */
export async function callGeminiMultimodalWithLogging(
  apiKey: string,
  prompt: string,
  imageParts: Array<{ inlineData: { data: string; mimeType: string } }>,
  batchNumber: number,
  totalBatches: number,
  tag: string = '[KillDetection]'
): Promise<GeminiCallResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = [GEMINI_MODEL_NAME, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL_NAME)];

  let lastError: any = null;

  for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
    const currentModel = candidateModels[modelIdx];
    const isFallback = modelIdx > 0;

    await enforceRateLimit();

    const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;
    console.log(`\n======================================================`);
    console.log(`${tag} [Gemini API Pre-Flight] Batch ${batchNumber} of ${totalBatches}${isFallback ? ' (Fallback Model)' : ''}`);
    console.log(`${tag} API Key Configured: ${Boolean(apiKey)}`);
    console.log(`${tag} Exact Model String: "${currentModel}"`);
    console.log(`${tag} HTTP Request: POST ${endpointUrl}`);
    console.log(`${tag} Payload: ${imageParts.length} image(s), prompt length ${prompt.length} chars`);
    console.log(`======================================================`);

    const t0 = Date.now();
    try {
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const rawText = response.text();
      const durationMs = Date.now() - t0;

      console.log(
        `${tag} [Gemini API Response] Batch ${batchNumber} of ${totalBatches} -> HTTP Status: 200 OK | Duration: ${durationMs}ms | Model: ${currentModel}`
      );
      console.log(`${tag} --- COMPLETE RAW TEXT RESPONSE START (Batch ${batchNumber}) ---`);
      console.log(rawText);
      console.log(`${tag} --- COMPLETE RAW TEXT RESPONSE END (Batch ${batchNumber}) ---\n`);

      return { rawText, modelUsed: currentModel, durationMs };
    } catch (err: any) {
      lastError = err;
      const httpStatus =
        err.status ||
        err.statusCode ||
        (err.message && err.message.match(/\[(\d{3})\s/)?.[1]) ||
        'N/A';
      console.error(`\n======================================================`);
      console.error(`${tag} [Gemini API ERROR] Batch ${batchNumber} of ${totalBatches}`);
      console.error(`${tag} Model Attempted: ${currentModel}`);
      console.error(`${tag} HTTP Status / Code: ${httpStatus}`);
      console.error(`${tag} Error Message: ${err.message || err}`);
      console.error(`${tag} Full Stack Trace:\n`, err.stack || err);
      console.error(`======================================================\n`);

      if (modelIdx < candidateModels.length - 1) {
        console.log(
          `${tag} Model ${currentModel} encountered error. Attempting fallback to ${candidateModels[modelIdx + 1]} for Batch ${batchNumber}...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
    }
  }

  throw lastError || new Error(`All Gemini candidate models failed for batch ${batchNumber}`);
}

/**
 * Sends a batch of images to Gemini API with retry logic and full debug logging.
 */
async function processBatchWithRetry(
  apiKey: string,
  prompt: string,
  imageParts: Array<{ inlineData: { data: string; mimeType: string } }>,
  batchNumber: number,
  totalBatches: number
): Promise<Array<{ eliminator: string; eliminated: string }>> {
  try {
    const { rawText } = await callGeminiMultimodalWithLogging(
      apiKey,
      prompt,
      imageParts,
      batchNumber,
      totalBatches,
      '[KillDetection]'
    );
    const batchKills = parseGeminiResponse(rawText);
    console.log(
      `[KillDetection] Batch ${batchNumber} of ${totalBatches} completed: ${batchKills.length} kill(s) found.`
    );
    return batchKills;
  } catch (err: any) {
    console.error(
      `[KillDetection] Batch ${batchNumber} failed after exhausting candidate models:`,
      err.message || err
    );
    return [];
  }
}

export interface DetectedKill {
  eliminator: string;
  eliminated: string;
  timestamp: number;
}

export interface ProgressData {
  batchIndex: number;
  currentBatch: number;
  totalBatches: number;
  batchKills: Array<{ eliminator: string; eliminated: string }>;
  allKillsSoFar: DetectedKill[];
}

/**
 * Main detection pipeline:
 * 1. Validates video file and GEMINI_API_KEY
 * 2. Extracts frames via ffmpeg (1 frame every 4 seconds)
 * 3. Batches frames in sets of 12
 * 4. Calls Gemini multimodal vision model (gemini-2.5-flash) with rate limiting
 * 5. Computes timestamps and deduplicates kills within a 10-second window / across consecutive batches
 * 6. Cleans up temporary frames and returns detected kills
 */
export async function detectKillsFromVideo(
  videoFilePath: string,
  onProgressOrCrop?: ((progress: ProgressData) => void) | CropRegion | null,
  cropRegionArg?: CropRegion | null
): Promise<DetectedKill[]> {
  const onProgress = typeof onProgressOrCrop === 'function' ? onProgressOrCrop : undefined;
  const cropRegion = typeof onProgressOrCrop === 'object' && onProgressOrCrop !== null ? onProgressOrCrop : cropRegionArg;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in your .env file or environment variables.'
    );
  }

  if (!videoFilePath || typeof videoFilePath !== 'string' || videoFilePath.includes('\0') || videoFilePath.includes('..')) {
    throw new Error('Invalid videoFilePath parameter provided.');
  }

  const resolvedVideoPath = path.resolve(videoFilePath);
  const allowedRoots = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(os.tmpdir()),
    path.resolve(__dirname, '..', '..', 'uploads'),
    path.resolve(__dirname, '..', 'uploads'),
  ];
  if (!allowedRoots.some((root) => resolvedVideoPath.startsWith(root))) {
    throw new Error('Access denied: videoFilePath must be within allowed directory.');
  }
  if (!fs.existsSync(resolvedVideoPath)) {
    throw new Error(`Video file not found at: ${resolvedVideoPath}`);
  }

  // Initialize Google Generative AI
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL_NAME,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  // Create temporary directory for extracted frames
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'firearena-kills-'));
  console.log(`[KillDetection] Starting detection pipeline for: ${resolvedVideoPath}`);
  console.log(`[KillDetection] Temp frames directory: ${tempDir}`);

  // Recalculate and log expected API calls based on probed video duration
  const probedDuration = await probeVideoDuration(resolvedVideoPath);
  if (probedDuration > 0) {
    const { expectedFrames, expectedApiCalls } = estimateApiCalls(probedDuration);
    console.log(
      `[KillDetection] Video duration: ~${Math.round(probedDuration)}s (${(probedDuration / 60).toFixed(1)} mins). Estimated frames: ~${expectedFrames} (1 every ${FRAME_INTERVAL_SECONDS}s).`
    );
    console.log(
      `[KillDetection] Video will require approximately ${expectedApiCalls} Gemini API request(s).`
    );
  }

  const collectedKills: Array<DetectedKill & { _batchIndex: number; _batchStartFrameIndex: number; _batchFrameCount: number }> = [];

  try {
    // 1. Extract frames from video (1 frame every 1.5 seconds)
    const frameFiles = await extractFramesFromVideo(resolvedVideoPath, tempDir);

    if (frameFiles.length === 0) {
      console.warn('[KillDetection] No frames were extracted from the video.');
      return [];
    }

    console.log(`[KillDetection] Total frames extracted: ${frameFiles.length}`);

    // Optional: Crop frames to selected screen region (e.g. kill-feed area)
    if (cropRegion) {
      await cropExtractedFrames(frameFiles, cropRegion);
    }

    // 2. Group frames into batches of 30 (in chronological order)
    const batches = [];
    for (let i = 0; i < frameFiles.length && batches.length < MAX_ALLOWED_BATCHES_PER_VIDEO; i += BATCH_SIZE) {
      batches.push({
        batchIndex: batches.length, // 0-based
        frames: frameFiles.slice(i, i + BATCH_SIZE),
        startFrameIndex: i,
      });
    }

    const totalBatches = batches.length;
    console.log(`[KillDetection] Grouped into ${totalBatches} batch(es) of up to ${BATCH_SIZE} frames each (1 frame every ${FRAME_INTERVAL_SECONDS}s).`);
    console.log(
      `[KillDetection] Processing will use ${totalBatches} Gemini API request(s).`
    );

    // 3. Process each batch sequentially
    for (const batch of batches) {
      const batchNumber = batch.batchIndex + 1;

      // Prepare inlineData for all frames in this batch
      const imageParts = batch.frames.map((framePath) => ({
        inlineData: {
          data: fs.readFileSync(framePath).toString('base64'),
          mimeType: 'image/jpeg',
        },
      }));

      // Send batch to Gemini with retry using dynamic batch prompt
      const batchPrompt = getGeminiPrompt(batch.frames.length);
      const rawBatchKills = await processBatchWithRetry(
        apiKey,
        batchPrompt,
        imageParts,
        batchNumber,
        totalBatches
      );

      // Deduplicate identical kills within the same batch
      const uniqueBatchKills: Array<{ eliminator: string; eliminated: string }> = [];
      for (const kill of rawBatchKills) {
        const isDuplicateInBatch = uniqueBatchKills.some(
          (k) =>
            k.eliminator.toLowerCase() === kill.eliminator.toLowerCase() &&
            k.eliminated.toLowerCase() === kill.eliminated.toLowerCase()
        );
        if (!isDuplicateInBatch) {
          uniqueBatchKills.push(kill);
        }
      }

      // Assign approximate timestamps based on frame position within the batch
      const batchStartSeconds = batch.startFrameIndex * FRAME_INTERVAL_SECONDS;
      const batchFrameCount = batch.frames.length;
      const batchDurationSeconds = batchFrameCount * FRAME_INTERVAL_SECONDS;

      for (let i = 0; i < uniqueBatchKills.length; i++) {
        const kill = uniqueBatchKills[i];

        const offsetSeconds =
          uniqueBatchKills.length === 1
            ? Math.round(batchDurationSeconds / 2)
            : Math.round(((i + 0.5) / uniqueBatchKills.length) * batchDurationSeconds);

        const killTimestamp = batchStartSeconds + offsetSeconds;

        let isDuplicate = false;

        for (const existing of collectedKills) {
          const samePair =
            existing.eliminator.toLowerCase() === kill.eliminator.toLowerCase() &&
            existing.eliminated.toLowerCase() === kill.eliminated.toLowerCase();

          if (!samePair) continue;

          // 1. Timestamp difference within deduplication window (14s matching 8s frame sampling)
          const timeDiff = Math.abs(killTimestamp - existing.timestamp);
          if (timeDiff <= DEDUPLICATION_WINDOW_SECONDS) {
            isDuplicate = true;
            console.log(
              `[KillDetection] Deduplicating kill (within ${DEDUPLICATION_WINDOW_SECONDS}s window): ${kill.eliminator} eliminated ${kill.eliminated} ` +
                `(prev: ${existing.timestamp}s, current: ${killTimestamp}s)`
            );
            break;
          }

          // 2. Consecutive batches boundary check
          if (batch.batchIndex === existing._batchIndex + 1) {
            const prevBatchEnd =
              (existing._batchStartFrameIndex + existing._batchFrameCount - 1) * FRAME_INTERVAL_SECONDS;
            const currentBatchStart = batch.startFrameIndex * FRAME_INTERVAL_SECONDS;
            const boundaryGap = Math.abs(currentBatchStart - prevBatchEnd);

            if (boundaryGap <= DEDUPLICATION_WINDOW_SECONDS) {
              isDuplicate = true;
              console.log(
                `[KillDetection] Deduplicating kill across consecutive batch boundary (${existing._batchIndex + 1} -> ${batchNumber}): ` +
                  `${kill.eliminator} eliminated ${kill.eliminated}`
              );
              break;
            }
          }
        }

        if (!isDuplicate) {
          collectedKills.push({
            eliminator: kill.eliminator,
            eliminated: kill.eliminated,
            timestamp: killTimestamp,
            _batchIndex: batch.batchIndex,
            _batchStartFrameIndex: batch.startFrameIndex,
            _batchFrameCount: batchFrameCount,
          });
        }
      }

      if (typeof onProgress === 'function') {
        try {
          const killsSoFar: DetectedKill[] = collectedKills.map(({ eliminator, eliminated, timestamp }) => ({
            eliminator,
            eliminated,
            timestamp,
          }));
          onProgress({
            batchIndex: batch.batchIndex,
            currentBatch: batchNumber,
            totalBatches,
            batchKills: uniqueBatchKills,
            allKillsSoFar: killsSoFar,
          });
        } catch (callbackErr: any) {
          console.warn('[KillDetection] Warning: onProgress callback threw an error:', callbackErr.message || callbackErr);
        }
      }
    }

    // Map to final sanitized output format
    const finalKills: DetectedKill[] = collectedKills.map(({ eliminator, eliminated, timestamp }) => ({
      eliminator,
      eliminated,
      timestamp,
    }));

    console.log(
      `[KillDetection] Detection pipeline complete. Total deduplicated kills detected: ${finalKills.length}`
    );
    return finalKills;
  } catch (pipelineErr: any) {
    if (collectedKills && collectedKills.length > 0) {
      pipelineErr.partialKills = collectedKills.map(({ eliminator, eliminated, timestamp }) => ({
        eliminator,
        eliminated,
        timestamp,
      }));
    }
    throw pipelineErr;
  } finally {
    // Clean up temporary extracted frames
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[KillDetection] Cleaned up temporary frames at: ${tempDir}`);
      }
    } catch (cleanupErr: any) {
      console.warn(`[KillDetection] Warning: Failed to clean up temp dir "${tempDir}":`, cleanupErr.message);
    }
  }
}

export interface TestDetectedKill {
  killer: string;
  victim: string;
  weapon: string;
  timestamp: number;
  formattedTime: string;
  eliminator: string;
  eliminated: string;
}

export interface TestAiFeedResult {
  totalKillsFound: number;
  kills: TestDetectedKill[];
  framesAnalyzed: number;
  batchesProcessed: number;
  estimatedApiCalls?: number;
  quotaWarning?: string | null;
  cropDetails?: CropCalculatedDetails | null;
  apiError?: string | null;
  rawResponses?: Array<{ batchNumber: number; model: string; text: string }>;
}

const TEST_FEED_PROMPT =
  'These are sequential screenshots from a Free Fire match, taken a few seconds apart, in chronological order. ' +
  'For each image where a kill feed notification is visible (text usually near the top of the screen showing one player eliminating or knocking down another), extract: ' +
  '1. "killer": name of the eliminator/killer. ' +
  '2. "victim": name of the eliminated/knocked player. ' +
  '3. "weapon": name of the weapon or method (e.g. "M1887", "MP40", "AWM", "AK47", "Groza", "Woodpecker", "Headshot", "Grenade", "Fist", etc., or "Unknown" if not clearly visible). ' +
  'Return a JSON array of all kills found across these images in this format: [{"killer": "name", "victim": "name", "weapon": "weapon name"}]. ' +
  'If no kill feed notification is visible in any image, return an empty array [].';

function parseTestFeedGeminiResponse(rawText: string): Array<{ killer: string; victim: string; weapon: string }> {
  if (!rawText || !rawText.trim()) return [];

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    let list: any[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const arrayProp = Object.values(parsed).find((val) => Array.isArray(val));
      if (arrayProp && Array.isArray(arrayProp)) list = arrayProp;
    }

    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const killer = String(item.killer || item.eliminator || '').trim();
        const victim = String(item.victim || item.eliminated || '').trim();
        const weapon = String(item.weapon || 'Unknown').trim() || 'Unknown';
        if (!killer || !victim) return null;
        return { killer, victim, weapon };
      })
      .filter((item): item is { killer: string; victim: string; weapon: string } => item !== null);
  } catch (err) {
    console.warn('[KillDetection] Warning: Failed to parse test feed Gemini response as JSON. Raw response:', rawText);
    return [];
  }
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Test AI Feed Detection:
 * Bypasses all tournament roster checks and database queries.
 * Runs frame extraction via ffmpeg and multimodal Gemini analysis to detect kills (killer, victim, weapon, timestamp).
 */
export async function detectKillsForTestFeed(
  videoFilePath: string,
  onProgressOrCrop?: ((progress: ProgressData) => void) | CropRegion | null,
  cropRegionArg?: CropRegion | null
): Promise<TestAiFeedResult> {
  const onProgress = typeof onProgressOrCrop === 'function' ? onProgressOrCrop : undefined;
  const cropRegion = typeof onProgressOrCrop === 'object' && onProgressOrCrop !== null ? onProgressOrCrop : cropRegionArg;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in your .env file or environment variables.'
    );
  }

  if (!videoFilePath || typeof videoFilePath !== 'string' || videoFilePath.includes('\0') || videoFilePath.includes('..')) {
    throw new Error('Invalid videoFilePath parameter provided.');
  }

  const resolvedVideoPath = path.resolve(videoFilePath);
  const allowedRoots = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(os.tmpdir()),
    path.resolve(__dirname, '..', '..', 'uploads'),
    path.resolve(__dirname, '..', 'uploads'),
  ];
  if (!allowedRoots.some((root) => resolvedVideoPath.startsWith(root))) {
    throw new Error('Access denied: videoFilePath must be within allowed directory.');
  }
  if (!fs.existsSync(resolvedVideoPath)) {
    throw new Error(`Video file not found at: ${resolvedVideoPath}`);
  }

  // Initialize Google Generative AI
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL_NAME,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  // Create temporary directory for extracted frames
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'firearena-test-kills-'));
  console.log(`[TestAIFeed] Starting test detection pipeline for: ${resolvedVideoPath}`);
  console.log(`[TestAIFeed] Temp frames directory: ${tempDir}`);

  // Recalculate and log expected API calls based on probed video duration
  const probedDuration = await probeVideoDuration(resolvedVideoPath);
  let quotaWarning: string | null = null;
  if (probedDuration > 0) {
    const { expectedFrames, expectedApiCalls } = estimateApiCalls(probedDuration);
    console.log(
      `[TestAIFeed] Video duration: ~${Math.round(probedDuration)}s (${(probedDuration / 60).toFixed(1)} mins). Estimated frames: ~${expectedFrames} (1 every ${FRAME_INTERVAL_SECONDS}s).`
    );
    console.log(
      `[TestAIFeed] Video will require approximately ${expectedApiCalls} Gemini API request(s).`
    );
  }

  const collectedKills: Array<TestDetectedKill & { _batchIndex: number; _batchStartFrameIndex: number; _batchFrameCount: number }> = [];

  try {
    // 1. Extract frames from video (1 frame every 1.5s)
    const frameFiles = await extractFramesFromVideo(resolvedVideoPath, tempDir);

    if (frameFiles.length === 0) {
      console.warn('[TestAIFeed] No frames were extracted from the video.');
      return { totalKillsFound: 0, kills: [], framesAnalyzed: 0, batchesProcessed: 0, estimatedApiCalls: 0, quotaWarning: null };
    }

    console.log(`[TestAIFeed] Total frames extracted: ${frameFiles.length}`);

    // Optional: Crop frames to selected screen region (e.g. kill-feed area)
    let cropDetails: CropCalculatedDetails | null = null;
    if (cropRegion) {
      const cropResult = await cropExtractedFrames(frameFiles, cropRegion);
      cropDetails = cropResult.cropDetails;
    }

    // 2. Group frames into batches of 30 (up to MAX_ALLOWED_BATCHES_PER_VIDEO / ~75 minutes of gameplay)
    const batches = [];
    for (let i = 0; i < frameFiles.length && batches.length < MAX_ALLOWED_BATCHES_PER_VIDEO; i += BATCH_SIZE) {
      batches.push({
        batchIndex: batches.length,
        frames: frameFiles.slice(i, i + BATCH_SIZE),
        startFrameIndex: i,
      });
    }

    const totalBatches = batches.length;
    console.log(`[TestAIFeed] Grouped into ${totalBatches} batch(es) of up to ${BATCH_SIZE} frames each (1 frame every ${FRAME_INTERVAL_SECONDS}s).`);
    console.log(
      `[TestAIFeed] Processing will use ${totalBatches} Gemini API request(s).`
    );

    // 3. Process each batch sequentially
    let lastApiError: string | null = null;
    const rawResponses: Array<{ batchNumber: number; model: string; text: string }> = [];

    for (const batch of batches) {
      const batchNumber = batch.batchIndex + 1;

      const imageParts = batch.frames.map((framePath) => ({
        inlineData: {
          data: fs.readFileSync(framePath).toString('base64'),
          mimeType: 'image/jpeg',
        },
      }));

      // Call Gemini with test feed prompt using comprehensive logging and fallback
      let rawBatchKills: Array<{ killer: string; victim: string; weapon: string }> = [];
      try {
        const { rawText, modelUsed } = await callGeminiMultimodalWithLogging(
          apiKey,
          TEST_FEED_PROMPT,
          imageParts,
          batchNumber,
          totalBatches,
          '[TestAIFeed]'
        );
        rawResponses.push({ batchNumber, model: modelUsed, text: rawText });
        rawBatchKills = parseTestFeedGeminiResponse(rawText);
        console.log(`[TestAIFeed] Batch ${batchNumber} of ${totalBatches} completed: ${rawBatchKills.length} kill(s) found.`);
      } catch (err: any) {
        lastApiError = `Batch ${batchNumber} failed: ${err.message || err}`;
        console.error(`[TestAIFeed] Error processing batch ${batchNumber}:`, err.message || err);
      }

      // Deduplicate identical kills within the same batch
      const uniqueBatchKills: Array<{ killer: string; victim: string; weapon: string }> = [];
      for (const kill of rawBatchKills) {
        const isDuplicate = uniqueBatchKills.some(
          (k) =>
            k.killer.toLowerCase() === kill.killer.toLowerCase() &&
            k.victim.toLowerCase() === kill.victim.toLowerCase()
        );
        if (!isDuplicate) {
          uniqueBatchKills.push(kill);
        }
      }

      // Compute timestamps
      const batchStartSeconds = batch.startFrameIndex * FRAME_INTERVAL_SECONDS;
      const batchFrameCount = batch.frames.length;
      const batchDurationSeconds = batchFrameCount * FRAME_INTERVAL_SECONDS;

      for (let i = 0; i < uniqueBatchKills.length; i++) {
        const kill = uniqueBatchKills[i];
        const offsetSeconds =
          uniqueBatchKills.length === 1
            ? Math.round(batchDurationSeconds / 2)
            : Math.round(((i + 0.5) / uniqueBatchKills.length) * batchDurationSeconds);
        const killTimestamp = batchStartSeconds + offsetSeconds;

        let isDuplicate = false;
        for (const existing of collectedKills) {
          const samePair =
            existing.killer.toLowerCase() === kill.killer.toLowerCase() &&
            existing.victim.toLowerCase() === kill.victim.toLowerCase();

          if (!samePair) continue;

          // 1. Deduplication window check (14s matching 8s frame sampling)
          if (Math.abs(killTimestamp - existing.timestamp) <= DEDUPLICATION_WINDOW_SECONDS) {
            isDuplicate = true;
            break;
          }

          // 2. Consecutive batch boundary check
          if (batch.batchIndex === existing._batchIndex + 1) {
            const prevBatchEnd =
              (existing._batchStartFrameIndex + existing._batchFrameCount - 1) * FRAME_INTERVAL_SECONDS;
            const currentBatchStart = batch.startFrameIndex * FRAME_INTERVAL_SECONDS;
            if (Math.abs(currentBatchStart - prevBatchEnd) <= DEDUPLICATION_WINDOW_SECONDS) {
              isDuplicate = true;
              break;
            }
          }
        }

        if (!isDuplicate) {
          collectedKills.push({
            killer: kill.killer,
            victim: kill.victim,
            weapon: kill.weapon || 'Unknown',
            timestamp: killTimestamp,
            formattedTime: formatSeconds(killTimestamp),
            eliminator: kill.killer,
            eliminated: kill.victim,
            _batchIndex: batch.batchIndex,
            _batchStartFrameIndex: batch.startFrameIndex,
            _batchFrameCount: batchFrameCount,
          });
        }
      }

      if (typeof onProgress === 'function') {
        try {
          onProgress({
            batchIndex: batch.batchIndex,
            currentBatch: batchNumber,
            totalBatches,
            batchKills: uniqueBatchKills.map((k) => ({ eliminator: k.killer, eliminated: k.victim })),
            allKillsSoFar: collectedKills.map((k) => ({
              eliminator: k.killer,
              eliminated: k.victim,
              timestamp: k.timestamp,
            })),
          });
        } catch (cbErr: any) {
          console.warn('[TestAIFeed] Progress callback warning:', cbErr.message);
        }
      }
    }

    const finalKills: TestDetectedKill[] = collectedKills.map((k) => ({
      killer: k.killer,
      victim: k.victim,
      weapon: k.weapon,
      timestamp: k.timestamp,
      formattedTime: formatSeconds(k.timestamp),
      eliminator: k.killer,
      eliminated: k.victim,
    }));

    console.log(`[TestAIFeed] Test analysis finished. Total kills found: ${finalKills.length}`);
    return {
      totalKillsFound: finalKills.length,
      kills: finalKills,
      framesAnalyzed: frameFiles.length,
      batchesProcessed: batches.length,
      estimatedApiCalls: batches.length,
      quotaWarning,
      cropDetails,
      apiError: lastApiError,
      rawResponses,
    };
  } finally {
    // Clean up temporary extracted frames
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[TestAIFeed] Cleaned up temporary frames at: ${tempDir}`);
      }
    } catch (cleanErr: any) {
      console.warn(`[TestAIFeed] Failed to clean up temp dir:`, cleanErr.message);
    }
  }
}

export default {
  detectKillsFromVideo,
  detectKillsForTestFeed,
};
