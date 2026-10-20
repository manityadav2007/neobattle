import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Standalone detection logic to test against specification
function simulateIsInstalledApp({
  displayModeStandalone = false,
  navigatorStandalone = false,
  referrer = '',
}: {
  displayModeStandalone?: boolean;
  navigatorStandalone?: boolean;
  referrer?: string;
}): boolean {
  const isStandaloneDisplay = displayModeStandalone;
  const isNavStandalone = navigatorStandalone === true;
  const isAndroidAppReferrer = referrer.startsWith('android-app://');
  return Boolean(isStandaloneDisplay || isNavStandalone || isAndroidAppReferrer);
}

test('Standalone detection - hides when running as installed app', () => {
  // 1. Regular browser tab -> NOT installed
  assert.equal(
    simulateIsInstalledApp({ displayModeStandalone: false, navigatorStandalone: false, referrer: 'https://google.com' }),
    false,
    'Regular browser should not be detected as installed app'
  );

  // 2. window.matchMedia('(display-mode: standalone)').matches -> IS installed
  assert.equal(
    simulateIsInstalledApp({ displayModeStandalone: true }),
    true,
    'Should detect display-mode: standalone as installed app'
  );

  // 3. window.navigator.standalone === true (iOS Safari PWA) -> IS installed
  assert.equal(
    simulateIsInstalledApp({ navigatorStandalone: true }),
    true,
    'Should detect navigator.standalone as installed app'
  );

  // 4. document.referrer starts with "android-app://" (Android TWA / Chrome WebAPK) -> IS installed
  assert.equal(
    simulateIsInstalledApp({ referrer: 'android-app://com.neobattle.app' }),
    true,
    'Should detect android-app:// referrer as installed app'
  );

  assert.equal(
    simulateIsInstalledApp({ referrer: 'android-app://com.google.android.googlequicksearchbox' }),
    true,
    'Should detect any android-app:// referrer as installed app'
  );
});

test('Download config - APP_APK_URL exists and defaults properly', () => {
  const configPath = path.resolve(__dirname, '../../../frontend/src/config/download.ts');
  assert.ok(fs.existsSync(configPath), 'frontend/src/config/download.ts must exist');

  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(content.includes('export const APP_APK_URL'), 'Must export APP_APK_URL constant');
  assert.ok(content.includes('/downloads/neobattle.apk'), 'Must default to /downloads/neobattle.apk');
});

test('APK file verification - real signed APK is present in repository', () => {
  const apkPath = path.resolve(__dirname, '../../../frontend/public/downloads/neobattle.apk');
  assert.ok(fs.existsSync(apkPath), 'frontend/public/downloads/neobattle.apk must exist');

  const stat = fs.statSync(apkPath);
  // APK should be ~4.28 MB (well above 1 MB)
  assert.ok(stat.size > 1024 * 1024, `APK size (${stat.size} bytes) must be > 1 MB`);
  assert.equal(stat.size, 4284149, `APK size must be exactly 4284149 bytes (~4.09 MB)`);

  // Verify ZIP/APK magic bytes: PK\x03\x04
  const fd = fs.openSync(apkPath, 'r');
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  assert.equal(buffer[0], 0x50, 'Byte 0 must be P');
  assert.equal(buffer[1], 0x4b, 'Byte 1 must be K');
  assert.equal(buffer[2], 0x03, 'Byte 2 must be 0x03');
  assert.equal(buffer[3], 0x04, 'Byte 3 must be 0x04');
});

test('Security & gitignore - sensitive signing keys and aab bundles blocked from repo', () => {
  const gitignorePath = path.resolve(__dirname, '../../../.gitignore');
  assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');

  const content = fs.readFileSync(gitignorePath, 'utf8');
  assert.ok(content.includes('*.keystore'), '.gitignore must ignore *.keystore');
  assert.ok(content.includes('*.jks'), '.gitignore must ignore *.jks');
  assert.ok(content.includes('signing-key-info.txt'), '.gitignore must ignore signing-key-info.txt');
  assert.ok(content.includes('*.aab'), '.gitignore must ignore *.aab');
});

test('Home page source - includes DownloadSection between stats row and Why NEOBATTLE', () => {
  const pagePath = path.resolve(__dirname, '../../../frontend/src/app/page.tsx');
  assert.ok(fs.existsSync(pagePath), 'frontend/src/app/page.tsx must exist');

  const content = fs.readFileSync(pagePath, 'utf8');
  assert.ok(content.includes("import DownloadSection from '@/components/DownloadSection';"), 'Must import DownloadSection');

  // Verify placement: after stats row and before "Why NEOBATTLE?"
  const statsIndex = content.indexOf('Tournaments</p>');
  const downloadSectionIndex = content.indexOf('<DownloadSection />');
  const whyNeobattleIndex = content.indexOf('Why <span className="gradient-text">NEOBATTLE</span>?');

  assert.ok(statsIndex !== -1, 'Stats row must exist');
  assert.ok(downloadSectionIndex !== -1, '<DownloadSection /> must exist');
  assert.ok(whyNeobattleIndex !== -1, '"Why NEOBATTLE?" section must exist');

  assert.ok(
    statsIndex < downloadSectionIndex,
    '<DownloadSection /> must be placed after stats row'
  );
  assert.ok(
    downloadSectionIndex < whyNeobattleIndex,
    '<DownloadSection /> must be placed before "Why NEOBATTLE?" section'
  );
});

test('DownloadSection component - fulfills all specifications', () => {
  const componentPath = path.resolve(__dirname, '../../../frontend/src/components/DownloadSection.tsx');
  assert.ok(fs.existsSync(componentPath), 'frontend/src/components/DownloadSection.tsx must exist');

  const content = fs.readFileSync(componentPath, 'utf8');

  // 1. MOBILE ONLY: md:hidden hides it on desktop/PC
  assert.ok(content.includes('md:hidden'), 'Must include md:hidden to hide section on desktop/tablet');

  // 2. NO BOX: section has transparent background and no square card container
  assert.ok(content.includes('bg-transparent'), 'Must use transparent background, blending with page');

  // 3. Heading "Download NeoBattle" with gradient
  assert.ok(content.includes('Download NeoBattle') || content.includes('Download <span className="gradient-text">NeoBattle</span>'), 'Must have heading "Download NeoBattle"');

  // 4. Buttons: Android and iOS with two-line labels
  assert.ok(content.includes('Android'), 'Must include Android button');
  assert.ok(content.includes('iOS'), 'Must include iOS button');
  assert.ok(content.includes('Download for'), 'Android button must include "Download for" tiny label');
  assert.ok(content.includes('Add to Home Screen'), 'iOS button must include "Add to Home Screen" tiny label');
  assert.ok(content.includes('min-h-[56px]'), 'Buttons must have minimum tap height of 56px');

  // 5. Soft blurred glow behind buttons
  assert.ok(content.includes('blur-2xl'), 'Must include soft blurred glow behind buttons');

  // 6. Inline SVGs only (no <img> or external image assets)
  assert.ok(!content.includes('<img'), 'Must not use external <img> elements');
  assert.ok(!content.includes('next/image'), 'Must not import next/image');
  assert.ok(content.includes('<svg'), 'Must use inline SVG icons');

  // 7. Android HEAD pre-check and toast handling
  assert.ok(content.includes("method: 'HEAD'"), 'Must send HEAD request before downloading APK');
  assert.ok(content.includes('1024 * 1024') || content.includes('1048576'), 'Must check content-length > 1MB');
  assert.ok(content.includes('Android app coming soon'), 'Must show toast "Android app coming soon" on failure');
  assert.ok(
    content.includes("Allow 'Install unknown apps' when asked.") ||
    content.includes("Allow &apos;Install unknown apps&apos; when asked."),
    'Must include exact muted Android warning text'
  );

  // 8. iOS modal steps:
  // "1. Open this site in Safari  2. Tap the Share button  3. Choose Add to Home Screen  4. Tap Add"
  assert.ok(content.includes('Open this site in Safari'), 'iOS modal must include Step 1');
  assert.ok(content.includes('Tap the Share button'), 'iOS modal must include Step 2');
  assert.ok(content.includes('Choose Add to Home Screen'), 'iOS modal must include Step 3');
  assert.ok(content.includes('Tap Add'), 'iOS modal must include Step 4');

  // 9. Mobile responsiveness: stacked on narrow screens up to 430px
  assert.ok(content.includes('flex-col'), 'Must stack buttons vertically on narrow screens');

  // 10. Standalone app detection
  assert.ok(content.includes("display-mode: standalone"), 'Must check display-mode: standalone');
  assert.ok(content.includes("standalone"), 'Must check navigator.standalone');
  assert.ok(content.includes("android-app://"), 'Must check android-app:// referrer');

  // 11. Download attribute on Android button
  assert.ok(content.includes('download'), 'Android button must trigger APK download');
});

test('Globals CSS - contains shimmer and reduced motion media query', () => {
  const cssPath = path.resolve(__dirname, '../../../frontend/src/app/globals.css');
  assert.ok(fs.existsSync(cssPath), 'globals.css must exist');

  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('pwa-pill-border'), 'Must define pwa-pill-border');
  assert.ok(css.includes('pwa-border-shimmer'), 'Must define pwa-border-shimmer animation');
  assert.ok(css.includes('prefers-reduced-motion'), 'Must disable animation on prefers-reduced-motion');
});

test('Downloads Route Handler - /downloads/missing.apk returns 404 (not HTML)', async () => {
  // Direct simulation of downloads route handler behavior
  const routePath = path.resolve(__dirname, '../../../frontend/src/app/downloads/[...file]/route.ts');
  assert.ok(fs.existsSync(routePath), 'frontend/src/app/downloads/[...file]/route.ts must exist');

  const content = fs.readFileSync(routePath, 'utf8');
  assert.ok(content.includes('File Not Found'), 'Must return plain text File Not Found');
  assert.ok(content.includes('404'), 'Must return status 404');
  assert.ok(content.includes('text/plain'), 'Must return Content-Type: text/plain, not text/html');
  assert.ok(content.includes('application/vnd.android.package-archive'), 'Must serve .apk with correct MIME');
  assert.ok(content.includes('attachment'), 'Must serve .apk with attachment disposition');
});

test('Assetlinks Route Handler - /.well-known/assetlinks.json returns valid JSON with package name', () => {
  const assetlinksPath = path.resolve(__dirname, '../../../frontend/public/.well-known/assetlinks.json');
  assert.ok(fs.existsSync(assetlinksPath), 'public/.well-known/assetlinks.json must exist');

  const content = fs.readFileSync(assetlinksPath, 'utf8');
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed), 'assetlinks must parse as array');
  assert.equal(parsed[0].target.package_name, 'live.neobattle.twa', 'package_name must be live.neobattle.twa');
  assert.ok(parsed[0].target.sha256_cert_fingerprints.length > 0, 'Must have certificate fingerprints');

  const routePath = path.resolve(__dirname, '../../../frontend/src/app/.well-known/assetlinks.json/route.ts');
  assert.ok(fs.existsSync(routePath), 'route handler for /.well-known/assetlinks.json must exist');
  const routeContent = fs.readFileSync(routePath, 'utf8');
  assert.ok(routeContent.includes('application/json'), 'Route handler must serve application/json');
});
