/*
 * Service worker do GovTask (§109).
 *
 * Conservador de propósito: não guarda a API nem pré-carrega o shell. Só
 * responde offline com o que já estiver em cache. Dados de demanda são
 * sensíveis e por isso nunca entram no cache do service worker.
 */
const CACHE = "govtask-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
