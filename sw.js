/* BirthdayBeat service worker: lets the installed app open quickly and work offline.
   It caches only the app's own files and libraries. Customer data is never cached here
   (it lives in the browser's local storage on the device). */
const CACHE = 'birthdaybeat-v1';
const APP = ['./', './index.html', './styles.css', './core.js', './app.js', './lib/xlsx.full.min.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Show the saved copy at once, and refresh it in the background so updates arrive on the next open.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const lib = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.host);
  if (url.origin !== location.origin && !lib) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
