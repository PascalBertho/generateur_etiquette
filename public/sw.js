const CACHE_NAME = "label-ds-pwa-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// LABEL DS travaille avec des données Supabase dynamiques.
// On privilégie donc toujours le réseau et on ne met pas en cache
// les appels API, les pages de connexion ni les données métier.
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/logout")
  ) {
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
