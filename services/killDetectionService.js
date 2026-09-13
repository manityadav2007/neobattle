// NOTE: GEMINI_API_KEY needs to be added to .env
// Example: GEMINI_API_KEY="your-gemini-api-key-here"

const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Ensure environment variables are loaded
require('dotenv').config();
if (!process.env.GEMINI_API_KEY) {
  const candidateEnvPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', 'backend', '.env'),
  ];
  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      if (process.env.GEMINI_API_KEY) break;
    }
  }
}

// Model & Detection Configuration
const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const BATCH_SIZE = 12; // 12 sequential frames per Gemini request
const FRAME_INTERVAL_SECONDS = 4; // 1 frame every 4 seconds
const RATE_LIMIT_DELAY_MS = 13000; // ~13s between requests to strictly respect <= 5 requests/minute

// Exact user-specified prompt for Gemini multimodal vision
const GEMINI_PROMPT =
  'These are 12 sequential screenshots from a Free Fire match, taken a few seconds apart, in chronological order. ' +
  'For each image where a kill feed notification is visible (text usually near the top of the screen showing one player ' +
  "eliminated another), extract the eliminator's name and the eliminated player's name. " +
  'Return a JSON array of all kills found across these images, in this format: [{"eliminator": "name", "eliminated": "name"}]. ' +
  'If no kill feed is visible in any image, return an empty array [].';

// Track the timestamp of the last Gemini API call to enforce the rate limit
let lastApiCallTimestamp = 0;

/**
 * Enforces rate limit of maximum 5 requests per minute by ensuring
 * at least RATE_LIMIT_DELAY_MS (13 seconds) elapses between API calls.
 */
async function enforceRateLimit() {
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
 *
 * @param {string} videoPath - Absolute path to video file.
 * @param {string} outputDir - Directory to store extracted JPEG frames.
 * @returns {Promise<string[]>} - Sorted array of absolute frame file paths.
 */
async function extractFramesFromVideo(videoPath, outputDir) {
  console.log(`[KillDetection] Extracting frames from "${path.basename(videoPath)}" (1 frame every ${FRAME_INTERVAL_SECONDS}s)...`);

  await new Promise((resolve, reject) => {
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
      const numA = parseInt(a.match(/\d+/)[0], 10);
      const numB = parseInt(b.match(/\d+/)[0], 10);
      return numA - numB;
    })
    .map((file) => path.join(outputDir, file));

  return files;
}

/**
 * Parses and sanitizes Gemini JSON response.
 *
 * @param {string} rawText - Response text from Gemini API.
 * @returns {Array<{eliminator: string, eliminated: string}>}
 */
function parseGeminiResponse(rawText) {
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

    let list = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // In case the model wrapped the array in a property like { "kills": [...] }
      const arrayProp = Object.values(parsed).find((val) => Array.isArray(val));
      if (arrayProp) list = arrayProp;
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

/**
 * Sends a batch of images to Gemini API with retry logic.
 * Retries once if the batch fails, and skips if still failing without crashing.
 *
 * @param {any} model - GoogleGenerativeAI model instance.
 * @param {string} prompt - Multimodal prompt text.
 * @param {Array<{inlineData: {data: string, mimeType: string}}>} imageParts - 12 base64 encoded images.
 * @param {number} batchNumber - 1-based batch index.
 * @param {number} totalBatches - Total count of batches.
 * @returns {Promise<Array<{eliminator: string, eliminated: string}>>}
 */
async function processBatchWithRetry(model, prompt, imageParts, batchNumber, totalBatches) {
  const maxAttempts = 2; // Initial attempt + 1 retry

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await enforceRateLimit();

      const attemptSuffix = attempt > 1 ? ` (Retry attempt ${attempt})` : '';
      console.log(`[KillDetection] Processing batch ${batchNumber} of ${totalBatches}${attemptSuffix}...`);

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text();

      const batchKills = parseGeminiResponse(text);
      console.log(
        `[KillDetection] Batch ${batchNumber} of ${totalBatches} completed: ${batchKills.length} kill(s) found.`
      );
      return batchKills;
    } catch (err) {
      console.error(
        `[KillDetection] Error processing batch ${batchNumber} on attempt ${attempt}:`,
        err.message || err
      );

      if (attempt < maxAttempts) {
        const isRateLimit =
          err.message &&
          (err.message.includes('429') ||
            err.message.includes('quota') ||
            err.message.includes('RESOURCE_EXHAUSTED'));
        const retryDelayMs = isRateLimit ? 15000 : 5000;
        console.log(`[KillDetection] Retrying batch ${batchNumber} after ${retryDelayMs / 1000}s delay...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        console.warn(
          `[KillDetection] Batch ${batchNumber} failed after ${maxAttempts} attempts. Skipping batch to continue pipeline.`
        );
        return [];
      }
    }
  }

  return [];
}

/**
 * Main detection pipeline:
 * 1. Validates video file and GEMINI_API_KEY
 * 2. Extracts frames via ffmpeg (1 frame every 4 seconds)
 * 3. Batches frames in sets of 12
 * 4. Calls Gemini multimodal vision model (gemini-2.5-flash) with rate limiting
 * 5. Computes timestamps and deduplicates kills within a 10-second window / across consecutive batches
 * 6. Cleans up temporary frames and returns detected kills
 *
 * @param {string} videoFilePath - Path to Free Fire gameplay video file.
 * @returns {Promise<Array<{eliminator: string, eliminated: string, timestamp: number}>>}
 */
async function detectKillsFromVideo(videoFilePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in your .env file or environment variables.'
    );
  }

  if (!videoFilePath || typeof videoFilePath !== 'string') {
    throw new Error('Invalid videoFilePath parameter provided.');
  }

  const resolvedVideoPath = path.resolve(videoFilePath);
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

  try {
    // 1. Extract frames from video
    const frameFiles = await extractFramesFromVideo(resolvedVideoPath, tempDir);

    if (frameFiles.length === 0) {
      console.warn('[KillDetection] No frames were extracted from the video.');
      return [];
    }

    console.log(`[KillDetection] Total frames extracted: ${frameFiles.length}`);

    // 2. Group frames into batches of 12 (in chronological order)
    const batches = [];
    for (let i = 0; i < frameFiles.length; i += BATCH_SIZE) {
      batches.push({
        batchIndex: batches.length, // 0-based
        frames: frameFiles.slice(i, i + BATCH_SIZE),
        startFrameIndex: i,
      });
    }

    const totalBatches = batches.length;
    console.log(`[KillDetection] Grouped into ${totalBatches} batch(es) of up to ${BATCH_SIZE} frames each.`);

    const collectedKills = [];

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

      // Send batch to Gemini with retry
      const rawBatchKills = await processBatchWithRetry(
        model,
        GEMINI_PROMPT,
        imageParts,
        batchNumber,
        totalBatches
      );

      // Deduplicate identical kills within the same batch (e.g., banner visible across multiple frames)
      const uniqueBatchKills = [];
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

        // Approximate timestamp: distribute kills evenly across the batch window
        const offsetSeconds =
          uniqueBatchKills.length === 1
            ? Math.round(batchDurationSeconds / 2)
            : Math.round(((i + 0.5) / uniqueBatchKills.length) * batchDurationSeconds);

        const killTimestamp = batchStartSeconds + offsetSeconds;

        // Deduplication check against previously collected kills:
        // If the same eliminator+eliminated pair was detected in consecutive batches
        // or within a 10-second window, skip it to avoid counting the same kill twice.
        let isDuplicate = false;

        for (const existing of collectedKills) {
          const samePair =
            existing.eliminator.toLowerCase() === kill.eliminator.toLowerCase() &&
            existing.eliminated.toLowerCase() === kill.eliminated.toLowerCase();

          if (!samePair) continue;

          // 1. Timestamp difference within 10 seconds
          const timeDiff = Math.abs(killTimestamp - existing.timestamp);
          if (timeDiff <= 10) {
            isDuplicate = true;
            console.log(
              `[KillDetection] Deduplicating kill (within 10s window): ${kill.eliminator} eliminated ${kill.eliminated} ` +
                `(prev: ${existing.timestamp}s, current: ${killTimestamp}s)`
            );
            break;
          }

          // 2. Consecutive batches boundary check:
          // Kill feed stays on screen ~3-5s and may span across the batch boundary
          if (batch.batchIndex === existing._batchIndex + 1) {
            const prevBatchEnd =
              (existing._batchStartFrameIndex + existing._batchFrameCount - 1) * FRAME_INTERVAL_SECONDS;
            const currentBatchStart = batch.startFrameIndex * FRAME_INTERVAL_SECONDS;
            const boundaryGap = Math.abs(currentBatchStart - prevBatchEnd);

            if (boundaryGap <= 10) {
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
    }

    // Map to final sanitized output format: { eliminator, eliminated, timestamp }
    const finalKills = collectedKills.map(({ eliminator, eliminated, timestamp }) => ({
      eliminator,
      eliminated,
      timestamp,
    }));

    console.log(
      `[KillDetection] Detection pipeline complete. Total deduplicated kills detected: ${finalKills.length}`
    );
    return finalKills;
  } finally {
    // Clean up temporary extracted frames
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[KillDetection] Cleaned up temporary frames at: ${tempDir}`);
      }
    } catch (cleanupErr) {
      console.warn(`[KillDetection] Warning: Failed to clean up temp dir "${tempDir}":`, cleanupErr.message);
    }
  }
}

module.exports = {
  detectKillsFromVideo,
  default: detectKillsFromVideo,
};
