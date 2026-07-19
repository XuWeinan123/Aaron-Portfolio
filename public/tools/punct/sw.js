/* 标点修正 PWA 的 Service Worker:预缓存 + 网络优先(断网回退缓存)。 */
const CACHE = 'punct-v1';
const ASSETS = [
  '/tools/punct/',
  '/tools/punct/manifest.webmanifest',
  '/tools/punct/icon-192.png',
  '/tools/punct/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit ?? (request.mode === 'navigate' ? caches.match('/tools/punct/') : undefined))
      )
  );
});
