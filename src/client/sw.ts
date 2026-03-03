/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "talier-v6";
const ASSETS: string[] = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  void self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  void self.clients.claim();
});

self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset =
    event.request.destination === "style" ||
    event.request.destination === "script" ||
    event.request.destination === "image" ||
    event.request.destination === "font" ||
    event.request.destination === "manifest";

  if (isNavigation) {
    event.respondWith(networkFirstPage(event.request));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(cacheFirstAsset(event.request));
    return;
  }

  event.respondWith(networkWithCacheFallback(event.request));
});

async function cacheFirstAsset(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    void refreshCache(request);
    return cached;
  }
  return refreshCache(request);
}

async function networkWithCacheFallback(request: Request): Promise<Response> {
  try {
    return await refreshCache(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function networkFirstPage(request: Request): Promise<Response> {
  try {
    return await refreshCache(request);
  } catch {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;
    const appShell = await caches.match("./index.html");
    if (appShell) return appShell;
    const offlinePage = await caches.match("./offline.html");
    return (
      offlinePage ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    );
  }
}

async function refreshCache(request: Request): Promise<Response> {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

export { };
