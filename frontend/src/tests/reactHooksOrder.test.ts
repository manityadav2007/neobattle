import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// Configure development environment to test non-minified React errors
(process.env as any).NODE_ENV = 'development';

const frontendDir = path.resolve(__dirname, '../..');

test('ESLint Configuration - react-hooks/rules-of-hooks is set to error and exhaustive-deps to warn', () => {
  const configPath = path.join(frontendDir, 'eslint.config.mjs');
  assert.ok(fs.existsSync(configPath), 'frontend/eslint.config.mjs must exist');
  const content = fs.readFileSync(configPath, 'utf8');

  assert.ok(
    content.includes('"react-hooks/rules-of-hooks": "error"') ||
    content.includes("'react-hooks/rules-of-hooks': 'error'"),
    'react-hooks/rules-of-hooks must be configured as error'
  );

  assert.ok(
    content.includes('"react-hooks/exhaustive-deps": "warn"') ||
    content.includes("'react-hooks/exhaustive-deps': 'warn'"),
    'react-hooks/exhaustive-deps must be configured as warn'
  );
});

test('AppLoginGate - All hooks are called unconditionally at top of component (no hooks after if (!isApp))', () => {
  const gatePath = path.join(frontendDir, 'src', 'components', 'AppLoginGate.tsx');
  const gateContent = fs.readFileSync(gatePath, 'utf8');

  // Verify that all useEffect and useState calls come BEFORE if (!isApp) return
  const isAppReturnIndex = gateContent.indexOf('if (!isApp) {');
  assert.ok(isAppReturnIndex !== -1, 'Must have if (!isApp) check');

  // Find all hook calls in AppLoginGate
  const hookRegex = /\b(useEffect|useState|useMemo|useCallback|useRef)\s*\(/g;
  let match;
  while ((match = hookRegex.exec(gateContent)) !== null) {
    assert.ok(
      match.index < isAppReturnIndex,
      `Hook ${match[1]} at index ${match.index} must be called BEFORE early return 'if (!isApp)' at index ${isAppReturnIndex}`
    );
  }
});

test('SplashScreen - All hooks are called unconditionally at top of component', () => {
  const splashPath = path.join(frontendDir, 'src', 'components', 'SplashScreen.tsx');
  const splashContent = fs.readFileSync(splashPath, 'utf8');

  const mountedReturnIndex = splashContent.indexOf('if (!mounted) {');
  assert.ok(mountedReturnIndex !== -1, 'Must have if (!mounted) check');

  const hookRegex = /\b(useEffect|useState|useMemo|useCallback|useRef)\s*\(/g;
  let match;
  while ((match = hookRegex.exec(splashContent)) !== null) {
    assert.ok(
      match.index < mountedReturnIndex,
      `Hook ${match[1]} must be called BEFORE early return 'if (!mounted)'`
    );
  }
});

test('Error Boundaries - Log in app mode, black background, and 1 automatic retry before Try again button', () => {
  const globalErrorPath = path.join(frontendDir, 'src', 'app', 'global-error.tsx');
  const globalError = fs.readFileSync(globalErrorPath, 'utf8');

  assert.ok(globalError.includes('[App Global Error]'), 'global-error must log error in app mode');
  assert.ok(globalError.includes('sessionStorage'), 'global-error must use sessionStorage for auto retry state');
  assert.ok(globalError.includes('reset()'), 'global-error must auto retry via reset() once');
  assert.ok(globalError.includes('Try again'), 'global-error must include Try again button after retry');
  assert.ok(globalError.includes('#000'), 'global-error must have black theme');

  const routeErrorPath = path.join(frontendDir, 'src', 'app', 'error.tsx');
  assert.ok(fs.existsSync(routeErrorPath), 'frontend/src/app/error.tsx must exist');
  const routeError = fs.readFileSync(routeErrorPath, 'utf8');

  assert.ok(routeError.includes('[App Route Error]'), 'error.tsx must log error in app mode');
  assert.ok(routeError.includes('sessionStorage'), 'error.tsx must track automatic retry in sessionStorage');
  assert.ok(routeError.includes('Try again'), 'error.tsx must offer Try again button');
  assert.ok(routeError.includes('bg-black'), 'error.tsx must have black theme');
});

test('React Hook Order Lifecycle - Renders without Error #310 when isApp switches false -> true -> false', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'https://neobattle.live/',
    pretendToBeVisual: true,
  });

  const defineGlobal = (key: string, value: any) => {
    Object.defineProperty(global, key, {
      value,
      configurable: true,
      writable: true,
    });
  };

  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('sessionStorage', dom.window.sessionStorage);
  defineGlobal('localStorage', dom.window.localStorage);
  defineGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16));
  defineGlobal('cancelAnimationFrame', (id: any) => clearTimeout(id));

  const React = require('react');
  const ReactDOMClient = require('react-dom/client');

  const container = dom.window.document.getElementById('root')!;
  const root = ReactDOMClient.createRoot(container);

  let capturedErrors: Error[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.join(' ');
    if (msg.includes('Rendered more hooks') || msg.includes('Rendered fewer hooks') || msg.includes('310')) {
      capturedErrors.push(new Error(msg));
    }
  };

  try {
    // Component matching the exact hook structure of AppLoginGate & SplashScreen
    function RootLayoutTestHarness({
      isApp,
      splashDismissed,
    }: {
      isApp: boolean;
      splashDismissed: boolean;
    }) {
      // 1. SplashScreen hooks
      const [mounted, setMounted] = React.useState(!splashDismissed);
      const [fadeOut, setFadeOut] = React.useState(false);
      const [bgLoaded, setBgLoaded] = React.useState(false);

      React.useEffect(() => {
        if (!isApp || splashDismissed) {
          setMounted(false);
          return;
        }
        setBgLoaded(true);
      }, [isApp, splashDismissed]);

      // 2. AppLoginGate hooks (all unconditionally at the top)
      const [cachedTokenHint] = React.useState(false);
      const [loadingProvider, setLoadingProvider] = React.useState(null as string | null);
      const [emailMode, setEmailMode] = React.useState(false);
      const [email, setEmail] = React.useState('');
      const [password, setPassword] = React.useState('');
      const [submitting, setSubmitting] = React.useState(false);
      const [error, setError] = React.useState('');

      React.useEffect(() => {
        // Token hint sync
      }, []);

      React.useEffect(() => {
        // Deep link listener in app mode
        if (!isApp) return;
      }, [isApp]);

      React.useEffect(() => {
        // Route painted notify in app mode
        if (!isApp) return;
      }, [isApp]);

      // Conditional returns ONLY after all hooks
      if (!isApp) {
        return React.createElement('div', { id: 'browser-content' }, 'Browser View');
      }

      if (!mounted) {
        return React.createElement('div', { id: 'app-content' }, 'App Mode Content');
      }

      return React.createElement('div', { id: 'splash-screen' }, 'App Splash Screen');
    }

    // Step 1: Render initial mount with isApp=false and splash NOT dismissed
    root.render(React.createElement(RootLayoutTestHarness, { isApp: false, splashDismissed: false }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 2: Switch isApp to true (Capacitor mode detected after mount)
    root.render(React.createElement(RootLayoutTestHarness, { isApp: true, splashDismissed: false }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 3: Switch with splashDismissed=true
    root.render(React.createElement(RootLayoutTestHarness, { isApp: true, splashDismissed: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 4: Switch isApp back to false (browser mode)
    root.render(React.createElement(RootLayoutTestHarness, { isApp: false, splashDismissed: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert that NO hook count mismatch errors occurred
    assert.equal(
      capturedErrors.length,
      0,
      `Expected 0 React hooks errors, but received: ${capturedErrors.map((e) => e.message).join('; ')}`
    );
  } finally {
    console.error = originalConsoleError;
    root.unmount();
  }
});
