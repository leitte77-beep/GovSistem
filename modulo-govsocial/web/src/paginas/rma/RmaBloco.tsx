import { NumeroRMA } from "@/ui/NumeroRMA";
import type { RmaAjusteOut } from "@/tipos/rma";
import type { BlocoNormalizado, CampoNormalizado } from "./rmaModelo";
import { mapaDeAjustes } from "./rmaModelo";

/**
 * Um bloco do RMA (ex.: "Bloco C — Atendimentos individualizados") com a lista
 * de números conferíveis. Cada número tem lupa (drill-down) e, quando editável,
 * botão de ajuste.
 */
export function RmaBloco({
  bloco,
  ajustes,
  podeAjustar,
  aoDrillDown,
  aoAjustar,
}: {
  bloco: BlocoNormalizado;
  ajustes: RmaAjusteOut[];
  podeAjustar: boolean;
  aoDrillDown: (bloco: BlocoNormalizado, campo: CampoNormalizado) => void;
  aoAjustar: (bloco: BlocoNormalizado, campo: CampoNormalizado) => void;
}) {
  const porCampo = mapaDeAjustes(ajustes);

  return (
    <section
      aria-labelledby={`rma-bloco-${bloco.id}`}
      className="rounded-cartao border border-ink-soft/15 bg-surface p-4"
    >
      <h3 id={`rma-bloco-${bloco.id}`} className="mb-2 text-base">
        {bloco.rotulo}
      </h3>
      <div className="divide-y divide-ink-soft/10">
        {bloco.campos.map((campo) => {
          const ajuste = porCampo.get(`${bloco.id}::${campo.campo}`);
          return (
            <NumeroRMA
              key={campo.campo}
              codigo={campo.codigo}
              rotulo={campo.rotulo}
              valor={campo.valor}
              ajustado={Boolean(ajuste)}
              valorCalculado={ajuste?.valor_calculado ?? null}
              podeAjustar={podeAjustar}
              aoDrillDown={() => aoDrillDown(bloco, campo)}
              aoAjustar={() => aoAjustar(bloco, campo)}
            />
          );
        })}
      </div>
    </section>
  );
}
