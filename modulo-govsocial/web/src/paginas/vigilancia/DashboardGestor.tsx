import { Link } from "react-router-dom";
import {
  Activity,
  ClipboardList,
  FileText,
  HandHeart,
  Send,
} from "lucide-react";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Botao } from "@/ui/Botao";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { downloadPdf } from "@/nucleo/impressao/downloadPdf";
import { avisar } from "@/ui/Toast";
import {
  useDashboardBeneficios,
  useDashboardIndicadores,
  useDashboardMapa,
  useDashboardOverview,
  useDashboardSerie,
} from "@/nucleo/api/hooks";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import { CartaoIndicador } from "./CartaoIndicador";
import { GraficoBarras } from "./GraficoBarras";
import { GraficoDonut } from "./GraficoDonut";
import { MapaTerritorial } from "./MapaTerritorial";
import {
  beneficiosParaDonut,
  faixaRendaParaDonut,
  serieAtendimentosParaBarras,
} from "./graficos";

/**
 * Dashboard do gestor + Vigilância (§4.9). Cartões grandes clicáveis, série de
 * 12 meses (barras), distribuição por benefício (donut com rótulos textuais) e
 * mapa territorial (calor agregado; pinos identificados só p/ vigilancia.pinos,
 * com aviso de auditoria). Botão "versão para impressão" (A4 com brasão).
 */
export default function DashboardGestor() {
  const podeVer = usePermissao("vigilancia.ver");
  const podePinos = usePermissao("vigilancia.pinos");

  const overviewQ = useDashboardOverview();
  const serieQ = useDashboardSerie(12);
  const beneficiosQ = useDashboardBeneficios();
  const mapaQ = useDashboardMapa();
  const indicadoresQ = useDashboardIndicadores();

  if (!podeVer) return <EstadoSemPermissao />;

  return (
    <section aria-labelledby="titulo-dashboard" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="titulo-dashboard" className="text-xl">
            Visão geral do município
          </h1>
          <p className="text-sm text-ink-soft">
            Indicadores agregados da Assistência Social — sem dado pessoal.
          </p>
        </div>
        <Botao
          variante="secundario"
          iconeInicio={<FileText aria-hidden className="h-4 w-4" />}
          onClick={() => {
            const hoje = new Date();
            const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            const df = hoje.toISOString().slice(0, 10);
            const di = inicio.toISOString().slice(0, 10);
            downloadPdf(
              `/documentos/dashboard-prestacao-contas?data_inicio=${di}&data_fim=${df}`,
              `prestacao_contas_${df}.pdf`,
            ).then(() => avisar.sucesso("Relatório baixado com sucesso"))
              .catch((e: unknown) => avisar.erro(e instanceof Error ? e.message : "Erro ao baixar relatório"));
          }}
        >
          Versão para impressão
        </Botao>
      </div>

      {/* Linha 1 — cartões grandes */}
      {overviewQ.isLoading ? (
        <Skeleton variante="tabela" linhas={2} />
      ) : overviewQ.isError ? (
        <EstadoErro
          problema={(overviewQ.error as ErroApi).problema}
          aoTentarNovamente={() => overviewQ.refetch()}
        />
      ) : overviewQ.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CartaoIndicador
            rotulo="Atendimentos no mês"
            valor={overviewQ.data.atendimentos_mes}
            icone={<Activity aria-hidden className="h-5 w-5" />}
          />
          <CartaoIndicador
            rotulo="Acompanhamentos ativos"
            valor={overviewQ.data.acompanhamentos_ativos}
            icone={<ClipboardList aria-hidden className="h-5 w-5" />}
            para="/familias"
          />
          <CartaoIndicador
            rotulo="Benefícios concedidos no mês"
            valor={overviewQ.data.beneficios_concedidos_mes}
            icone={<HandHeart aria-hidden className="h-5 w-5" />}
          />
          <CartaoIndicador
            rotulo="Encaminhamentos pendentes"
            valor={overviewQ.data.encaminhamentos_pendentes}
            detalhe="Aguardando devolutiva"
            destaque={overviewQ.data.encaminhamentos_pendentes > 0 ? "amber" : undefined}
            icone={<Send aria-hidden className="h-5 w-5" />}
          />
        </div>
      ) : null}

      {/* Linha 2 — série + distribuição */}
      <div className="grid gap-4 lg:grid-cols-2">
        {serieQ.isLoading ? (
          <Skeleton variante="cartao" />
        ) : serieQ.data ? (
          <GraficoBarras
            titulo="Atendimentos nos últimos 12 meses"
            itens={serieAtendimentosParaBarras(serieQ.data)}
          />
        ) : null}

        {beneficiosQ.isLoading ? (
          <Skeleton variante="cartao" />
        ) : beneficiosQ.data ? (
          <GraficoDonut
            titulo="Benefícios concedidos por tipo"
            itens={beneficiosParaDonut(beneficiosQ.data)}
          />
        ) : null}
      </div>

      {/* Linha 3 — mapa + indicadores sociais */}
      <div className="grid gap-4 lg:grid-cols-2">
        {mapaQ.isLoading ? (
          <Skeleton variante="cartao" />
        ) : mapaQ.data ? (
          <MapaTerritorial itens={mapaQ.data} podePinos={podePinos} />
        ) : null}

        {indicadoresQ.isLoading ? (
          <Skeleton variante="cartao" />
        ) : indicadoresQ.data ? (
          <div className="space-y-4">
            <section
              aria-labelledby="titulo-indicadores"
              className="rounded-cartao border border-ink-soft/15 bg-surface p-4"
            >
              <h2 id="titulo-indicadores" className="mb-3 text-base">
                Indicadores sociais
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Indicador
                  rotulo="Beneficiárias do PBF"
                  valor={`${indicadoresQ.data.pbf} · ${indicadoresQ.data.pbf_percentual.toFixed(1)}%`}
                />
                <Indicador
                  rotulo="Com BPC"
                  valor={`${indicadoresQ.data.bpc} · ${indicadoresQ.data.bpc_percentual.toFixed(1)}%`}
                />
                <Indicador
                  rotulo="CadÚnico desatualizado (24m)"
                  valor={String(indicadoresQ.data.cadunico_desatualizado_24m)}
                />
                <Indicador
                  rotulo="Insegurança alimentar"
                  valor={String(indicadoresQ.data.inseguranca_alimentar)}
                />
              </div>
            </section>
            <GraficoDonut
              titulo="Famílias por faixa de renda"
              itens={faixaRendaParaDonut(indicadoresQ.data.renda_por_faixa)}
            />
          </div>
        ) : null}
      </div>

      <p className="text-xs text-ink-soft">
        Os relatórios detalhados abrem a partir de{" "}
        <Link to="/familias" className="text-primary underline focus-visible:outline-focus">
          Famílias
        </Link>
        . O mapa usa dados agregados; pinos identificados exigem perfil autorizado
        e ficam auditados.
      </p>
    </section>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-input border border-ink-soft/15 p-3">
      <p className="text-xs text-ink-soft">{rotulo}</p>
      <p className="mt-1 font-titulo text-lg text-ink">{valor}</p>
    </div>
  );
}
