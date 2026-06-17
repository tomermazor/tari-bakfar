const CACHE = 'app-v114';
const SHELL = ['./index.html', './tari-bakfar.html', './orders.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(url => new Request(url, {cache: 'no-store'})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;

  // Network-first for HTML pages → always get the latest version
  // Falls back to cache only when offline
  const accept = e.request.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    e.respondWith(
      fetch(new Request(e.request, {cache: 'no-store'}))
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (fonts, icons, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
