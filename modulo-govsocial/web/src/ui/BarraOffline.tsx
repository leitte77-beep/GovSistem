import { CloudOff, RefreshCw } from "lucide-react";
import { useEstadoConexao } from "@/nucleo/offline/estadoConexao";
import { textos } from "@/i18n/textos";

/**
 * Barra de estado de conexão + fila de sincronização (§11).
 * Aparece apenas quando offline ou quando há itens pendentes de envio.
 */
export function BarraOffline({ pendentes = 0 }: { pendentes?: number }) {
  const { online } = useEstadoConexao();
  if (online && pendentes === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber/15 px-4 py-1.5 text-xs font-semibold text-amber"
    >
      {!online ? (
        <>
          <CloudOff aria-hidden className="h-4 w-4" />
          <span>{textos.estados.offlineDescricao}</span>
        </>
      ) : (
        <>
          <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />
          <span>
            Sincronizando {pendentes} {pendentes === 1 ? "item" : "itens"}…
          </span>
        </>
      )}
    </div>
  );
}
