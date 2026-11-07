import { api, ApiResponse, setAuthTokens } from './api';

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates an RFC 7636 compliant PKCE code_verifier (>= 43 chars) and its SHA-256 base64url challenge.
 */
export async function generatePKCE(): Promise<{ code_verifier: string; code_challenge: string }> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Cryptography API is unavailable.');
  }

  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  const code_verifier = bufferToBase64Url(randomBytes);

  const encoder = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(code_verifier));
  const code_challenge = bufferToBase64Url(hashBuffer);

  try {
    sessionStorage.setItem('neobattle_pkce_verifier', code_verifier);
  } catch {
    // SessionStorage may be unavailable in strict private contexts
  }

  return { code_verifier, code_challenge };
}

/**
 * Starts OAuth flow using Capacitor Browser plugin (never embedded WebView).
 * If Browser plugin is missing or fails, throws an error so in-WebView login is never attempted.
 */
export async function startCapacitorOAuth(provider: 'google' | 'discord'): Promise<void> {
  let Browser: typeof import('@capacitor/browser').Browser | null = null;
  try {
    const mod = await import('@capacitor/browser');
    Browser = mod.Browser;
  } catch {
    throw new Error('In-app browser plugin is unavailable. OAuth login cannot be opened safely.');
  }

  if (!Browser || typeof Browser.open !== 'function') {
    throw new Error('In-app browser plugin is unavailable. OAuth login cannot be opened safely.');
  }

  const { code_challenge } = await generatePKCE();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const startUrl = `${apiUrl}/auth/${provider}?platform=app&code_challenge=${encodeURIComponent(code_challenge)}`;

  await Browser.open({
    url: startUrl,
    windowName: '_system',
  });
}

/**
 * Handles incoming neobattle://auth deep links, exchanges code with PKCE verifier,
 * and stores session tokens.
 */
export async function handleCapacitorDeepLink(
  rawUrl: string
): Promise<{ accessToken: string; refreshToken: string }> {
  if (!rawUrl || !rawUrl.startsWith('neobattle://auth')) {
    throw new Error('Invalid deep link protocol');
  }

  // Close external browser session immediately
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {}

  const url = new URL(rawUrl);
  const error = url.searchParams.get('error');
  if (error) {
    if (error === 'access_denied') {
      throw new Error('Sign-in was cancelled.');
    }
    if (error === 'invalid_state') {
      throw new Error('Session state verification failed. Please try again.');
    }
    throw new Error(`Authentication failed (${error}). Please try again.`);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code was returned.');
  }

  let code_verifier: string | null = null;
  try {
    code_verifier = sessionStorage.getItem('neobattle_pkce_verifier');
    sessionStorage.removeItem('neobattle_pkce_verifier');
  } catch {}

  if (!code_verifier) {
    throw new Error('PKCE verification code missing or expired. Please sign in again.');
  }

  const res = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
    '/auth/oauth-exchange',
    {
      code,
      code_verifier,
    }
  );

  const tokens = res.data?.data;
  if (!tokens?.accessToken || !tokens?.refreshToken) {
    throw new Error(res.data?.message || 'Authorization exchange failed.');
  }

  setAuthTokens(tokens.accessToken, tokens.refreshToken);
  return tokens;
}

/**
 * Registers an App URL open listener with @capacitor/app dynamically.
 */
export async function registerCapacitorAuthListener(
  onSuccess: (data: { accessToken: string; refreshToken: string }) => void,
  onError: (err: string) => void
): Promise<() => void> {
  try {
    const { App } = await import('@capacitor/app');

    const processUrl = async (url: string) => {
      if (!url || !url.startsWith('neobattle://auth')) return;
      try {
        const tokens = await handleCapacitorDeepLink(url);
        onSuccess(tokens);
      } catch (err: any) {
        onError(err.message || 'Authorization exchange failed.');
      }
    };

    const handle = await App.addListener('appUrlOpen', (event) => {
      if (event?.url) {
        processUrl(event.url);
      }
    });

    App.getLaunchUrl().then((launch) => {
      if (launch?.url) {
        processUrl(launch.url);
      }
    });

    return () => {
      handle.remove();
    };
  } catch {
    return () => {};
  }
}
