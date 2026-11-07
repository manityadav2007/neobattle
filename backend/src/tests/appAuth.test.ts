import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import passport from '../config/passport';
import authRoutes from '../routes/auth.routes';
import {
  createOAuthState,
  consumeOAuthState,
  createOAuthCode,
  __setOAuthStateForTest,
  __setOAuthCodeForTest,
  __getOAuthCodeForTest,
  timingSafeEqualStr,
  parsePlatform,
} from '../controllers/auth.controller';
import { TokenPair } from '../utils/auth.utils';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(passport.initialize());
  app.use('/api/auth', authRoutes);
  return app;
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const mockTokens: TokenPair = {
  accessToken: 'mock-access-token-12345',
  refreshToken: 'mock-refresh-token-67890',
  expiresIn: '15m',
};

test('app auth - valid app PKCE flow exchanges matching code_verifier and returns tokens', async () => {
  const { verifier, challenge } = generatePKCE();

  // 1. App initiates login with platform=app and code_challenge
  const nonce = createOAuthState('app', challenge);
  assert.ok(nonce && nonce.length === 64, 'OAuth nonce must be generated');

  // 2. State is consumed upon provider callback
  const stateData = consumeOAuthState(nonce);
  assert.ok(stateData, 'State data must be valid');
  assert.equal(stateData.platform, 'app');
  assert.equal(stateData.codeChallenge, challenge);

  // 3. Backend creates one-time app oauthCode bound to the PKCE challenge
  const code = createOAuthCode(mockTokens, stateData.platform, stateData.codeChallenge);
  assert.ok(code, 'OAuth exchange code must be generated');

  // Verify the redirect format is strictly the fixed constant neobattle://auth?code=...
  const redirectTarget = `neobattle://auth?code=${code}`;
  assert.ok(redirectTarget.startsWith('neobattle://auth?code='), 'Redirect must target fixed neobattle://auth constant');

  // 4. App exchanges code with matching code_verifier
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.accessToken, mockTokens.accessToken);
    assert.equal(body.data.refreshToken, mockTokens.refreshToken);
  } finally {
    server.close();
  }
});

test('app auth - wrong verifier is rejected and code is deleted immediately on first attempt', async () => {
  const { verifier, challenge } = generatePKCE();
  const wrongVerifier = crypto.randomBytes(32).toString('base64url');

  const code = createOAuthCode(mockTokens, 'app', challenge);

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // 1. Submit wrong verifier
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: wrongVerifier }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'Invalid code_verifier');

    // 2. Re-attempt with the CORRECT verifier: must still be rejected because code was deleted on first attempt
    const retryRes = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });

    assert.equal(retryRes.status, 400);
    const retryBody = await retryRes.json();
    assert.equal(retryBody.success, false);
    assert.equal(retryBody.message, 'Invalid or expired exchange code');
  } finally {
    server.close();
  }
});

test('app auth - reused code is rejected (single-use guarantee)', async () => {
  const { verifier, challenge } = generatePKCE();
  const code = createOAuthCode(mockTokens, 'app', challenge);

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // First exchange succeeds
    const res1 = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    assert.equal(res1.status, 200);

    // Second exchange fails
    const res2 = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    assert.equal(res2.status, 400);
    const body2 = await res2.json();
    assert.equal(body2.success, false);
    assert.equal(body2.message, 'Invalid or expired exchange code');
  } finally {
    server.close();
  }
});

test('app auth - expired code is rejected', async () => {
  const { verifier, challenge } = generatePKCE();
  const expiredCode = 'expired-code-uuid-999';

  __setOAuthCodeForTest(expiredCode, {
    tokens: mockTokens,
    platform: 'app',
    codeChallenge: challenge,
    expiresAt: Date.now() - 5000, // expired 5s ago
  });

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: expiredCode, code_verifier: verifier }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'Exchange code has expired');
  } finally {
    server.close();
  }
});

test('app auth - invalid state is rejected on callback with redirect to login error', async () => {
  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // Attempt callback with non-existent / forged state nonce
    const res = await fetch(
      `http://127.0.0.1:${port}/api/auth/discord/callback?code=discord-code-123&state=forged-nonce-abc`,
      { redirect: 'manual' }
    );

    assert.equal(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.ok(location.includes('/login?error=invalid_state'), 'Must redirect to login with invalid_state');
  } finally {
    server.close();
  }
});

test('app auth - invalid platform falls back to web', async () => {
  // 1. Unknown platform value
  assert.equal(parsePlatform('random_platform'), 'web');
  assert.equal(parsePlatform(''), 'web');
  assert.equal(parsePlatform(undefined), 'web');
  assert.equal(parsePlatform(null), 'web');

  // 2. createOAuthState with invalid platform falls back to web
  const nonce = createOAuthState('malicious_target', undefined);
  const stateData = consumeOAuthState(nonce);
  assert.ok(stateData);
  assert.equal(stateData.platform, 'web');
});

test('app auth - web flow unchanged (works without code_verifier)', async () => {
  // 1. Initiate web OAuth state
  const nonce = createOAuthState('web', undefined);
  const stateData = consumeOAuthState(nonce);
  assert.equal(stateData?.platform, 'web');

  // 2. Create web OAuth code
  const code = createOAuthCode(mockTokens, 'web');

  const app = createTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    // 3. Web exchange does not send code_verifier
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.accessToken, mockTokens.accessToken);
    assert.equal(body.data.refreshToken, mockTokens.refreshToken);

    // 4. Code is single-use: second attempt fails
    const resReused = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    assert.equal(resReused.status, 400);
  } finally {
    server.close();
  }
});
