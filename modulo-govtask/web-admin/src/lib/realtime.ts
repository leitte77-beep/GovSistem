"use client";

/**
 * Assinatura do stream de eventos do servidor (§127).
 *
 * O `EventSource` não aceita cabeçalho, então o token vai por query — a mesma
 * validação do Bearer no servidor. O evento é um **sinal**: quem escuta não
 * recebe conteúdo, recebe "algo mudou" e recarrega pela API autorizada. É por
 * isso que o hook não guarda dados, só dispara um evento global que o sino e as
 * listas usam para se atualizar.
 */

import { useEffect } from "react";
import { getAccessToken } from "@/lib/api";

const BASE_URL = "/api/govtask";

export function useRealtime() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let fonte: EventSource | null = null;
    let reagendar: ReturnType<typeof setTimeout> | null = null;
    let encerrado = false;

    const conectar = () => {
      const token = getAccessToken();
      if (!token || encerrado) return;

      fonte = new EventSource(
        `${BASE_URL}/eventos/stream?token=${encodeURIComponent(token)}`
      );

      fonte.addEventListener("notificacao", (evento) => {
        try {
          const detalhe = JSON.parse((evento as MessageEvent).data);
          window.dispatchEvent(new CustomEvent("govtask:notificacao", { detail: detalhe }));
        } catch {
          window.dispatchEvent(new CustomEvent("govtask:notificacao", { detail: {} }));
        }
      });

      fonte.onerror = () => {
        // O EventSource tentaria reconectar para sempre; se o token expirou,
        // isso vira ruído. Fecha e tenta de novo em 30s, quando o token já
        // pode ter sido renovado pelo fluxo normal.
        fonte?.close();
        fonte = null;
        if (!encerrado) reagendar = setTimeout(conectar, 30000);
      };
    };

    conectar();
    return () => {
      encerrado = true;
      fonte?.close();
      if (reagendar) clearTimeout(reagendar);
    };
  }, []);
}
