/* ============================================================
   OniSteel Studios Board — Service Worker (PWA / offline)
   Network-first for pages & data, cache-first for static assets.
   ============================================================ */
const CACHE = "onisteel-v2";
const CORE = [
  "./", "./index.html", "./dashboard.html", "./board.html", "./workspace.html",
  "./calendar.html", "./chat.html", "./profile.html", "./settings.html",
  "./files.html", "./docs.html", "./notes.html", "./whiteboard.html",
  "./analytics.html", "./members.html", "./login.html", "./register.html",
  "./css/styles.css", "./css/auth.css", "./css/boards.css", "./css/chat.css",
  "./css/calendar.css", "./css/dashboard.css", "./css/pages.css", "./css/docs.css",
  "./css/files.css", "./css/whiteboard.css",
  "./js/app.js", "./js/store.js", "./js/firebase.js", "./js/constants.js",
  "./js/ui.js", "./js/icons.js", "./js/auth.js", "./js/boards.js", "./js/tasks.js",
  "./js/chat.js", "./js/calendar.js", "./js/dashboard.js", "./js/analytics.js",
  "./js/users.js", "./js/notifications.js", "./js/charts.js", "./js/editor.js",
  "./js/workspace.js", "./js/members.js", "./js/profile.js", "./js/settings.js",
  "./js/docs.js", "./js/notes.js", "./js/whiteboard.js", "./js/files.js", "./js/seed.js",
  "./assets/images/logo.svg", "./assets/images/favicon.svg", "./manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept cross-origin (Firebase, Google Fonts CDN, gstatic) — let them hit the network.
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== "GET") return;

  const isAsset = /\.(css|js|svg|png|jpg|jpeg|webp|woff2?|ico)$/.test(url.pathname);
  if (isAsset) {
    // cache-first
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => cached))
    );
  } else {
    // network-first for HTML / navigations
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((c) => c || caches.match("./index.html")))
    );
  }
});
