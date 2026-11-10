import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve(__dirname, '../..');
const backendDir = path.resolve(__dirname, '../../../backend');
const sharp = require(path.join(backendDir, 'node_modules/sharp'));

test('Single Logo - app-splash-bg.webp has aligned shield and size <= 150KB', async () => {
  const webpPath = path.join(frontendDir, 'public/app-splash-bg.webp');
  assert.ok(fs.existsSync(webpPath), 'app-splash-bg.webp must exist');

  const stats = fs.statSync(webpPath);
  assert.ok(stats.size <= 150 * 1024, `app-splash-bg.webp must be <= 150KB (actual: ${(stats.size / 1024).toFixed(1)}KB)`);

  const { data, info } = await sharp(webpPath).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1080, 'Must be 1080 wide');
  assert.equal(info.height, 2160, 'Must be 2160 high');

  // Verify the shield inside app-splash-bg.webp is centered at (540, 1080)
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 1080 - 150; y <= 1080 + 150; y++) {
    for (let x = 540 - 120; x <= 540 + 120; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if ((b > 130 && g > 75) || (r > 160 && g > 85)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const shieldCx = (minX + maxX) / 2;
  const shieldCy = (minY + maxY) / 2;
  const shieldW = maxX - minX + 1;

  assert.ok(Math.abs(shieldCx - 540) <= 4, `Shield X center must be within 4px of 540 (actual: ${shieldCx})`);
  assert.ok(Math.abs(shieldCy - 1080) <= 8, `Shield Y center must be within 8px of 1080 (actual: ${shieldCy})`);
  assert.ok(shieldW >= 195 && shieldW <= 210, `Shield width in 2x canvas must be ~200px (actual: ${shieldW})`);
});

test('No Second Logo - SplashScreen has no overlay shield or black box', () => {
  const splashPath = path.join(frontendDir, 'src/components/SplashScreen.tsx');
  const splashContent = fs.readFileSync(splashPath, 'utf8');

  // Must NOT render second overlay shield
  assert.ok(!splashContent.includes('SPLASH_SHIELD_DATA_URI'), 'SplashScreen must not render duplicate overlay shield');
  assert.ok(splashContent.includes('APP_SPLASH_BG'), 'SplashScreen must render art containing shield');

  // Loader positioned below shield with same 24px spacing (50% + 58px + 24px = 50% + 82px)
  assert.ok(splashContent.includes('top: \'calc(50% + 82px)\'') || splashContent.includes('50% + 82px'), 'Loader must be placed below shield at calc(50% + 82px)');

  // No-black-gap timing maintained
  assert.ok(splashContent.includes('app-content-ready'), 'SplashScreen must listen for app-content-ready');
  assert.ok(splashContent.includes('800'), 'SplashScreen must maintain minimum 0.8s display after native hide');
  assert.ok(splashContent.includes('8000'), 'SplashScreen must have 8.0s safety timeout with retry screen');
  assert.ok(splashContent.includes('Try again'), 'SplashScreen must have Try again button');
});

test('System Splash Alignment Verification across 360x640, 390x844, 430x932', async () => {
  const viewports = [
    { w: 360, h: 640 },
    { w: 390, h: 844 },
    { w: 430, h: 932 },
  ];

  const nativeSplashMdpi = path.resolve(frontendDir, '../mobile/android/app/src/main/res/drawable-mdpi/splash_icon_v31.png');
  const webpPath = path.resolve(frontendDir, 'public/app-splash-bg.webp');

  for (const vp of viewports) {
    const W = vp.w, H = vp.h;
    const screenCx = W / 2, screenCy = H / 2;

    // 1. Native splash
    const nativeCanvas = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{
        input: nativeSplashMdpi,
        left: Math.round(screenCx - 144),
        top: Math.round(screenCy - 144),
      }])
      .raw()
      .toBuffer({ resolveWithObject: true });

    let nMinX = W, nMaxX = 0, nMinY = H, nMaxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const a = nativeCanvas.data[idx + 3];
        const r = nativeCanvas.data[idx];
        const g = nativeCanvas.data[idx + 1];
        const b = nativeCanvas.data[idx + 2];
        if (a > 10 && (r > 15 || g > 15 || b > 15)) {
          if (x < nMinX) nMinX = x;
          if (x > nMaxX) nMaxX = x;
          if (y < nMinY) nMinY = y;
          if (y > nMaxY) nMaxY = y;
        }
      }
    }
    const nW = nMaxX - nMinX + 1;
    const nCx = (nMinX + nMaxX) / 2;
    const nCy = (nMinY + nMaxY) / 2;

    // 2. Web art
    const cropLeft = Math.round(270 - screenCx);
    const cropTop = Math.round(540 - screenCy);
    const webCanvas = await sharp(webpPath)
      .resize(540, 1080)
      .extract({ left: cropLeft, top: cropTop, width: W, height: H })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let wMinX = W, wMaxX = 0, wMinY = H, wMaxY = 0;
    const ch = webCanvas.info.channels;
    for (let y = Math.round(screenCy - 75); y <= Math.round(screenCy + 75); y++) {
      for (let x = Math.round(screenCx - 65); x <= Math.round(screenCx + 65); x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const idx = (y * W + x) * ch;
        const r = webCanvas.data[idx];
        const g = webCanvas.data[idx + 1];
        const b = webCanvas.data[idx + 2];
        if ((b > 130 && g > 75) || (r > 160 && g > 85)) {
          if (x < wMinX) wMinX = x;
          if (x > wMaxX) wMaxX = x;
          if (y < wMinY) wMinY = y;
          if (y > wMaxY) wMaxY = y;
        }
      }
    }
    const wW = wMaxX - wMinX + 1;
    const wCx = (wMinX + wMaxX) / 2;
    const wCy = (wMinY + wMaxY) / 2;

    assert.equal(Math.abs(wW - nW), 0, `Shield width difference must be 0px on ${W}x${H} (web: ${wW}, native: ${nW})`);
    assert.ok(Math.abs(wCx - nCx) <= 1, `Shield X center difference must be <= 1px on ${W}x${H} (web: ${wCx}, native: ${nCx})`);
    assert.ok(Math.abs(wCy - nCy) <= 1, `Shield Y center difference must be <= 1px on ${W}x${H} (web: ${wCy}, native: ${nCy})`);
  }
});
