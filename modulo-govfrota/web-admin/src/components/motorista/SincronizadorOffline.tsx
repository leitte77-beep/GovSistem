"use client";

import { useEffect } from "react";
import { listarEnvios, listarPendentes, sincronizarPendentes } from "@/lib/filaOffline";

/**
 * Envia sozinho o que ficou guardado no celular, em qualquer tela do app:
 * quando o sinal volta, quando o app volta para a frente e, havendo
 * pendências, a cada minuto (o evento "online" nem sempre dispara quando a
 * rede existe mas o servidor ainda não respondia).
 */
export function SincronizadorOffline() {
  useEffect(() => {
    let parado = false;
    async function tentar() {
      if (parado || !navigator.onLine) return;
      const [a, b] = await Promise.all([listarPendentes(), listarEnvios()]);
      if (a.some((p) => !p.erro) || b.some((p) => !p.erro)) {
        const { enviados } = await sincronizarPendentes();
        if (enviados) window.dispatchEvent(new Event("fila:sincronizada"));
      }
    }
    const aoVoltar = () => { if (document.visibilityState === "visible") tentar(); };
    window.addEventListener("online", tentar);
    document.addEventListener("visibilitychange", aoVoltar);
    const relogio = window.setInterval(tentar, 60_000);
    tentar();
    return () => {
      parado = true;
      window.removeEventListener("online", tentar);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.clearInterval(relogio);
    };
  }, []);
  return null;
}
