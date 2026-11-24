// OVERDUE! service worker (v1.13.1): offline play. The build script stamps BUILD_ID (the commit) and KILL below.
//  - Cache-first for the game page, icons and manifest, so the game opens with no network after one online visit.
//  - version.json is never cached: the page uses it to notice a new build and show the "tap to update" bar.
//  - A new build = a new sw.js (different BUILD_ID). It installs in the background (fetching the new page past the HTTP
//    cache), WAITS, and takes over only when the page says so (tapping the update bar) or on the next cold start.
//  - Kill switch: `OVERDUE_KILL_SW=1 npm run build` stamps KILL = true. That worker deletes every cache, unregisters itself
//    and reloads open pages, so players are back on the plain online site. (Documented in README.)
const BUILD_ID = '__BUILD_ID__';
const KILL = __KILL__;
const CACHE = `overdue-${BUILD_ID}`;
const BASE = self.registration.scope; // e.g. https://andrehiu.github.io/overdue/
const PRECACHE = ['', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'].map((p) => BASE + p);

self.addEventListener('install', (e) => {
  if (KILL) { self.skipWaiting(); return; }
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's HTTP cache so a new build can never be stored as the old page.
    await Promise.all(PRECACHE.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
      await cache.put(url, res);
    }));
    // First ever install (no older worker): take over right away so offline works from the first visit.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('overdue-') && (KILL || k !== CACHE)) await caches.delete(k);
    if (KILL) {
      // Don't await unregister(): waiting on it from inside activate can hang the activation in Chromium.
      self.registration.unregister().catch(() => {});
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
      return;
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (KILL || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.href.startsWith(BASE)) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return; // always live
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Page loads (including ?debug=1 etc.) get the cached game page.
    const hit = req.mode === 'navigate' ? await cache.match(BASE, { ignoreSearch: true }) : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); } catch { return req.mode === 'navigate' ? (await cache.match(BASE, { ignoreSearch: true })) || Response.error() : Response.error(); }
  })());
});
