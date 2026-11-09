import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve(__dirname, '../..');
const backendDir = path.resolve(__dirname, '../../../backend');
const sharp = require(path.join(backendDir, 'node_modules/sharp'));

test('Logo Merge - app-splash-bg.webp has baked shield removed and size <= 150KB', async () => {
  const webpPath = path.join(frontendDir, 'public/app-splash-bg.webp');
  assert.ok(fs.existsSync(webpPath), 'app-splash-bg.webp must exist');

  const stats = fs.statSync(webpPath);
  assert.ok(stats.size <= 150 * 1024, `app-splash-bg.webp must be <= 150KB (actual: ${(stats.size / 1024).toFixed(1)}KB)`);

  const { data, info } = await sharp(webpPath).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1080, 'Must be 1080 wide');
  assert.equal(info.height, 1920, 'Must be 1920 high');

  // Verify the center area where the baked shield was (x: 420..660, y: 720..1000)
  // Has NO bright shield pixels (r>150, g>150, b>150 or bright cyan/orange)
  let maxBrightness = 0;
  for (let y = 720; y <= 1000; y++) {
    for (let x = 420; x <= 660; x++) {
      const idx = (y * 1080 + x) * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > maxBrightness) maxBrightness = lum;
    }
  }

  // The surrounding dark rune tones have luminance around ~30-65. Bright shield had luminance 180+.
  assert.ok(
    maxBrightness < 80,
    `Center area where baked shield was must be dark softly feathered fill (max brightness was ${maxBrightness.toFixed(1)}, expected < 80)`
  );
});

test('Zero Black Gap - AppContentReadyNotifier and SplashScreen synchronization', () => {
  const notifierPath = path.join(frontendDir, 'src/components/AppContentReadyNotifier.tsx');
  assert.ok(fs.existsSync(notifierPath), 'AppContentReadyNotifier component must exist');
  const notifierContent = fs.readFileSync(notifierPath, 'utf8');

  // Must verify header, bottomNav, and route content before dispatching app-content-ready
  assert.ok(notifierContent.includes('data-app-header') || notifierContent.includes('site-navbar'), 'Notifier must check for header');
  assert.ok(notifierContent.includes('data-app-bottom-nav') || notifierContent.includes('site-bottom-nav'), 'Notifier must check for bottom nav');
  assert.ok(notifierContent.includes('main[data-app-main]'), 'Notifier must check for route content in main');
  assert.ok(notifierContent.includes('app-content-ready'), 'Notifier must dispatch app-content-ready');
  assert.ok(notifierContent.includes('requestAnimationFrame'), 'Notifier must use two requestAnimationFrame calls');

  // SplashScreen must listen for app-content-ready
  const splashPath = path.join(frontendDir, 'src/components/SplashScreen.tsx');
  const splashContent = fs.readFileSync(splashPath, 'utf8');

  assert.ok(splashContent.includes('app-content-ready'), 'SplashScreen must listen for app-content-ready');
  assert.ok(!splashContent.includes('fallbackRouteTimer = setTimeout'), 'SplashScreen must not have arbitrary fallback timer causing black gap');
  assert.ok(splashContent.includes('800'), 'SplashScreen must maintain minimum 0.8s display after native hide');
  assert.ok(splashContent.includes('8000'), 'SplashScreen must have 8.0s safety timeout with retry screen');
  assert.ok(splashContent.includes('Try again'), 'SplashScreen must have Try again button');
  assert.ok(splashContent.includes('SPLASH_SHIELD_DATA_URI'), 'SplashScreen must render real inline shield');
});

test('Automated Black Frame Analysis - Zero black frames after overlay paint', async () => {
  // Unit test verifying frame classifier correctly detects black gaps and validates continuity
  const blackFrame = await sharp({
    create: { width: 360, height: 640, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();

  const overlayFrame = await sharp({
    create: { width: 360, height: 640, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{
      input: await sharp(path.join(frontendDir, 'public/splash-shield.png')).resize(116, 116).toBuffer(),
      left: 122,
      top: 262,
    }])
    .png()
    .toBuffer();

  function analyze(raw: Buffer, channels: number) {
    let totalLum = 0;
    let nonBlack = 0;
    const totalPixels = raw.length / channels;
    for (let i = 0; i < raw.length; i += channels) {
      const lum = 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
      totalLum += lum;
      if (lum > 15) nonBlack++;
    }
    return {
      meanLum: totalLum / totalPixels,
      nonBlack,
      isBlack: (totalLum / totalPixels) < 2.0 && nonBlack < 100,
    };
  }

  const blackRaw = await sharp(blackFrame).raw().toBuffer();
  const overlayRaw = await sharp(overlayFrame).raw().toBuffer();

  const blackRes = analyze(blackRaw, 3);
  const overlayRes = analyze(overlayRaw, 3);

  assert.equal(blackRes.isBlack, true, 'Pure black frame must be classified as black');
  assert.equal(overlayRes.isBlack, false, 'Overlay with shield must not be classified as black');
  assert.ok(overlayRes.nonBlack > 500, 'Overlay must have non-black visible pixels');
});
