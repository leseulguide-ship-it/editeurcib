// EditeurCiB : met l’application en cache pour qu’elle fonctionne sans connexion.
const VERSION = "editeurcib-v1";
const FICHIERS = ["./", "index.html", "manifest.webmanifest", "fonts/polices.css", "lib/jszip.min.js", "lib/mammoth.browser.min.js", "img/apple-touch-icon.png", "img/favicon.png", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-512.png", "img/logo-cib.png", "fonts/arimo-latin-400-italic.woff2", "fonts/arimo-latin-400-normal.woff2", "fonts/arimo-latin-700-italic.woff2", "fonts/arimo-latin-700-normal.woff2", "fonts/arimo-latin-ext-400-italic.woff2", "fonts/arimo-latin-ext-400-normal.woff2", "fonts/arimo-latin-ext-700-italic.woff2", "fonts/arimo-latin-ext-700-normal.woff2", "fonts/cousine-latin-400-italic.woff2", "fonts/cousine-latin-400-normal.woff2", "fonts/cousine-latin-700-italic.woff2", "fonts/cousine-latin-700-normal.woff2", "fonts/cousine-latin-ext-400-italic.woff2", "fonts/cousine-latin-ext-400-normal.woff2", "fonts/cousine-latin-ext-700-italic.woff2", "fonts/cousine-latin-ext-700-normal.woff2", "fonts/figtree-latin-400-normal.woff2", "fonts/figtree-latin-500-normal.woff2", "fonts/figtree-latin-600-normal.woff2", "fonts/figtree-latin-700-normal.woff2", "fonts/figtree-latin-ext-400-normal.woff2", "fonts/figtree-latin-ext-500-normal.woff2", "fonts/figtree-latin-ext-600-normal.woff2", "fonts/figtree-latin-ext-700-normal.woff2", "fonts/tinos-latin-400-italic.woff2", "fonts/tinos-latin-400-normal.woff2", "fonts/tinos-latin-700-italic.woff2", "fonts/tinos-latin-700-normal.woff2", "fonts/tinos-latin-ext-400-italic.woff2", "fonts/tinos-latin-ext-400-normal.woff2", "fonts/tinos-latin-ext-700-italic.woff2", "fonts/tinos-latin-ext-700-normal.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Page : le réseau d’abord (pour recevoir les mises à jour), le cache si hors ligne.
// Autres fichiers : le cache d’abord.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(r => { const copie = r.clone(); caches.open(VERSION).then(c => c.put("index.html", copie)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
