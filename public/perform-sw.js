/*
 * Performer mode's service worker (docs/private/PERFORMER_MODE_IMPLEMENTATION_PLAN_2026-11-05.md, Phase 5), scoped to
 * the perform page so the rest of OurTextScores is untouched. It makes the perform app open with no network:
 *
 * - Hashed build files (/_next/static/...): cache first; a new build has new names.
 * - The page itself and the engine (webmscore.lib.*), and other same-origin files: network first, the cache when the
 *   network is gone or slow to answer (4 s to the response headers). A new version therefore arrives at the next
 *   launch, page and engine together; nothing changes under a performance already open (no reloads).
 * - Installed: the page and the engine are cached at once; the page then sends the build files it already loaded.
 *
 * Scores are not cached here: performer mode keeps them in IndexedDB ("Make available offline").
 */
const VERSION = 'v1';
const STATIC_CACHE = `ots-perform-static-${VERSION}`;
const RUNTIME_CACHE = `ots-perform-runtime-${VERSION}`;
const HEADER_TIMEOUT_MS = 4000;

const scopePath = new URL(self.registration.scope).pathname; // '/perform' or '/score-editor/perform'
const basePath = scopePath.replace(/\/perform$/, '');
const SHELL_KEY = `${basePath}/__perform-shell__`;
const ENGINE = ['webmscore.lib.js', 'webmscore.lib.wasm', 'webmscore.lib.data'].map((file) => `${basePath}/${file}`);
const PAGE = basePath ? `${basePath}/perform.html` : '/perform';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      await Promise.all(
        ENGINE.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) await cache.put(url, response);
        }),
      );
      const page = await fetch(PAGE, { cache: 'reload' });
      if (page.ok) await cache.put(SHELL_KEY, page);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith('ots-perform-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// The page sends the build files it loaded before this worker controlled it
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      for (const url of data.urls) {
        if (typeof url !== 'string' || !isStaticBuildFile(new URL(url, self.location.href))) continue;
        if (await cache.match(url)) continue;
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch {
          // Offline already: it will be cached the next time it is fetched
        }
      }
    })(),
  );
});

function isStaticBuildFile(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(`${basePath}/_next/static/`);
}

function withHeaderTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('slow network')), HEADER_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** Network first; the cache (under `key`) when it fails or is slow. A late network answer still refreshes the cache. */
async function networkFirst(request, key) {
  const cache = await caches.open(RUNTIME_CACHE);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
    return response;
  });
  try {
    return await withHeaderTimeout(network);
  } catch {
    const hit = await cache.match(key);
    if (hit) {
      network.catch(() => {});
      return hit;
    }
    return network;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${basePath}/api/`) || url.pathname.startsWith(`${basePath}/soundfonts/`)) return;
  if (request.mode === 'navigate') {
    // Every perform view is the same page with a different query: one cached shell
    event.respondWith(networkFirst(request, SHELL_KEY));
    return;
  }
  if (isStaticBuildFile(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Scores are kept by performer mode itself; do not keep a second copy here
  if (url.pathname.startsWith(`${basePath}/test_scores/`)) return;
  event.respondWith(networkFirst(request, url.pathname));
});
