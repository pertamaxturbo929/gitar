// Service worker: simpan semua file supaya aplikasi tetap jalan tanpa internet.
// Naikkan VERSION setiap ada perubahan file.
const VERSION = 'gitar-v1';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/theory.js', 'js/chords.js', 'js/diagram.js',
  'js/audio.js', 'js/pitch.js', 'js/tuner.js', 'js/metronome.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Ambil dari cache dulu (cepat & offline), sambil memperbarui di belakang layar.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
