/**
 * Service worker — app-shell caching so the dashboard opens during a data cut.
 *
 * WHAT THIS FIXES
 *
 * Dexie already queues writes made while offline (src/lib/offline-sync.ts), but
 * that only helps if the app is already open. Without a service worker, a staff
 * member whose data drops and who then reloads gets a browser error page — the
 * queue is irrelevant because the app never loads. PRD 5.5 makes offline
 * operation a Must, so the shell has to be cached too.
 *
 * WHAT THIS DELIBERATELY DOES NOT CACHE
 *
 * Anything under /api. Availability, appointments, and money must never be
 * served stale: showing a slot that was taken an hour ago invites a booking
 * that will be rejected, and showing yesterday's takings as today's would
 * undermine the one number owners are meant to trust. API calls go to the
 * network or fail honestly, and the Dexie queue handles writes.
 */

const VERSION = "v1";
const SHELL_CACHE = `salon-shell-${VERSION}`;
const RUNTIME_CACHE = `salon-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// Kept deliberately small: anything that must exist for the app to render at
// all. Next.js asset filenames are content-hashed and unknown at build time,
// so they are cached on first use at runtime instead.
const SHELL_ASSETS = [OFFLINE_URL, "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Content-hashed build output — safe to serve from cache indefinitely. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GETs are cacheable. Everything else (checkout, booking, status
  // changes) must reach the server or fail so the queue can retry it.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isApiRequest(url)) {
    return; // network-only, by design — see header comment
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Page navigations: prefer the network so content is fresh, fall back to the
  // last good copy of that page, and finally to a plain offline notice.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
