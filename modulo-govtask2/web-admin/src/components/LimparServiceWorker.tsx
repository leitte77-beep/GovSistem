"use client";

/**
 * Faxina única: remove o service worker do GovTask antigo.
 *
 * A versão anterior do módulo registrava um `sw.js` que interceptava a
 * navegação e, quando o `fetch` falhava e não havia cache, chamava
 * `respondWith(undefined)` — o browser reclamava com "Failed to convert value
 * to 'Response'". O módulo novo não usa service worker, mas o registro antigo
 * continua vivo no browser de quem já acessou. Aqui forçamos a atualização:
 * o `sw.js` atual é um "kill switch" que limpa os caches e se desregistra.
 */

import { useEffect } from "react";

export function LimparServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .getRegistrations()
      .then((registros) => {
        registros.forEach((registro) => {
          registro.update().catch(() => registro.unregister());
        });
      })
      .catch(() => {});
  }, []);

  return null;
}
