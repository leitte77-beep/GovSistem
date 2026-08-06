import { useEffect } from "react";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import {
  useDashboardBeneficios,
  useDashboardIndicadores,
  useDashboardOverview,
  useDashboardTerritorios,
} from "@/nucleo/api/hooks";
import { formatarData } from "@/nucleo/datas";
import { percentualInteiro, rotuloFaixaRenda } from "./graficos";

/**
 * Versão A4 do dashboard (§4.9) — anexo de prestação de contas, no
 * LayoutImpressao (com brasão do tenant). Só agregados; nenhum dado pessoal.
 */
export default function DashboardImpressao() {
  const overviewQ = useDashboardOverview();
  const territoriosQ = useDashboardTerritorios();
  const beneficiosQ = useDashboardBeneficios();
  const indicadoresQ = useDashboardIndicadores();

  const pronto =
    overviewQ.data && territoriosQ.data && beneficiosQ.data && indicadoresQ.data;

  useEffect(() => {
    if (pronto) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [pronto]);

  if (!pronto) return <Skeleton variante="cartao" />;

  const overview = overviewQ.data!;
  const territorios = territoriosQ.data!;
  const beneficios = beneficiosQ.data!;
  const indicadores = indicadoresQ.data!;
  const totalTerritorios = territorios.reduce((s, t) => s + t.total_familias, 0);

  return (
    <article>
      <div className="nao-imprimir mb-4 flex justify-end">
        <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}>
          Imprimir
        </Botao>
      </div>

      <h1 className="text-lg">Painel da Assistência Social — resumo</h1>
      <p className="text-sm text-ink-soft">Emitido em {formatarData(new Date().toISOString())}</p>

      <section className="mt-6">
        <h2 className="text-base">Visão geral do mês</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <tbody>
            <LinhaTabela rotulo="Atendimentos no mês" valor={overview.atendimentos_mes} />
            <LinhaTabela rotulo="Acompanhamentos ativos" valor={overview.acompanhamentos_ativos} />
            <LinhaTabela rotulo="Famílias cadastradas" valor={overview.familias_cadastradas} />
            <LinhaTabela
              rotulo="Benefícios concedidos no mês"
              valor={overview.beneficios_concedidos_mes}
            />
            <LinhaTabela
              rotulo="Encaminhamentos pendentes"
              valor={overview.encaminhamentos_pendentes}
            />
            <LinhaTabela rotulo="Grupos ativos" valor={overview.grupos_ativos} />
            <LinhaTabela rotulo="Inscritos no SCFV" valor={overview.inscritos_scfv} />
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-base">Famílias por território</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink text-left">
              <th scope="col" className="py-1 pr-4 font-semibold">
                Território
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-semibold">
                Famílias
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {territorios.map((t) => (
              <tr key={t.territorio} className="border-b border-ink-soft/20">
                <td className="py-1 pr-4">{t.territorio}</td>
                <td className="py-1 pr-4 text-right fonte-mono">{t.total_familias}</td>
                <td className="py-1 text-right fonte-mono">
                  {percentualInteiro(t.total_familias, totalTerritorios)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-base">Benefícios concedidos por tipo</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink text-left">
              <th scope="col" className="py-1 pr-4 font-semibold">
                Benefício
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-semibold">
                Concessões
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Valor total
              </th>
            </tr>
          </thead>
          <tbody>
            {beneficios.map((b) => (
              <tr key={b.tipo_beneficio} className="border-b border-ink-soft/20">
                <td className="py-1 pr-4">{b.tipo_beneficio}</td>
                <td className="py-1 pr-4 text-right fonte-mono">{b.total_concessoes}</td>
                <td className="py-1 text-right fonte-mono">
                  R$ {b.valor_total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-base">Indicadores sociais</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <tbody>
            <LinhaTabela
              rotulo="Beneficiárias do Bolsa Família"
              valor={`${indicadores.pbf} (${indicadores.pbf_percentual.toFixed(1)}%)`}
            />
            <LinhaTabela
              rotulo="Membros com BPC"
              valor={`${indicadores.bpc} (${indicadores.bpc_percentual.toFixed(1)}%)`}
            />
            <LinhaTabela
              rotulo="CadÚnico desatualizado (24 meses)"
              valor={indicadores.cadunico_desatualizado_24m}
            />
            <LinhaTabela
              rotulo="Insegurança alimentar"
              valor={indicadores.inseguranca_alimentar}
            />
            {indicadores.renda_por_faixa.map((f) => (
              <LinhaTabela
                key={f.faixa}
                rotulo={`Renda — ${rotuloFaixaRenda(f.faixa)}`}
                valor={f.total}
              />
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-xs text-ink-soft">
        Documento de visualização gerado a partir de dados agregados. Não contém
        informação pessoal.
      </p>
    </article>
  );
}

function LinhaTabela({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <tr className="border-b border-ink-soft/20">
      <th scope="row" className="py-1 pr-4 text-left font-normal">
        {rotulo}
      </th>
      <td className="py-1 text-right fonte-mono font-semibold">{valor}</td>
    </tr>
  );
}
