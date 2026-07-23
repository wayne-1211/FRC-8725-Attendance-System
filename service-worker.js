// FRC8725 Attendance System — Service Worker
// Provides an installable, offline-capable app shell. Firebase/Firestore
// requests are cross-origin and are intentionally left untouched here so
// realtime data always goes straight to the network.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `frc8725-attendance-${CACHE_VERSION}`;

// Paths are relative so this works whether the app is served from the
// domain root or from a GitHub Pages project subpath
// (e.g. https://frc8725.github.io/FRC8725-Attendance-System/).
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',

  './css/theme.css',
  './css/layout.css',
  './css/components.css',
  './css/attendance.css',

  './config/app-config.json',
  './config/goodkid-emoji.json',

  './js/core/main.js',
  './js/core/router.js',
  './js/core/shell.js',
  './js/services/auth-gate.js',
  './js/services/db.js',
  './js/services/firebase-config.js',
  './js/services/nfc.js',
  './js/pages/export.js',
  './js/pages/goodkid.js',
  './js/pages/lock.js',
  './js/pages/log.js',
  './js/pages/members.js',
  './js/pages/scan.js',
  './js/pages/sessions.js',
  './js/pages/summary.js',
  './js/ui/modal.js',
  './js/ui/toast.js',
  './js/utils/format.js',
  './js/utils/icon.js',

  './pages/export.html',
  './pages/goodkid.html',
  './pages/lock.html',
  './pages/log.html',
  './pages/members.html',
  './pages/scan.html',
  './pages/sessions.html',
  './pages/summary.html',

  './images/brand/team-logo.png',
  './images/icons/calendar.svg',
  './images/icons/check.svg',
  './images/icons/close.svg',
  './images/icons/download.svg',
  './images/icons/edit.svg',
  './images/icons/home.svg',
  './images/icons/list.svg',
  './images/icons/lock.svg',
  './images/icons/nfc.svg',
  './images/icons/plus.svg',
  './images/icons/refresh.svg',
  './images/icons/search.svg',
  './images/icons/star.svg',
  './images/icons/trash.svg',
  './images/icons/unlock.svg',
  './images/icons/users.svg',
  './images/icons/pwa/icon-192.png',
  './images/icons/pwa/icon-512.png',
  './images/icons/pwa/icon-maskable-192.png',
  './images/icons/pwa/icon-maskable-512.png',
  './images/icons/pwa/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // addAll fails all-or-nothing; cache what we can so one missing/renamed
        // asset (e.g. after a repo edit) doesn't block installation entirely.
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('frc8725-attendance-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GET requests. Everything else (Firebase Auth,
  // Firestore, gstatic CDN modules, POST/PUT calls, etc.) goes straight to
  // the network untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App-shell navigations: try the network first (so users always get the
  // latest shell when online), falling back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets: stale-while-revalidate — respond from cache immediately
  // if available, then refresh the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
