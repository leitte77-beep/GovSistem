import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { logPiiReveal } from "@/nucleo/api/auditoria";
import { avisar } from "@/ui/Toast";

/**
 * Revelação sob demanda de dado mascarado (CPF/NIS) em listagens.
 * - Exibe apenas o valor mascarado (LGPD).
 * - A revelação chama o endpoint dedicado (auditado no backend como
 *   READ_SENSIVEL) e registra o fato localmente via `logPiiReveal`.
 * - O valor revelado vive só no estado do componente (nunca em cache).
 */
export function RevelarCampo({
  valor,
  valorCompleto,
  buscarValor,
  campo,
  entityId,
  entityType,
}: {
  valor: string;
  valorCompleto?: string;
  buscarValor?: () => Promise<string>;
  campo: string;
  entityId: string;
  entityType: string;
}) {
  const [revelado, setRevelado] = useState<string | null>(valorCompleto ?? null);
  const [carregando, setCarregando] = useState(false);

  async function revelar() {
    if (!buscarValor) return;
    setCarregando(true);
    try {
      const v = await buscarValor();
      setRevelado(v);
      logPiiReveal({ campo, entityId, entityType });
    } catch {
      avisar.erro("Não foi possível revelar o dado.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span>{revelado ?? valor}</span>
      {!revelado && buscarValor && (
        <button
          type="button"
          onClick={revelar}
          disabled={carregando}
          className="inline-flex min-h-6 items-center gap-1 rounded text-primary hover:underline focus-visible:outline-focus disabled:opacity-60"
          aria-label={`Revelar ${campo.toUpperCase()} (sua visualização será registrada)`}
        >
          {carregando ? (
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye aria-hidden className="h-3.5 w-3.5" />
          )}
          Revelar
        </button>
      )}
    </span>
  );
}
