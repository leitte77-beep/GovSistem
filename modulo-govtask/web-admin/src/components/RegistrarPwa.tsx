"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do PWA (§109).
 *
 * Sem precache: o objetivo inicial é permitir o atalho na tela inicial e uma
 * resposta offline básica, sem arriscar servir uma versão antiga da aplicação.
 */
export function RegistrarPwa() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registrar = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar, { once: true });
      return () => window.removeEventListener("load", registrar);
    }
  }, []);
  return null;
}
