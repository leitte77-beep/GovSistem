/* Service Worker do GovFrota Motorista — instalação PWA e cache básico.
 *
 * Guarda as telas do motorista para abrirem sem internet. O abastecimento
 * feito sem sinal fica numa fila no IndexedDB (src/lib/filaOffline.ts) e é
 * enviado pela própria página quando a conexão volta — o SW nunca cacheia
 * nem responde rotas /api/.
 */

const CACHE = "govfrota-motorista-v3";
const PRECACHE = ["/motorista", "/motorista/abastecer", "/manifest.json", "/icon-192.png", "/icon-512.png"];

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

// Só guarda resposta completa, da própria origem e sem redirecionamento —
// resposta redirecionada não pode ser devolvida para uma navegação.
function guardar(req, res) {
  if (res.ok && res.type === "basic" && !res.redirected) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

function ehEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /^\/(manifest\.json|icon-\d+\.png|apple-touch-icon\.png)$/.test(url.pathname)
  );
}

// Estratégia: network-first para as telas do motorista; cache-first para
// estáticos com hash. Todo o resto (rotas /api/, payloads RSC do roteador do
// Next, telas do painel administrativo) passa direto pela rede, sem o SW —
// senão uma fetch abortada vira "FetchEvent ... network error" e o payload
// RSC acabaria no cache com a mesma URL da página HTML.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (!url.pathname.startsWith("/motorista")) return;
    event.respondWith(
      fetch(req)
        .then((res) => guardar(req, res))
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((r) => r || caches.match("/motorista"))
            .then((r) => r || Response.error())
        )
    );
    return;
  }

  if (!ehEstatico(url)) return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => guardar(req, res)))
  );
});
