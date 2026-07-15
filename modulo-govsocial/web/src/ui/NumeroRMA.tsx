import { Search, Pencil } from "lucide-react";
import clsx from "clsx";
import { Chip } from "./Chip";

/**
 * <NumeroRMA> (biblioteca §5) — valor de um campo do RMA com lupa de drill-down
 * e estado "ajustado". Nunca comunica só por cor: o ajuste é marcado por um Chip
 * com texto ("ajustado") e o valor calculado original é anunciado.
 */
export function NumeroRMA({
  codigo,
  rotulo,
  valor,
  valorCalculado,
  ajustado = false,
  podeAjustar = false,
  aoDrillDown,
  aoAjustar,
}: {
  codigo: string;
  rotulo: string;
  valor: number;
  /** Valor original antes do ajuste (mostrado riscado quando ajustado). */
  valorCalculado?: number | null;
  ajustado?: boolean;
  podeAjustar?: boolean;
  aoDrillDown?: () => void;
  aoAjustar?: () => void;
}) {
  const nome = `${codigo} · ${rotulo}`;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 fonte-mono text-xs text-ink-soft">{codigo}</span>
        <span className="truncate text-sm text-ink">{rotulo}</span>
        <span
          aria-hidden
          className="mx-1 hidden flex-1 border-b border-dotted border-ink-soft/30 sm:block"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {ajustado && <Chip cor="amber">ajustado</Chip>}
        <span className="flex items-baseline gap-2">
          {ajustado && valorCalculado != null && (
            <span className="fonte-mono text-xs text-ink-soft line-through" aria-hidden>
              {valorCalculado}
            </span>
          )}
          <span
            className={clsx(
              "fonte-mono text-lg font-semibold tabular-nums",
              ajustado ? "text-amber" : "text-ink",
            )}
          >
            {valor}
          </span>
        </span>
        {ajustado && valorCalculado != null && (
          <span className="apenas-leitor">
            (ajustado de {valorCalculado} para {valor})
          </span>
        )}

        {aoDrillDown && (
          <button
            type="button"
            onClick={aoDrillDown}
            aria-label={`Ver registros de ${nome}`}
            className="rounded p-1.5 text-ink-soft hover:text-primary focus-visible:outline-focus"
          >
            <Search aria-hidden className="h-4 w-4" />
          </button>
        )}
        {podeAjustar && aoAjustar && (
          <button
            type="button"
            onClick={aoAjustar}
            aria-label={`Ajustar ${nome}`}
            className="rounded p-1.5 text-ink-soft hover:text-primary focus-visible:outline-focus"
          >
            <Pencil aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
