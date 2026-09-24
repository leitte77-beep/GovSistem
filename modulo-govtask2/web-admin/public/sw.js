/*
 * Kill switch do service worker antigo do GovTask.
 *
 * O módulo reescrito não usa service worker. Este arquivo existe apenas para
 * substituir o registro que ficou no browser de quem usava a versão anterior:
 * ao ativar, apaga todos os caches, se desregistra e recarrega as abas
 * abertas. Não intercepta nenhuma requisição — sem `fetch`, o browser volta a
 * usar a rede por padrão.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((chave) => caches.delete(chave)));
      await self.registration.unregister();
      const abas = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      abas.forEach((aba) => aba.navigate(aba.url));
    })()
  );
});
