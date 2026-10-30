/* Offline shell: cache app shell, queue clipboard PUTs, replay on reconnect. */
const CACHE = 'clipboard-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return; // PUT queue handled in app via localStorage outbox
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      if (request.url.startsWith(self.location.origin)) caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
