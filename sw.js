const CACHE_NAME = 'emoeem-blog-v2';
const CORE = ['/', '/manifest.webmanifest', '/favicon.png'];
const MAX_ENTRIES = 120;
// 永不缓存：admin 后台与 API 响应必须始终走网络
const NEVER_CACHE = /^\/(?:api\/|admin\/)/;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).then(() => trimCache(CACHE_NAME, MAX_ENTRIES));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))));
});
