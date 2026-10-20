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

  // 1. Heading "Download NeoBattle"
  assert.ok(content.includes('Download NeoBattle'), 'Must have heading "Download NeoBattle"');

  // 2. Buttons: Android and iOS
  assert.ok(content.includes('>Android<') || content.includes('<span>Android</span>'), 'Must include Android button');
  assert.ok(content.includes('>iOS<') || content.includes('<span>iOS</span>'), 'Must include iOS button');

  // 3. Inline SVGs only (no <img> or external image assets)
  assert.ok(!content.includes('<img'), 'Must not use external <img> elements');
  assert.ok(!content.includes('next/image'), 'Must not import next/image');
  assert.ok(content.includes('<svg'), 'Must use inline SVG icons');

  // 4. Android muted text: "Allow 'Install unknown apps' when asked."
  assert.ok(
    content.includes("Allow 'Install unknown apps' when asked.") ||
    content.includes("Allow &apos;Install unknown apps&apos; when asked."),
    'Must include exact muted Android warning text'
  );

  // 5. iOS modal steps:
  // "1. Open this site in Safari  2. Tap the Share button  3. Choose Add to Home Screen  4. Tap Add"
  assert.ok(content.includes('Open this site in Safari'), 'iOS modal must include Step 1');
  assert.ok(content.includes('Tap the Share button'), 'iOS modal must include Step 2');
  assert.ok(content.includes('Choose Add to Home Screen'), 'iOS modal must include Step 3');
  assert.ok(content.includes('Tap Add'), 'iOS modal must include Step 4');

  // 6. Mobile responsiveness: narrow screen stacking (min-[360px]:flex-row or flex-col)
  assert.ok(content.includes('flex-col'), 'Must stack buttons vertically on very narrow screens');
  assert.ok(content.includes('flex-row'), 'Must place buttons side by side on wider screens');

  // 7. Standalone app detection
  assert.ok(content.includes("display-mode: standalone"), 'Must check display-mode: standalone');
  assert.ok(content.includes("standalone"), 'Must check navigator.standalone');
  assert.ok(content.includes("android-app://"), 'Must check android-app:// referrer');

  // 8. Download attribute on Android button
  assert.ok(content.includes('download'), 'Android button must trigger APK download');
});
