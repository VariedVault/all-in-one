/* ---------------------------------------------------------------------------
   KnowMyMoney service worker. Minimal app-shell caching for offline use.
   - Navigations (HTML): network-first, fall back to cache so the app opens
     offline but always shows fresh content when online.
   - Other same-origin GETs (CSS/JS/icons): cache-first, filled from the
     network on first use.
   - Cross-origin (fonts, exchange-rate API, analytics): passthrough, never
     cached, so live data and tracking behave normally.
   Bump CACHE when shipping asset changes to retire the old cache.
--------------------------------------------------------------------------- */
var CACHE = 'kmm-v1';
var CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/home.js',
  '/shared/tokens.css',
  '/shared/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Cache core one-by-one so a single 404 can't abort the whole install.
      return Promise.all(CORE.map(function (url) {
        return c.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // passthrough: fonts, rate API, analytics

  // HTML navigations: network-first, cache fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('/'); });
      })
    );
    return;
  }

  // Static assets: cache-first, fill from network.
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
