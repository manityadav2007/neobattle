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
  assert.equal(manifest.background_color, '#000000');
  assert.equal(manifest.theme_color, '#000000');

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

  // html/body background #000000 in standalone
  assert.ok(
    cssContent.includes('@media (display-mode: standalone)') && cssContent.includes('#000000 !important'),
    'globals.css must set html/body background to #000000 !important for standalone mode'
  );

  // Vertical scrolling must stay enabled in normal browsers
  assert.ok(
    cssContent.includes('overflow-y: auto'),
    'globals.css must keep vertical scrolling enabled'
  );
  assert.ok(
    cssContent.includes('min-height: 100%'),
    'globals.css must use min-height instead of fixed heights'
  );

  // Standalone root wrappers must remain naturally scrollable without touch-action locks
  const standaloneIndex = cssContent.indexOf('@media (display-mode: standalone)');
  assert.ok(standaloneIndex !== -1, 'globals.css must contain a standalone media query');

  const standaloneStyles = cssContent.slice(standaloneIndex);
  assert.ok(
    !standaloneStyles.includes('touch-action'),
    'standalone styles must not set touch-action because it breaks Android Chromium scrolling'
  );

  for (const rule of [
    'height: auto !important',
    'min-height: 100% !important',
    'overflow-x: hidden !important',
    '-webkit-overflow-scrolling: touch !important',
  ]) {
    assert.ok(
      standaloneStyles.includes(rule),
      `standalone root wrappers must include ${rule}`
    );
  }

  const globalStyles = cssContent.slice(0, standaloneIndex);
  assert.ok(
    !globalStyles.includes('overscroll-behavior-y'),
    'overscroll-behavior-y must not apply to normal browsers'
  );
  assert.ok(
    !globalStyles.includes('touch-action'),
    'touch-action must not apply to normal browsers'
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

test('App-only UI - consistent chrome across all pages with dedicated app home content', () => {
  const hookPath = path.join(frontendDir, 'src', 'hooks', 'useIsApp.ts');
  const appHomePath = path.join(frontendDir, 'src', 'components', 'app', 'AppHomeScreen.tsx');
  const appMainPath = path.join(frontendDir, 'src', 'components', 'AppMain.tsx');
  const pagePath = path.join(frontendDir, 'src', 'app', 'page.tsx');
  const navbarPath = path.join(frontendDir, 'src', 'components', 'Navbar.tsx');
  const bottomNavPath = path.join(frontendDir, 'src', 'components', 'BottomNav.tsx');

  assert.ok(fs.existsSync(hookPath), 'useIsApp.ts must exist');
  assert.ok(fs.existsSync(appHomePath), 'AppHomeScreen.tsx must exist');
  assert.ok(fs.existsSync(appMainPath), 'AppMain.tsx must exist');

  const hook = fs.readFileSync(hookPath, 'utf8');
  assert.ok(
    hook.includes('(display-mode: standalone)'),
    'app detection must check display-mode standalone'
  );
  assert.ok(hook.includes('standalone'), 'app detection must support navigator.standalone');
  assert.ok(hook.includes('android-app://'), 'app detection must support Android referrer');
  assert.ok(hook.includes('NeoBattleApp'), 'app detection must support NeoBattleApp user agent marker');
  assert.ok(hook.includes('Capacitor'), 'app detection must support window.Capacitor');

  const navbar = fs.readFileSync(navbarPath, 'utf8');
  for (const required of [
    'About & Policies',
    'Terms & Conditions',
    'Privacy Policy',
    'Refund Policy',
    'Fair Play Policy',
    'Prize Policy',
    'Disclaimer',
    '/dashboard',
    '/wallet',
    '/settings',
    '/help-feedback',
    '/?tab=mine',
    'Logout',
    'v1.0.0',
  ]) {
    assert.ok(navbar.includes(required), `Navbar menu must include ${required}`);
  }

  const appHome = fs.readFileSync(appHomePath, 'utf8');
  for (const required of [
    'My Matches',
    'Upcoming',
    '/wallet',
    '/tournaments',
    'glass-card',
    'rounded-2xl',
    'gradient-text',
    'btn-fire',
  ]) {
    assert.ok(appHome.includes(required), `AppHomeScreen must include ${required}`);
  }

  // Ensure (i) info button is removed from home screen
  assert.ok(
    !appHome.includes('SettingsAboutSheet'),
    'AppHomeScreen must not import or use SettingsAboutSheet'
  );

  // Consistent Chrome: Navbar and BottomNav are NOT hidden on app-home
  assert.ok(!navbar.includes("isApp && pathname === '/'"), 'Navbar must stay visible on app home');

  const bottomNav = fs.readFileSync(bottomNavPath, 'utf8');
  assert.ok(!bottomNav.includes("isApp && pathname === '/'"), 'BottomNav must stay visible on app home');
  for (const tab of ['Home', 'Tournaments', 'Esports', 'Stats', 'Shop']) {
    assert.ok(bottomNav.includes(tab), `BottomNav must contain ${tab} tab`);
  }

  const layoutPath = path.join(frontendDir, 'src', 'app', 'layout.tsx');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  assert.ok(
    layout.includes("classList.add('app-mode')") && layout.includes("classList.add('app-home')"),
    'layout bootstrap must tag the document as app mode / app home'
  );
  assert.ok(
    layout.includes("window.location.pathname==='/'"),
    'layout bootstrap must only apply app-home on the homepage'
  );

  const page = fs.readFileSync(pagePath, 'utf8');
  assert.ok(page.includes('website-home'), 'website home must be marked for app-only hiding');
  assert.ok(page.includes('<WebsiteHome />'), 'normal browsers must still render WebsiteHome');
  assert.ok(page.includes('<AppHomeScreen />'), 'app mode must render AppHomeScreen');

  const appMain = fs.readFileSync(appMainPath, 'utf8');
  assert.ok(
    appMain.includes('min-h-screen pt-16 md:pl-20 pb-20 md:pb-0 max-w-full overflow-x-hidden'),
    'main padding must provide top bar offset and bottom nav clearance'
  );

  const cssPath = path.join(frontendDir, 'src', 'app', 'globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(
    css.includes('html.app-mode') && css.includes('-webkit-tap-highlight-color: transparent'),
    'app mode must remove the blue tap highlight'
  );
  assert.ok(
    css.includes('html.app-home .website-home'),
    'globals.css must hide website-home in app home'
  );
  // Chrome must NOT be hidden
  assert.ok(
    !css.includes('html.app-home .site-navbar'),
    'globals.css must not hide site-navbar'
  );
  assert.ok(
    !css.includes('html.app-home .site-bottom-nav'),
    'globals.css must not hide site-bottom-nav'
  );
});

test('Zero White Flash - Server-rendered black background, color-scheme, manifest, and auth loading skeleton', () => {
  const layoutPath = path.join(frontendDir, 'src', 'app', 'layout.tsx');
  const layout = fs.readFileSync(layoutPath, 'utf8');

  // Static meta color-scheme
  assert.ok(
    layout.includes('<meta name="color-scheme" content="dark" />') ||
      layout.includes('color-scheme') && layout.includes('dark'),
    'layout must include static meta color-scheme dark'
  );

  // Static html style background:#000;color-scheme:dark
  assert.ok(
    layout.includes("style={{ background: '#000', colorScheme: 'dark' }}") ||
      layout.includes("background: '#000'") && layout.includes("colorScheme: 'dark'"),
    'html tag must have inline style background #000 and colorScheme dark'
  );

  // Static body style background:#000
  assert.ok(
    layout.includes("style={{ background: '#000' }}"),
    'body tag must have inline style background #000'
  );

  // Inline <style> in <head> for instant black first paint
  assert.ok(
    layout.includes('html,body{background:#000') && layout.includes('color-scheme:dark'),
    'head must include inline style for html,body black background and color-scheme dark'
  );

  // Theme color #000000 in meta and viewport
  assert.ok(
    layout.includes('content="#000000"') || layout.includes("themeColor: '#000000'"),
    'layout must set theme-color to #000000'
  );

  // Manifests must maintain #000000 background and theme color
  const webmanifest = JSON.parse(
    fs.readFileSync(path.join(frontendDir, 'public', 'manifest.webmanifest'), 'utf8')
  );
  assert.equal(webmanifest.background_color, '#000000');
  assert.equal(webmanifest.theme_color, '#000000');

  const jsonManifest = JSON.parse(
    fs.readFileSync(path.join(frontendDir, 'public', 'manifest.json'), 'utf8')
  );
  assert.equal(jsonManifest.background_color, '#000000');
  assert.equal(jsonManifest.theme_color, '#000000');

  // Loading and Global Error boundaries exist and have black background
  const loadingPath = path.join(frontendDir, 'src', 'app', 'loading.tsx');
  assert.ok(fs.existsSync(loadingPath), 'loading.tsx must exist');
  const loadingContent = fs.readFileSync(loadingPath, 'utf8');
  assert.ok(
    loadingContent.includes('#000') || loadingContent.includes('bg-black'),
    'loading.tsx must have black background'
  );

  const globalErrorPath = path.join(frontendDir, 'src', 'app', 'global-error.tsx');
  assert.ok(fs.existsSync(globalErrorPath), 'global-error.tsx must exist');
  const globalErrorContent = fs.readFileSync(globalErrorPath, 'utf8');
  assert.ok(
    globalErrorContent.includes('#000') || globalErrorContent.includes('bg-black'),
    'global-error.tsx must have black background'
  );
  assert.ok(
    globalErrorContent.includes('color-scheme') || globalErrorContent.includes('colorScheme'),
    'global-error.tsx must have dark color-scheme'
  );

  // Home page app screen must display skeleton while authLoading
  const appHomePath = path.join(frontendDir, 'src', 'components', 'app', 'AppHomeScreen.tsx');
  const appHome = fs.readFileSync(appHomePath, 'utf8');
  assert.ok(
    appHome.includes('authLoading ?') && appHome.includes('animate-pulse'),
    'AppHomeScreen must display skeleton during authLoading'
  );
});

test('Capacitor Android wrapper - /mobile structure, config, theme, and offline page', () => {
  const mobileDir = path.resolve(__dirname, '../../../mobile');
  assert.ok(fs.existsSync(mobileDir), 'mobile directory must exist');

  const configPath = path.join(mobileDir, 'capacitor.config.json');
  assert.ok(fs.existsSync(configPath), 'capacitor.config.json must exist');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.appId, 'live.neobattle.twa');
  assert.equal(config.appName, 'NeoBattle');
  assert.equal(config.server?.url, 'https://neobattle.live');
  assert.equal(config.server?.cleartext, false);
  assert.deepEqual(config.server?.allowNavigation, ['neobattle.live', '*.neobattle.live']);
  assert.equal(config.server?.errorPath, 'offline.html');
  assert.equal(config.appendUserAgent, 'NeoBattleApp/1.0');
  assert.equal(config.backgroundColor, '#000000');
  assert.equal(config.plugins?.SplashScreen?.backgroundColor, '#000000');
  assert.equal(config.plugins?.StatusBar?.backgroundColor, '#000000');

  // Offline screen bundled
  const offlinePath = path.join(mobileDir, 'www', 'offline.html');
  assert.ok(fs.existsSync(offlinePath), 'mobile/www/offline.html must exist');
  const offlineContent = fs.readFileSync(offlinePath, 'utf8');
  assert.ok(offlineContent.includes('No internet connection'), 'offline page must include heading');
  assert.ok(offlineContent.includes('Connect to the internet and try again'), 'offline page must include message');
  assert.ok(offlineContent.includes('Retry'), 'offline page must include retry button');
  assert.ok(offlineContent.includes('#000000'), 'offline page must have black theme');

  // Android build.gradle
  const buildGradlePath = path.join(mobileDir, 'android', 'app', 'build.gradle');
  assert.ok(fs.existsSync(buildGradlePath), 'android/app/build.gradle must exist');
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
  assert.ok(buildGradle.includes('versionCode 3'), 'build.gradle must specify versionCode 3');
  assert.ok(buildGradle.includes('versionName "1.1.0"'), 'build.gradle must specify versionName 1.1.0');
  assert.ok(buildGradle.includes('applicationId "live.neobattle.twa"'), 'applicationId must be live.neobattle.twa');

  // Android MainActivity & back button / links
  const mainActivityPath = path.join(
    mobileDir,
    'android',
    'app',
    'src',
    'main',
    'java',
    'live',
    'neobattle',
    'twa',
    'MainActivity.java'
  );
  assert.ok(fs.existsSync(mainActivityPath), 'MainActivity.java must exist');
  const mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
  assert.ok(mainActivity.includes('handleOnBackPressed'), 'MainActivity must handle back button');
  assert.ok(mainActivity.includes('shouldOverrideUrlLoading'), 'MainActivity must intercept external links');
  assert.ok(mainActivity.includes('Color.BLACK'), 'MainActivity must set WebView background to black');

  // Android colors and styles
  const colorsPath = path.join(mobileDir, 'android', 'app', 'src', 'main', 'res', 'values', 'colors.xml');
  assert.ok(fs.existsSync(colorsPath), 'colors.xml must exist');
  const colors = fs.readFileSync(colorsPath, 'utf8');
  assert.ok(colors.includes('#000000'), 'colors.xml must define #000000');

  const stylesPath = path.join(mobileDir, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
  assert.ok(fs.existsSync(stylesPath), 'styles.xml must exist');
  const styles = fs.readFileSync(stylesPath, 'utf8');
  assert.ok(styles.includes('@color/black'), 'styles.xml must use @color/black for window background');
});



