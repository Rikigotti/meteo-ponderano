// Cache minima per l'app shell; i dati restano sempre online-first.
const SHELL = 'shell-v5';
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', 'styles.css', 'app.js', 'vendor/uPlot.iife.min.js', 'vendor/uPlot.min.css'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const isData = u.pathname.includes('/data/') || u.pathname.includes('/live/') || u.pathname.includes('/api/');
  e.respondWith(fetch(e.request).then(r => { if (!isData && r.ok) { const c = r.clone(); caches.open(SHELL).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
