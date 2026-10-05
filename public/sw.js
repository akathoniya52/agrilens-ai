/* AgriLens service worker — hand-written, no build step. Bump VERSION to invalidate caches. */
const VERSION = "v1";
const SHELL_CACHE = `agrilens-shell-${VERSION}`;
const STATIC_CACHE = `agrilens-static-${VERSION}`;
const PAGE_CACHE = `agrilens-pages-${VERSION}`;
const API_CACHE = `agrilens-api-${VERSION}`;
const CACHES = [SHELL_CACHE, STATIC_CACHE, PAGE_CACHE, API_CACHE];

const SHELL_URLS = ["/", "/chat", "/farms", "/logo.png", "/manifest.webmanifest"];
const API_CACHE_LIMIT = 24;
const PAGE_CACHE_LIMIT = 30;
const CACHEABLE_API = /^\/api\/(chats(\/[a-f0-9]{24}(\/messages)?)?|farms|me)$/;
const STATIC_ASSET = /\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("agrilens-") && !CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

async function networkFirst(request, cacheName, limit, fallbackUrls = []) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(cacheName);
      await cache.delete(request);
      await cache.put(request, response.clone());
      trim(cacheName, limit);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    for (const url of fallbackUrls) {
      const fallback = await caches.match(url);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only GETs are cached: chat streaming POSTs, uploads and mutations always hit the network.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch auth (session/CSRF/callback) responses.
  if (url.pathname.startsWith("/api/auth")) return;

  if (url.pathname.startsWith("/api/")) {
    if (CACHEABLE_API.test(url.pathname) && !url.search) {
      event.respondWith(networkFirst(request, API_CACHE, API_CACHE_LIMIT));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || (STATIC_ASSET.test(url.pathname) && !url.pathname.startsWith("/_next/image"))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App Router client navigations (RSC payloads) vary per request; let them go to the network.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE, PAGE_CACHE_LIMIT, [url.pathname, "/chat", "/"]));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-user-cache") {
    event.waitUntil(Promise.all([caches.delete(API_CACHE), caches.delete(PAGE_CACHE)]));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "AgriLens", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "AgriLens", {
      body: payload.body || "",
      icon: "/logo.png",
      badge: "/logo.png",
      tag: payload.tag,
      data: { url: payload.url || "/farms" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  // Never open off-origin pages from a notification.
  const target = requested.origin === self.location.origin ? requested.href : new URL("/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
