const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '../../backend/node_modules/sharp'));

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3005/';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 NeoBattleApp';

async function analyzeFrame(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const totalPixels = info.width * info.height;
  let totalLuminance = 0;
  let nonBlackPixels = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    totalLuminance += lum;
    if (lum > 15) {
      nonBlackPixels++;
    }
  }

  const meanLuminance = totalLuminance / totalPixels;
  // A frame is almost fully black if mean luminance is near zero (< 2.0) and non-black pixels are fewer than 100
  const isBlackFrame = meanLuminance < 2.0 && nonBlackPixels < 100;

  return {
    meanLuminance,
    nonBlackPixels,
    isBlackFrame,
  };
}

async function runTest() {
  console.log('[blackGapDetection] Starting automated test with Slow 4G and mobile viewport...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 360,
      height: 640,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });

    await page.setUserAgent(USER_AGENT);

    const client = await page.target().createCDPSession();
    // Set background to pure black (matching Android native windowBackground)
    await client.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 1 },
    });
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150, // 150ms RTT
      downloadThroughput: (400 * 1024) / 8, // 400 kbps
      uploadThroughput: (150 * 1024) / 8,   // 150 kbps
      connectionType: 'cellular3g',
    });

    const frames = [];
    const startTime = Date.now();
    const navPromise = page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    // Capture screenshots every ~50ms from navigation start for 8 seconds
    while (Date.now() - startTime < 8000) {
      const elapsed = Date.now() - startTime;
      try {
        const screenshotBuf = await page.screenshot({ type: 'png' });
        const analysis = await analyzeFrame(screenshotBuf);
        frames.push({
          timeMs: elapsed,
          ...analysis,
        });
      } catch (err) {
        frames.push({
          timeMs: elapsed,
          meanLuminance: 0,
          nonBlackPixels: 0,
          isBlackFrame: true,
          error: true,
        });
      }
      await new Promise((r) => setTimeout(r, 30));
    }

    await navPromise;

    // Analyze timeline
    console.log(`[blackGapDetection] Captured ${frames.length} frames over 8000ms.`);

    let firstOverlayPaintedIndex = -1;
    for (let i = 0; i < frames.length; i++) {
      if (!frames[i].isBlackFrame) {
        firstOverlayPaintedIndex = i;
        break;
      }
    }

    let blackFramesAfterOverlay = 0;
    const blackFrameTimings = [];

    if (firstOverlayPaintedIndex >= 0) {
      for (let i = firstOverlayPaintedIndex; i < frames.length; i++) {
        if (frames[i].isBlackFrame) {
          blackFramesAfterOverlay++;
          blackFrameTimings.push(frames[i].timeMs);
        }
      }
    }

    console.log('\n--- TIMELINE REPORT ---');
    console.log(`First visible overlay paint at: ${firstOverlayPaintedIndex >= 0 ? frames[firstOverlayPaintedIndex].timeMs + 'ms' : 'N/A'}`);
    console.log(`Total frames evaluated after overlay paint: ${firstOverlayPaintedIndex >= 0 ? frames.length - firstOverlayPaintedIndex : 0}`);
    console.log(`Black frames after overlay paint: ${blackFramesAfterOverlay}`);

    // Print all timeline intervals
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      let state = 'BLACK / INITIAL';
      if (!f.isBlackFrame) {
        if (f.nonBlackPixels > 50000) {
          state = 'ROUTE CONTENT / APP PAINTED';
        } else if (f.nonBlackPixels > 5000) {
          state = 'LOADING OVERLAY (ART + SHIELD + SPINNER)';
        } else {
          state = 'LOADING OVERLAY (SPINNER / INITIAL)';
        }
      }
      console.log(`[${String(f.timeMs).padStart(5, ' ')} ms] Mean Lum: ${f.meanLuminance.toFixed(2).padStart(5, ' ')}, Visible Px: ${String(f.nonBlackPixels).padStart(6, ' ')} -> ${state}`);
    }

    if (blackFramesAfterOverlay > 0) {
      console.error(`\nFAILED: Found ${blackFramesAfterOverlay} black frames after overlay paint at: ${blackFrameTimings.slice(0, 10).join(', ')}ms...`);
      process.exit(1);
    } else {
      console.log('\nSUCCESS: 0 black frames detected after overlay paint. Transition is 100% continuous!');
      process.exit(0);
    }
  } finally {
    await browser.close();
  }
}

runTest().catch((err) => {
  console.error('[blackGapDetection] Error running test:', err);
  process.exit(1);
});
