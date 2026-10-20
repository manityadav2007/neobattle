import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const frontendDir = path.resolve(__dirname, '../../../frontend');

test('PWA Manifest - /manifest.webmanifest is valid and meets all specs', () => {
  const manifestPath = path.join(frontendDir, 'public', 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'public/manifest.webmanifest must exist');

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  assert.equal(manifest.name, 'NeoBattle');
  assert.equal(manifest.short_name, 'NeoBattle');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#0a0a0f');
  assert.equal(manifest.theme_color, '#0a0a0f');

  assert.ok(Array.isArray(manifest.icons), 'manifest must have icons array');
  assert.ok(manifest.icons.length >= 3, 'manifest must have at least 3 icons');

  // Check 192x192
  const icon192 = manifest.icons.find((i: any) => i.sizes === '192x192');
  assert.ok(icon192, 'Must have 192x192 icon');
  assert.equal(icon192.src, '/icons/icon-192x192.png');

  // Check 512x512
  const icon512 = manifest.icons.find((i: any) => i.sizes === '512x512' && i.purpose !== 'maskable');
  assert.ok(icon512, 'Must have 512x512 standard icon');
  assert.equal(icon512.src, '/icons/icon-512x512.png');

  // Check 512x512 maskable
  const iconMaskable = manifest.icons.find(
    (i: any) => i.sizes === '512x512' && (i.purpose === 'maskable' || i.purpose?.includes('maskable'))
  );
  assert.ok(iconMaskable, 'Must have 512x512 maskable icon');
  assert.equal(iconMaskable.src, '/icons/icon-maskable-512x512.png');
});

test('PWA Icons - Generated icons have exact correct dimensions and formats', async () => {
  const icons = [
    { file: 'icon-192x192.png', expectedW: 192, expectedH: 192 },
    { file: 'icon-512x512.png', expectedW: 512, expectedH: 512 },
    { file: 'icon-maskable-512x512.png', expectedW: 512, expectedH: 512 },
    { file: 'apple-touch-icon.png', expectedW: 180, expectedH: 180 },
  ];

  for (const { file, expectedW, expectedH } of icons) {
    const fullPath = path.join(frontendDir, 'public', 'icons', file);
    assert.ok(fs.existsSync(fullPath), `Icon file ${file} must exist`);

    const meta = await sharp(fullPath).metadata();
    assert.equal(meta.width, expectedW, `${file} width must be ${expectedW}`);
    assert.equal(meta.height, expectedH, `${file} height must be ${expectedH}`);
    assert.equal(meta.format, 'png', `${file} must be PNG format`);
  }
});

test('Service Worker - sw.js exists, caches static assets, and excludes sensitive routes', () => {
  const swPath = path.join(frontendDir, 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');

  const swContent = fs.readFileSync(swPath, 'utf8');

  // Must pre-cache app shell and icons
  assert.ok(swContent.includes('/icons/icon-192x192.png'), 'sw must pre-cache icon-192');
  assert.ok(swContent.includes('/icons/icon-512x512.png'), 'sw must pre-cache icon-512');
  assert.ok(swContent.includes('/manifest.webmanifest'), 'sw must pre-cache manifest');

  // Must explicitly exclude API, auth, wallet, payment, and admin routes
  assert.ok(swContent.includes('/api/') || swContent.includes('\\/api\\/'), 'sw must exclude /api/');
  assert.ok(swContent.includes('/auth/') || swContent.includes('\\/auth\\/'), 'sw must exclude /auth/');
  assert.ok(swContent.includes('/wallet') || swContent.includes('\\/wallet'), 'sw must exclude /wallet');
  assert.ok(swContent.includes('/payment') || swContent.includes('\\/payment'), 'sw must exclude /payment');
  assert.ok(swContent.includes('/admin') || swContent.includes('\\/admin'), 'sw must exclude /admin');

  // Must only cache GET requests
  assert.ok(swContent.includes("request.method !== 'GET'"), 'sw must bypass non-GET requests');
});

test('Frontend Layout - links manifest, theme-color, and iOS meta tags', () => {
  const layoutPath = path.join(frontendDir, 'src', 'app', 'layout.tsx');
  assert.ok(fs.existsSync(layoutPath), 'layout.tsx must exist');

  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  // Manifest link
  assert.ok(layoutContent.includes('/manifest.webmanifest'), 'layout must link manifest.webmanifest');

  // Theme color
  assert.ok(layoutContent.includes('theme-color') || layoutContent.includes('themeColor'), 'layout must have theme-color');

  // Apple mobile web app tags
  assert.ok(layoutContent.includes('apple-touch-icon'), 'layout must have apple-touch-icon');
  assert.ok(layoutContent.includes('apple-mobile-web-app-capable'), 'layout must have apple-mobile-web-app-capable');
  assert.ok(layoutContent.includes('apple-mobile-web-app-title'), 'layout must have apple-mobile-web-app-title');

  // Service worker registration component
  assert.ok(layoutContent.includes('ServiceWorkerRegister'), 'layout must include ServiceWorkerRegister');
});

test('Digital Asset Links - /.well-known/assetlinks.json exists with valid JSON', () => {
  const assetLinksPath = path.join(frontendDir, 'public', '.well-known', 'assetlinks.json');
  assert.ok(fs.existsSync(assetLinksPath), 'public/.well-known/assetlinks.json must exist');

  const raw = fs.readFileSync(assetLinksPath, 'utf8');
  const parsed = JSON.parse(raw);

  assert.ok(Array.isArray(parsed), 'assetlinks.json must be a JSON array');
  assert.ok(parsed[0].relation, 'assetlinks.json must have relation field');
  assert.ok(parsed[0].target, 'assetlinks.json must have target field');
  assert.equal(parsed[0].target.namespace, 'android_app');
  assert.equal(parsed[0].target.package_name, 'live.neobattle.twa');
});

test('Next.js Config - headers configure correct Content-Types for APK and assetlinks', () => {
  const configPath = path.join(frontendDir, 'next.config.js');
  assert.ok(fs.existsSync(configPath), 'next.config.js must exist');

  const content = fs.readFileSync(configPath, 'utf8');

  // APK content-type
  assert.ok(
    content.includes('application/vnd.android.package-archive'),
    'next.config.js must serve .apk with application/vnd.android.package-archive'
  );

  // assetlinks content-type
  assert.ok(
    content.includes('/.well-known/assetlinks.json'),
    'next.config.js must configure headers for assetlinks.json'
  );
  assert.ok(
    content.includes('application/json'),
    'next.config.js must configure application/json for assetlinks'
  );
});

test('Startup Splash Screen - Component and detection logic meet all specs', () => {
  const splashPath = path.join(frontendDir, 'src', 'components', 'SplashScreen.tsx');
  assert.ok(fs.existsSync(splashPath), 'SplashScreen.tsx must exist');

  const splashContent = fs.readFileSync(splashPath, 'utf8');

  // Must detect standalone mode and android-app:// referrer
  assert.ok(
    splashContent.includes('(display-mode: standalone)'),
    'SplashScreen must detect (display-mode: standalone)'
  );
  assert.ok(
    splashContent.includes('android-app://'),
    'SplashScreen must detect android-app:// referrer'
  );

  // Must use sessionStorage wrapped in try/catch to show once per app launch
  assert.ok(
    splashContent.includes('sessionStorage.getItem'),
    'SplashScreen must check sessionStorage'
  );
  assert.ok(
    splashContent.includes('sessionStorage.setItem'),
    'SplashScreen must write sessionStorage'
  );
  assert.ok(
    splashContent.includes('try') && splashContent.includes('catch'),
    'SplashScreen must wrap storage in try/catch'
  );

  // Must use existing logo
  assert.ok(
    splashContent.includes('/logo/image_21332e.jpg'),
    'SplashScreen must use existing logo /logo/image_21332e.jpg'
  );

  // Timing: ~2s duration, 300ms fadeout, safety <= 3s
  assert.ok(
    splashContent.includes('1800') || splashContent.includes('2000'),
    'SplashScreen must trigger fadeout around 1.8-2.0s'
  );
  assert.ok(
    splashContent.includes('duration-300'),
    'SplashScreen must use 300ms fadeout transition'
  );
  assert.ok(
    splashContent.includes('2800') || splashContent.includes('3000'),
    'SplashScreen must have safety timeout <= 3s'
  );
});

test('Startup Splash Screen - Root layout & CSS styles guarantee no white flash and respect motion settings', () => {
  const layoutPath = path.join(frontendDir, 'src', 'app', 'layout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(
    layoutContent.includes('<SplashScreen'),
    'layout.tsx must render SplashScreen in root layout'
  );
  assert.ok(
    layoutContent.includes('(display-mode: standalone)'),
    'layout.tsx head must check standalone mode synchronously'
  );
  assert.ok(
    layoutContent.includes('neobattle_splash_shown'),
    'layout.tsx head must check sessionStorage'
  );

  const cssPath = path.join(frontendDir, 'src', 'app', 'globals.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // html/body background #000 in standalone
  assert.ok(
    cssContent.includes('@media (display-mode: standalone)') && cssContent.includes('#000000 !important'),
    'globals.css must set html/body background to #000000 !important for standalone mode'
  );

  // Shine sweep animation
  assert.ok(
    cssContent.includes('splash-shine-sweep'),
    'globals.css must define splash-shine-sweep keyframes'
  );
  assert.ok(
    cssContent.includes('splash-logo-container::after') || cssContent.includes('.splash-logo-container::after'),
    'globals.css must have splash-logo-container::after shine sweep'
  );

  // Pulsing glow
  assert.ok(
    cssContent.includes('splash-pulse-glow'),
    'globals.css must define splash-pulse-glow keyframes'
  );

  // Prefers-reduced-motion
  assert.ok(
    cssContent.includes('prefers-reduced-motion: reduce'),
    'globals.css must respect prefers-reduced-motion: reduce'
  );
});
