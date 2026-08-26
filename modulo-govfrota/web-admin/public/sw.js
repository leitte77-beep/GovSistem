/* Service Worker do GovFrota Motorista — instalação PWA e cache básico.
 *
 * Nesta fase NÃO há abastecimento offline (a confirmação exige servidor).
 * O SW apenas habilita a instalação e faz cache de ativos estáticos básicos
 * para uma abertura rápida; nunca cacheia dados de abastecimento.
 */

const CACHE = "govfrota-motorista-v1";
const PRECACHE = ["./", "./manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estratégia: network-first para navegação; cache-fallback para estáticos.
// Dados (rotas /api/) NUNCA são servidos do cache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Ignora esquemas não http(s) (ex.: chrome-extension://, devtools://) —
  // não são cacheáveis e quebrariam o caches.put.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.pathname.includes("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
    )
  );
});
