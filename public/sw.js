// Minimal service worker: makes the app installable and speeds up loads by
// caching only immutable, non-sensitive static assets. It never caches
// authenticated pages or API responses, so clinicians always see live data.
const CACHE = "tifec-static-v3";

// On a dev host, never cache: Next serves stable-named chunks in dev, so a
// cached copy would shadow freshly edited code between server restarts.
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname)
  || self.location.hostname.endsWith(".localhost");

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // Drop stale caches; on a dev host drop everything (including CACHE).
    await Promise.all(keys.filter((k) => IS_LOCAL || k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  if (IS_LOCAL) return; // dev: always straight to network, never cache
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for content-hashed static assets and app icons only.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/tifec-mark.png" ||
    url.pathname === "/tifec-logo.png";
  if (!isStatic) return; // everything else: straight to the network (always fresh)

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});

// ---- Web push ----
self.addEventListener("push", (e) => {
  let d = { title: "Cayman Essential Care", body: "", url: "/today", tag: undefined };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch (_) { /* non-JSON payload */ }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || "/today" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/today";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) { if (c.url.includes(url) && "focus" in c) return c.focus(); }
    if (wins[0] && "navigate" in wins[0]) { await wins[0].focus(); return wins[0].navigate(url); }
    return self.clients.openWindow(url);
  })());
});
