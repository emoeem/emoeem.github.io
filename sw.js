const CACHE_NAME = 'emoeem-blog-v3';
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/img/favicon.png',
  '/img/pwa-icon-192.png',
  '/img/pwa-icon-512.png',
  '/offline.html'
];
const MAX_ENTRIES = 120;
// 永不缓存：admin 后台与 API 响应必须始终走网络
const NEVER_CACHE = /^\/(?:api\/|admin\/)/;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) await cache.delete(key);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const path = new URL(event.request.url).pathname;
  if (NEVER_CACHE.test(path)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
          await trimCache(CACHE_NAME, MAX_ENTRIES);
        } catch (error) {
          console.error('Service Worker cache update failed:', error);
        }
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
      }
      return new Response('This resource is unavailable offline.', {
        status: 503,
        statusText: 'Offline'
      });
    }
  })());
});
