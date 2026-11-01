// AugustApka – service worker: działa offline, a przy internecie zawsze pobiera najnowszą wersję
const CACHE = "augustapka-v4";
const CORE = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // logowanie i synchronizacja zawsze przez sieć
  if (url.pathname.startsWith("/.netlify/") || url.hostname === "identity.netlify.com") return;
  // czcionki Google i przeglądarka PDF (pdf.js): najpierw pamięć podręczna – działają też offline
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com") || (url.hostname === "cdnjs.cloudflare.com" && url.pathname.includes("/pdf.js/"))) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // strona i pliki aplikacji: najpierw sieć (świeża wersja), bez internetu – kopia
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "/" : req).then((hit) => hit || caches.match("/")))
  );
});

// powiadomienia push (przypomnienia o terminach i powtórkach)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "AugustApka", {
    body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: d.tag || "aug", data: { url: d.url || "/" }, lang: "pl",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate ? c.navigate(url).catch(() => {}) : null; return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
