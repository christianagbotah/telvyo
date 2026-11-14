/* Telvyo public tracker offline shell. Never cache subscriber, admin or API responses. */
const VERSION = "dev"; // Replaced with the Git SHA by the VPS release tool.
const CACHE_NAME = "telvyo-public-" + VERSION;
const CACHE_PREFIX = "telvyo-public-";
const SCOPE = new URL(self.registration.scope);
const PUBLIC_FILES = [
  "./", "./index.html", "./app.js", "./model.js", "./device.js",
  "./connected-views.js", "./insights.js", "./styles.css",
  "./icon.svg", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest",
];
const VERSIONED_FILES = new Set([
  "./app.js", "./model.js", "./device.js", "./connected-views.js",
  "./insights.js", "./styles.css", "./manifest.webmanifest",
]);
const PUBLIC_URLS = PUBLIC_FILES.map(path =>
  new URL(VERSIONED_FILES.has(path) ? path + "?v=" + VERSION : path, SCOPE).href,
);
const VERSIONED_PATHS = new Set([...VERSIONED_FILES].map(path => new URL(path, SCOPE).pathname));
const PUBLIC_PATHS = new Set(PUBLIC_URLS.map(url => new URL(url).pathname));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin ||
      !PUBLIC_PATHS.has(url.pathname) ||
      (url.search && url.search !== "?v=" + VERSION)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Network-first keeps deployed code current; the last valid public shell
      // remains readable when the connection is unavailable.
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const fallback = VERSIONED_PATHS.has(url.pathname)
        ? new URL(url.pathname + "?v=" + VERSION, SCOPE).href : null;
      return (await cache.match(request)) ||
        (fallback && await cache.match(new Request(fallback))) || Response.error();
    }
  })());
});
