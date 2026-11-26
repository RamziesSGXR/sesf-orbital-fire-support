// Orbital Fury: plays offline once the website has been opened (0.62.26).
// Network first: online, every file comes fresh from the site (so a new version arrives as usual) and a copy is kept. Offline,
// the kept copy is used. The page tells this worker which files it loaded on its first visit (before the worker was running),
// so the whole game is kept from the first visit on.
const KEEP = 'orbital-fury-offline-v1';
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));

const keep = async (req, res) => {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  try { const c = await caches.open(KEEP); await c.put(req, res); } catch (e) { /* storage full or refused: play on without it */ }
};

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !FONTS.test(req.url)) return;
  ev.respondWith((async () => {
    try {
      const res = await fetch(req);
      ev.waitUntil(keep(req, res.clone()));
      return res;
    } catch (e) {
      const c = await caches.open(KEEP);
      const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') { const home = (await c.match('./')) || (await c.match('./index.html')); if (home) return home; }
      throw e;
    }
  })());
});

// { keep: [urls] } from the page: everything it loaded before this worker was in charge
self.addEventListener('message', (ev) => {
  const urls = ev.data && Array.isArray(ev.data.keep) ? ev.data.keep : null;
  if (!urls) return;
  ev.waitUntil((async () => {
    const c = await caches.open(KEEP);
    for (const u of urls) {
      try {
        const url = new URL(u, self.location.href);
        if (url.origin !== self.location.origin && !FONTS.test(url.href)) continue;
        if (await c.match(url.href)) continue;
        const res = await fetch(url.href, url.origin === self.location.origin ? {} : { mode: 'no-cors' });
        await keep(url.href, res);
      } catch (e) { /* offline already, or gone: skip it */ }
    }
    if (ev.source) ev.source.postMessage({ kept: true });
  })());
});
