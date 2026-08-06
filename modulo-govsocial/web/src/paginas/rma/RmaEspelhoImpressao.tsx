import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import { useRmaDetalhe } from "@/nucleo/api/hooks";
import { formatarDataHora } from "@/nucleo/datas";
import {
  mapaDeAjustes,
  normalizarBlocos,
  rotuloCompetencia,
  rotuloStatusRma,
} from "./rmaModelo";

/**
 * Espelho A4 do RMA (§4.8) — via de visualização/impressão no LayoutImpressao
 * (com brasão do tenant). Números ajustados são marcados como "(ajustado)". O
 * documento oficial numerado é gerado pelo backend.
 */
export default function RmaEspelhoImpressao() {
  const { rmaId } = useParams<{ rmaId: string }>();
  const { data: f, isLoading } = useRmaDetalhe(rmaId);

  useEffect(() => {
    if (f) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [f]);

  if (isLoading || !f) return <Skeleton variante="cartao" />;

  const blocos = normalizarBlocos(f.dados_calculados);
  const porCampo = mapaDeAjustes(f.ajustes);

  return (
    <article>
      <div className="nao-imprimir mb-4 flex justify-end">
        <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}>
          Imprimir
        </Botao>
      </div>

      <h1 className="text-lg">Relatório Mensal de Atendimentos (RMA) — espelho</h1>
      <p className="text-sm text-ink-soft">
        Competência {rotuloCompetencia(f.ano, f.mes)} · Situação: {rotuloStatusRma(f.status)}
        {f.fechado_em ? ` · Fechado em ${formatarDataHora(f.fechado_em)}` : ""}
      </p>

      {blocos.map((bloco) => (
        <section key={bloco.id} className="mt-6">
          <h2 className="text-base">{bloco.rotulo}</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-1 pr-4 font-semibold">
                  Código
                </th>
                <th scope="col" className="py-1 pr-4 font-semibold">
                  Indicador
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {bloco.campos.map((campo) => {
                const ajuste = porCampo.get(`${bloco.id}::${campo.campo}`);
                return (
                  <tr key={campo.campo} className="border-b border-ink-soft/20">
                    <td className="py-1 pr-4 fonte-mono">{campo.codigo}</td>
                    <td className="py-1 pr-4">
                      {campo.rotulo}
                      {ajuste && (
                        <span className="ml-1 text-xs text-ink-soft">
                          (ajustado de {ajuste.valor_calculado})
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right fonte-mono font-semibold tabular-nums">
                      {campo.valor}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {f.ajustes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base">Ajustes manuais</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {f.ajustes.map((a) => (
              <li key={a.id}>
                <span className="fonte-mono">{a.campo}</span>: {a.valor_calculado} →{" "}
                {a.valor_ajustado} — {a.justificativa}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-xs text-ink-soft">
        Documento de visualização. O RMA oficial numerado e auditado é emitido
        pelo sistema. Ajustes manuais ficam registrados com justificativa.
      </p>
    </article>
  );
}
