import { Check } from "lucide-react";
import clsx from "clsx";

/**
 * <FluxoStatus> — linha de aprovação (benefício, encaminhamento). Mostra as
 * etapas concluídas, a atual e as futuras; nunca comunica só por cor: cada etapa
 * tem rótulo textual e a atual é anunciada por aria-current.
 */
export type EtapaFluxo = { id: string; rotulo: string };

export function FluxoStatus({
  etapas,
  atual,
  cancelado,
  rotulo = "Andamento",
}: {
  etapas: EtapaFluxo[];
  /** índice da etapa atual (0-based). */
  atual: number;
  /** quando true, sinaliza que o fluxo foi interrompido (negado/cancelado). */
  cancelado?: boolean;
  rotulo?: string;
}) {
  return (
    <ol aria-label={rotulo} className="flex flex-wrap items-center gap-y-2">
      {etapas.map((etapa, i) => {
        const concluida = i < atual;
        const ehAtual = i === atual;
        return (
          <li key={etapa.id} className="flex items-center">
            <div
              className="flex items-center gap-2"
              aria-current={ehAtual ? "step" : undefined}
            >
              <span
                aria-hidden
                className={clsx(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                  concluida && "border-primary bg-primary text-white",
                  ehAtual && !cancelado && "border-primary bg-primary-soft text-primary",
                  ehAtual && cancelado && "border-danger bg-danger/10 text-danger",
                  !concluida && !ehAtual && "border-ink-soft/40 text-ink-soft",
                )}
              >
                {concluida ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={clsx(
                  "text-sm font-semibold",
                  concluida || ehAtual ? "text-ink" : "text-ink-soft",
                )}
              >
                {etapa.rotulo}
                {ehAtual && (
                  <span className="apenas-leitor"> (etapa atual)</span>
                )}
              </span>
            </div>
            {i < etapas.length - 1 && (
              <span
                aria-hidden
                className={clsx(
                  "mx-2 h-px w-8",
                  concluida ? "bg-primary" : "bg-ink-soft/30",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
