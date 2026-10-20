// NeoBattle Minimal Service Worker
// Strictly caches static assets (app shell, icons)
// NEVER caches API responses, auth tokens, payment or wallet pages.

const CACHE_NAME = 'neobattle-pwa-v1';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
];

// Sensitive or dynamic routes that must NEVER be intercepted, stored, or served from cache
const EXCLUDED_PATHS = [
  '/api/',
  '/auth/',
  '/wallet',
  '/payment',
  '/admin',
  '/downloads/',
  '/uploads/',
  '/dashboard/verify',
];

const EXCLUDED_PATTERNS = [
  /\/api\//i,
  /\/auth\//i,
  /\/wallet(\/.*)?$/i,
  /\/payment(\/.*)?$/i,
  /\/admin(\/.*)?$/i,
  /\/downloads\//i,
  /\/uploads\//i,
  /\/dashboard\/verify/i,
  /\/tournaments\/.*\/proof/i,
];

function isExcludedPath(url) {
  const path = url.pathname;
  return (
    EXCLUDED_PATHS.some((prefix) => path.startsWith(prefix) || path.includes(prefix)) ||
    EXCLUDED_PATTERNS.some((pattern) => pattern.test(path))
  );
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Pre-cache warning:', err);
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. Only process GET requests (POST, PUT, DELETE, etc. must never be touched)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // 3. Completely bypass API, auth, OAuth callbacks, payment, wallet, and admin
  if (isExcludedPath(url)) {
    return;
  }

  // 4. Handle navigation requests (Network-first with offline shell fallback for public pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/');
      })
    );
    return;
  }

  // 5. Handle static assets: Next.js bundles, icons, images, manifest
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/logo/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/favicon.ico';

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-while-revalidate for static assets
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return networkResponse;
        });
      })
    );
  }
});
