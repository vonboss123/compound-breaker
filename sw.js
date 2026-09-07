const CACHE_VERSION = 10;
const SCOPE_URL = new URL(self.registration.scope);
const SCOPE_ID = hashScope(SCOPE_URL.href);
const CACHE_PREFIX = `compound-breaker-app-${SCOPE_ID}-`;
const CACHE_NAME = `${CACHE_PREFIX}v${CACHE_VERSION}`;
const OFFLINE_URL = new URL('./index.html', SCOPE_URL).href;
const APP_SHELL_PATHS = Object.freeze([
  './',
  './index.html',
  './styles.css?v=1.3.1',
  './src/game-core.js?v=1.3.1',
  './src/main.js?v=1.3.1',
  './src/pwa.js?v=1.3.1',
  './src/renderer.js?v=1.3.1',
  './src/audio.js?v=1.3.1',
  './src/config.js?v=1.3.1',
  './src/progression.js?v=1.3.1',
  './src/player-store.js?v=1.3.1',
  './src/leaderboard-client.js?v=1.3.1',
  './src/arcade-ui.js?v=1.3.1',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
]);
const APP_SHELL_URLS = APP_SHELL_PATHS.map((path) => new URL(path, SCOPE_URL).href);

function hashScope(scope) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < scope.length; index += 1) {
    hash ^= scope.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isSafeRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const requestUrl = new URL(request.url);
  return requestUrl.origin === SCOPE_URL.origin && requestUrl.href.startsWith(SCOPE_URL.href);
}

function isCacheable(response) {
  return (
    Boolean(response) &&
    response.ok &&
    response.type !== 'opaque' &&
    response.type !== 'error'
  );
}

async function readOfflineDocument() {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(OFFLINE_URL);
  } catch {
    return undefined;
  }
}

async function updateOfflineDocument(response) {
  if (!isCacheable(response)) {
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, response.clone());
  } catch {
    // Storage failures must not hide a successful navigation response.
  }
}

function networkFirstNavigation(request) {
  const networkResponsePromise = Promise.resolve().then(() => fetch(request));
  const responsePromise = networkResponsePromise.catch(async () => {
    const offlinePage = await readOfflineDocument();
    return offlinePage ?? new Response('离线且尚未缓存游戏，请恢复网络后重试。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  });
  const lifetimePromise = networkResponsePromise
    .then(updateOfflineDocument)
    .catch(() => undefined);

  return { responsePromise, lifetimePromise };
}

async function fetchAndUpdate(request, openCache) {
  const networkResponse = await fetch(request);
  if (!isCacheable(networkResponse)) {
    return networkResponse;
  }

  try {
    const cache = openCache ?? await caches.open(CACHE_NAME);
    await cache.put(request, networkResponse.clone());
  } catch {
    // Cache failures must not hide a successful network response.
  }
  return networkResponse;
}

function staleWhileRevalidate(request) {
  const cachePromise = caches.open(CACHE_NAME).catch(() => undefined);
  const cachedResponsePromise = cachePromise
    .then((cache) => cache?.match(request))
    .catch(() => undefined);
  let networkResponsePromise;

  function getNetworkResponse() {
    networkResponsePromise ??= cachePromise.then((cache) =>
      fetchAndUpdate(request, cache),
    );
    return networkResponsePromise;
  }

  const responsePromise = cachedResponsePromise.then(
    (cachedResponse) => cachedResponse ?? getNetworkResponse(),
  );
  const lifetimePromise = cachedResponsePromise
    .then((cachedResponse) =>
      cachedResponse ? getNetworkResponse() : responsePromise,
    )
    .then(() => undefined)
    .catch(() => undefined);

  return { responsePromise, lifetimePromise };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (!isSafeRequest(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    const navigationStrategy = networkFirstNavigation(event.request);
    event.waitUntil(navigationStrategy.lifetimePromise);
    event.respondWith(navigationStrategy.responsePromise);
    return;
  }

  const assetStrategy = staleWhileRevalidate(event.request);
  event.waitUntil(assetStrategy.lifetimePromise);
  event.respondWith(assetStrategy.responsePromise);
});
