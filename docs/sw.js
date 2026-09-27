// Service worker: the whole app is one HTML file, so cache the shell once and serve it first.
// VERSION is stamped by build.py from the page's content hash; a new build = a new cache.
const VERSION = "1ccbd4d094";
const CACHE = `popeye-sheet-builder-${VERSION}`;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// the page asks for this from the "تحديث" toast once a newer worker is waiting
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin || !url.protocol.startsWith("http")) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = request.mode === "navigate" ? "./index.html" : request;
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
