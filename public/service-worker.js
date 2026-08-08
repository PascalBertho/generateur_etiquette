const CACHE_NAME = "label-ds-v3";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/label-ds-192.png",
  "/label-ds-512.png",
  "/label-ds-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Ne jamais mettre en cache les appels API.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation : réseau d'abord, pour toujours charger la dernière version.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/generateur-etiquettes/")
      )
    );
    return;
  }

  // Ressources statiques : cache puis réseau.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});