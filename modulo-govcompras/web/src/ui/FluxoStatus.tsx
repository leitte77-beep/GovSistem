import clsx from "clsx";
import { Check, X } from "lucide-react";

export interface EtapaFluxo {
  codigo: string;
  nome: string;
}

/**
 * Linha do tempo horizontal do processo (seção 11) — a peça central da
 * "linha do tempo viva da contratação pública". Cada etapa mostra se já foi
 * concluída, é a atual, ou ainda não começou.
 */
export function FluxoStatus({
  etapas,
  etapaAtualCodigo,
  statusGeral,
}: {
  etapas: EtapaFluxo[];
  etapaAtualCodigo: string | null;
  statusGeral: string;
}) {
  const indiceAtual = etapas.findIndex((e) => e.codigo === etapaAtualCodigo);
  const cancelado = statusGeral === "cancelado";

  return (
    <div className="flex w-full items-start overflow-x-auto pb-2">
      {etapas.map((etapa, indice) => {
        const concluida = indiceAtual >= 0 && indice < indiceAtual;
        const atual = indice === indiceAtual;
        const ehUltima = indice === etapas.length - 1;

        return (
          <div key={etapa.codigo} className="flex min-w-[92px] flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div
                className={clsx(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  cancelado && atual
                    ? "border-red-500 bg-red-50 text-red-600"
                    : concluida
                      ? "border-brand-600 bg-brand-600 text-white"
                      : atual
                        ? "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100"
                        : "border-slate-300 bg-white text-slate-400",
                )}
              >
                {cancelado && atual ? (
                  <X className="size-3.5" />
                ) : concluida ? (
                  <Check className="size-3.5" />
                ) : (
                  indice + 1
                )}
              </div>
              {!ehUltima && (
                <div className={clsx("h-0.5 flex-1", concluida ? "bg-brand-600" : "bg-slate-200")} />
              )}
            </div>
            <p
              className={clsx(
                "mt-1.5 max-w-[100px] text-center text-[11px] leading-tight",
                atual ? "font-semibold text-slate-900" : concluida ? "text-slate-600" : "text-slate-400",
              )}
            >
              {etapa.nome}
            </p>
          </div>
        );
      })}
    </div>
  );
}
