// Mint & Lime Pocket - Service Worker for PWA (v2: Network-first for faster updates)
const CACHE_NAME = 'mint-lime-pocket-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // API通信はキャッシュせず常に最新サーバーへ
  if (event.request.url.includes('/api/')) {
    return;
  }
  // HTML, CSS, JS はネットワーク優先（Network-first）で常に最新版を即時反映
  if (
    event.request.mode === 'navigate' ||
    event.request.url.endsWith('.html') ||
    event.request.url.includes('style.css') ||
    event.request.url.includes('script.js')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 画像などの静的アセットはキャッシュ優先
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
