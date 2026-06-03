// foursome-games — Service Worker v6.4
// Precaches app shell for offline use. Cache name includes version so
// old caches are cleaned up automatically on SW update.

const CACHE_NAME = 'foursome-games-v6.4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
];

// On install: precache all app shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// On activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// On fetch: cache-first for app shell, network-first for Firebase/GHIN
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for Firebase, GHIN proxy, and fonts
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // let browser handle — don't intercept
  }

  // Cache-first for same-origin assets (app shell)
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          // Cache successful same-origin GET responses
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
      )
  );
});
