import { calcularFatiasDonut, corDaFatia } from "./graficos";

/**
 * Donut em SVG puro (§4.9). Regra de acessibilidade: a legenda traz rótulo,
 * valor e percentual em TEXTO (o donut nunca comunica só por cor). O SVG é
 * `role="img"` com `aria-label` resumindo a distribuição.
 */
export function GraficoDonut({
  titulo,
  itens,
  vazio = "Sem dados no período.",
}: {
  titulo: string;
  itens: { rotulo: string; valor: number }[];
  vazio?: string;
}) {
  const { total, fatias } = calcularFatiasDonut(itens);

  const resumo =
    total > 0
      ? `${titulo}: ${fatias
          .map((f) => `${f.rotulo} ${Math.round(f.percentual)}%`)
          .join(", ")}.`
      : `${titulo}: sem dados.`;

  return (
    <figure className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
      <figcaption className="mb-3 text-base font-semibold text-ink">{titulo}</figcaption>
      {total === 0 ? (
        <p className="text-sm text-ink-soft">{vazio}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div role="img" aria-label={resumo} className="shrink-0">
            <svg viewBox="0 0 42 42" className="h-32 w-32" aria-hidden="true">
              <circle
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke="var(--ga-primary-soft)"
                strokeWidth="6"
              />
              {fatias.map((f, i) => (
                <circle
                  key={f.rotulo + i}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={corDaFatia(i)}
                  strokeWidth="6"
                  strokeDasharray={`${f.percentual} ${100 - f.percentual}`}
                  strokeDashoffset={25 - f.inicio}
                />
              ))}
              <text
                x="21"
                y="21"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-ink"
                style={{ fontSize: "6px", fontWeight: 700 }}
              >
                {total}
              </text>
            </svg>
          </div>

          <ul className="min-w-[12rem] flex-1 space-y-1.5 text-sm">
            {fatias.map((f, i) => (
              <li key={f.rotulo + i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: corDaFatia(i) }}
                  />
                  <span className="text-ink">{f.rotulo}</span>
                </span>
                <span className="fonte-mono text-ink-soft">
                  {f.valor} · {Math.round(f.percentual)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
