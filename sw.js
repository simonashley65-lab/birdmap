const VERSION = 'birdmap-v6';
const SHELL = ['./', './index.html', './app.css', './app.js', './leaflet.css', './leaflet.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname === 'api.ebird.org' || u.hostname.endsWith('openstreetmap.org') || u.hostname.endsWith('arcgisonline.com')) return;      // always live
  if (u.pathname.includes('/data/')) {                                                   // data: network first, cache fallback
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (u.origin === location.origin || u.hostname.includes('cdnjs') || u.hostname.includes('gstatic') || u.hostname.includes('googleapis')) { const c = res.clone(); caches.open(VERSION).then(k => k.put(e.request, c)); } return res; })));
});
