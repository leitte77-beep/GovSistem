import { normalizarBarras } from "./graficos";

/**
 * Gráfico de barras em SVG puro (sem dependência) — §4.9.
 * Acessibilidade: o SVG é `role="img"` com um `aria-label` que resume a série;
 * cada barra exibe seu valor e o rótulo do mês em texto (nunca só cor).
 */
export function GraficoBarras({
  titulo,
  itens,
  sufixo = "",
}: {
  titulo: string;
  itens: { rotulo: string; valor: number }[];
  sufixo?: string;
}) {
  const { maximo, barras } = normalizarBarras(itens);

  const larguraBarra = 100 / Math.max(barras.length, 1);
  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];
  const resumo =
    itens.length > 0
      ? `${titulo}: de ${primeiro.valor}${sufixo} em ${primeiro.rotulo} a ${ultimo.valor}${sufixo} em ${ultimo.rotulo}. Máximo ${maximo}${sufixo}.`
      : `${titulo}: sem dados.`;

  return (
    <figure className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
      <figcaption className="mb-3 text-base font-semibold text-ink">{titulo}</figcaption>
      {itens.length === 0 ? (
        <p className="text-sm text-ink-soft">Sem dados no período.</p>
      ) : (
        <div role="img" aria-label={resumo}>
          <svg
            viewBox="0 0 100 44"
            preserveAspectRatio="none"
            className="h-40 w-full"
            aria-hidden="true"
          >
            {barras.map((b, i) => {
              const altura = b.fracao * 34;
              const x = i * larguraBarra + larguraBarra * 0.15;
              const largura = larguraBarra * 0.7;
              const y = 38 - altura;
              return (
                <rect
                  key={b.rotulo + i}
                  x={x}
                  y={y}
                  width={largura}
                  height={Math.max(altura, 0.5)}
                  rx={0.6}
                  fill="var(--ga-primary)"
                />
              );
            })}
          </svg>
          {/* Rótulos e valores em texto (HTML, para leitura confiável). */}
          <ul className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px] text-ink-soft sm:grid-cols-12">
            {barras.map((b, i) => (
              <li key={b.rotulo + i}>
                <span className="block fonte-mono font-semibold text-ink">{b.valor}</span>
                <span className="block">{b.rotulo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
