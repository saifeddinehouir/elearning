// DailyQCM service worker — offline app shell + notification click handling.
// Bump CACHE whenever shell files change.
const CACHE = "dailyqcm-v4";

const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "src/app.js",
  "src/dom.js",
  "src/db.js",
  "src/store.js",
  "src/schema.js",
  "src/sm2.js",
  "src/session.js",
  "src/stats.js",
  "src/streak.js",
  "src/charts.js",
  "src/format.js",
  "src/notifications.js",
  "src/updates.js",
  "src/prompt-template.js",
  "samples/course.json",
  "samples/leetcode.json",
  "src/views/import.js",
  "src/views/daily.js",
  "src/views/session.js",
  "src/views/stats.js",
  "src/views/streak.js",
  "src/views/decks.js",
  "src/views/settings.js",
];

self.addEventListener("install", (event) => {
  // Precache the new shell but stay in "waiting" until the page asks us to take
  // over (see src/updates.js) — that way an update never yanks the app out from
  // under someone mid-session.
  //
  // Deliberately NOT cache.addAll(SHELL): addAll's underlying fetch can be
  // satisfied by the browser's ordinary HTTP cache, which would "refresh" this
  // Cache Storage entry with a file that's still stale. { cache: "reload" }
  // forces every shell file to come straight from the network.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          fetch(url, { cache: "reload" }).then((resp) => {
            if (resp.ok) return cache.put(url, resp);
          })
        )
      )
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(request));
});

// Network-first, falling back to cache only when offline.
//
// A previous version of this file was cache-first, which meant an app update
// could sit invisible in Cache Storage indefinitely: the update-detection
// dance below only runs when THIS FILE's own bytes change, but most day-to-day
// changes only touch app JS, not sw.js. Network-first sidesteps that whole
// class of bug — when you're online (the common case) you always get the
// current deploy, no service-worker lifecycle required. Offline support is
// still there via the cache populated on install and refreshed on every
// successful fetch.
async function networkFirst(request) {
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await caches.match("index.html");
      if (shell) return shell;
    }
    return Response.error();
  }
}

// Reminder notifications (shown from the page or a future push server).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(".");
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "DailyQCM", body: "Time for today's review." };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "dailyqcm-reminder",
    })
  );
});
