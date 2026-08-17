import { useMemo, useState } from "react";
import {
  Activity,
  TrendingUp,
  Users,
  AlertTriangle,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Abas, type Aba } from "@/ui/Abas";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { CartaoIndicador } from "@/paginas/vigilancia/CartaoIndicador";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import {
  useVigilanciaIndicadoresTerritorio,
  useVigilanciaTendencias,
  useVigilanciaMapaCalor,
  useVigilanciaPerfilPopulacional,
  useVigilanciaAnomalias,
} from "@/nucleo/api/hooks";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type {
  IndicadorTerritorioItem,
  TendenciaSerieItem,
  TendenciaProjecaoItem,
  TendenciaResponse,
  PiramideEtariaItem,
  DistribuicaoItem,
  AnomaliaItem,
} from "@/tipos/vigilanciaAvancada";

const CORES_TENDENCIA = {
  crescente: "#059669",
  decrescente: "#dc2626",
  estavel: "#6b7280",
};

export default function VigilanciaAvancada() {
  const podeVer = usePermissao("vigilancia.ver");
  const [aba, setAba] = useState("indicadores");

  const hoje = new Date();
  const [mesFiltro] = useState(hoje.getMonth() + 1);
  const [anoFiltro] = useState(hoje.getFullYear());

  if (!podeVer) return <EstadoSemPermissao />;

  const abas: Aba[] = [
    { id: "indicadores", rotulo: "Indicadores", conteudo: <AbaIndicadores mes={mesFiltro} ano={anoFiltro} /> },
    { id: "tendencias", rotulo: "Tendências", conteudo: <AbaTendencias /> },
    { id: "mapa", rotulo: "Mapa de Calor", conteudo: <AbaMapaCalor /> },
    { id: "perfil", rotulo: "Perfil Populacional", conteudo: <AbaPerfil /> },
  ];

  return (
    <section aria-labelledby="titulo-vigilancia-avancada" className="space-y-4">
      <div>
        <h1 id="titulo-vigilancia-avancada" className="text-xl">
          Vigilância Socioassistencial Avançada
        </h1>
        <p className="text-sm text-ink-soft">
          Análise territorial, tendências, mapa de calor e perfil populacional.
        </p>
      </div>
      <Abas abas={abas} ativa={aba} aoMudar={setAba} rotulo="Seções da vigilância avançada" />
    </section>
  );
}

function AbaIndicadores({ mes, ano }: { mes: number; ano: number }) {
  const q = useVigilanciaIndicadoresTerritorio(mes, ano);

  if (q.isLoading) return <Skeleton variante="tabela" linhas={6} />;
  if (q.isError) return <EstadoErro problema={(q.error as ErroApi).problema} aoTentarNovamente={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) {
    return <EstadoVazio titulo="Nenhum dado territorial encontrado" descricao={`Nenhuma família registrada no período ${mes}/${ano}.`} />;
  }

  const data = q.data;
  const totalFamilias = data.reduce((s: number, i: IndicadorTerritorioItem) => s + i.total_familias, 0);
  const totalAtendimentos = data.reduce((s: number, i: IndicadorTerritorioItem) => s + i.atendimentos_mes, 0);
  const totalBeneficios = data.reduce((s: number, i: IndicadorTerritorioItem) => s + i.beneficios_mes, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoIndicador rotulo="Famílias cadastradas" valor={totalFamilias} icone={<Users aria-hidden className="h-5 w-5" />} />
        <CartaoIndicador rotulo="Atendimentos no mês" valor={totalAtendimentos} icone={<Activity aria-hidden className="h-5 w-5" />} />
        <CartaoIndicador rotulo="Benefícios concedidos" valor={totalBeneficios} icone={<TrendingUp aria-hidden className="h-5 w-5" />} />
        <CartaoIndicador rotulo={`Período`} valor={`${String(mes).padStart(2, "0")}/${ano}`} icone={<Activity aria-hidden className="h-5 w-5" />} />
      </div>

      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <h2 className="mb-3 text-base">
          Ranking por território — {String(mes).padStart(2, "0")}/{ano}
        </h2>
        <TabelaRankingTerritorio data={data} />
      </div>
    </div>
  );
}

function TabelaRankingTerritorio({ data }: { data: IndicadorTerritorioItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-soft/15 text-left text-xs uppercase text-ink-soft">
            <th className="py-2 pr-4">#</th>
            <th className="py-2 pr-4">Território</th>
            <th className="py-2 pr-4 text-right">Famílias</th>
            <th className="py-2 pr-4 text-right">Atendimentos</th>
            <th className="py-2 pr-4 text-right">Benefícios</th>
            <th className="py-2 pr-4 text-right">Tx. Atend.</th>
            <th className="py-2 text-right">Tx. Benef.</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, idx) => (
            <tr key={item.territorio} className="border-b border-ink-soft/5 hover:bg-ink-soft/5">
              <td className="py-2 pr-4 text-ink-soft">{idx + 1}</td>
              <td className="py-2 pr-4 font-medium">{item.territorio}</td>
              <td className="py-2 pr-4 text-right">{item.total_familias}</td>
              <td className="py-2 pr-4 text-right">{item.atendimentos_mes}</td>
              <td className="py-2 pr-4 text-right">{item.beneficios_mes}</td>
              <td className="py-2 pr-4 text-right">{(item.taxa_atendimento * 100).toFixed(1)}%</td>
              <td className="py-2 text-right">{(item.taxa_beneficio * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbaTendencias() {
  const q = useVigilanciaTendencias(12);

  const { serie = [], projecao = [], tendencia_geral } = (q.data ?? {}) as TendenciaResponse;
  const todos = useMemo(() => [...serie, ...projecao], [serie, projecao]);

  const maxVal = useMemo(
    () => Math.max(...todos.map((s) => {
      const a = (s as TendenciaSerieItem).atendimentos ?? 0;
      const p = (s as TendenciaSerieItem & { atendimentos_projetados?: number }).atendimentos_projetados ?? 0;
      return Math.max(a, p);
    }), 1),
    [todos],
  );

  if (q.isLoading) return <Skeleton variante="cartao" />;
  if (q.isError) return <EstadoErro problema={(q.error as ErroApi).problema} aoTentarNovamente={() => q.refetch()} />;
  if (!q.data) return <EstadoVazio titulo="Nenhuma tendência disponível" />;

  const iconeTendencia =
    tendencia_geral === "crescente" ? <TrendingUp className="h-4 w-4" /> :
    tendencia_geral === "decrescente" ? <TrendingDown className="h-4 w-4" /> :
    <Minus className="h-4 w-4" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 rounded-input px-3 py-1.5 text-sm font-medium"
          style={{ backgroundColor: CORES_TENDENCIA[tendencia_geral] + "18", color: CORES_TENDENCIA[tendencia_geral] }}
        >
          {iconeTendencia}
          Tendência {tendencia_geral.toUpperCase()}
        </div>
        {projecao.length > 0 && (
          <span className="text-xs text-ink-soft">
            Projeção linear para os próximos {projecao.length} meses
          </span>
        )}
      </div>

      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <h2 className="mb-4 text-base">Evolução de Atendimentos (12 meses + projeção)</h2>
        <SvgGraficoLinha
          pontos={todos}
          maxVal={maxVal}
          projecaoInicio={serie.length}
          altura={280}
        />
        <div className="mt-3 flex items-center gap-4 text-xs text-ink-soft">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-primary" />
            Realizado
          </div>
          {projecao.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm border-2 border-dashed border-amber-500 bg-transparent" />
              Projeção
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SvgGraficoLinha({
  pontos,
  maxVal,
  projecaoInicio,
  altura = 280,
}: {
  pontos: Array<{
    rotulo: string;
    atendimentos?: number;
    atendimentos_projetados?: number;
  }>;
  maxVal: number;
  projecaoInicio: number;
  altura?: number;
}) {
  const largura = 700;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const w = largura - padL - padR;
  const h = altura - padT - padB;
  const n = pontos.length;

  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v: number) => padT + h - (maxVal > 0 ? (v / maxVal) * h : 0);

  const realizados = pontos.filter((_, i) => i < projecaoInicio && pontos[i].atendimentos != null).map((p, i) => ({ ...p, idx: i }));
  const projetados = pontos.filter((_, i) => i >= projecaoInicio && (pontos[i] as TendenciaProjecaoItem).atendimentos_projetados != null).map((p, i) => ({ ...p, idx: projecaoInicio + i })) as (TendenciaProjecaoItem & { idx: number })[];

  const linhaReal = realizados
    .map((p) => `${x(p.idx)},${y(p.atendimentos!)}`)
    .join(" ");
  const dashedReal = realizados.length > 1 ? `M${x(realizados[0].idx)},${y(realizados[0].atendimentos!)} L${linhaReal.split(" ").slice(1).join(" L")}` : "";

  const linhaProj = projetados.length > 0
    ? projetados.map((p) => `${x(p.idx)},${y(p.atendimentos_projetados)}`).join(" ")
    : "";

  const grades = 4;
  const valoresY = Array.from({ length: grades }, (_, i) => Math.round((maxVal / (grades - 1)) * i));

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img" aria-label="Gráfico de linha — evolução de atendimentos">
      {valoresY.map((v, i) => (
        <g key={`grade-${i}`}>
          <line x1={padL} y1={y(v)} x2={largura - padR} y2={y(v)} stroke="#e5e7eb" strokeWidth={0.5} />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="text-[10px]" fill="#9ca3af">
            {v}
          </text>
        </g>
      ))}

      {dashedReal && (
        <polyline
          points={dashedReal.replace(/[A-Z]/g, "").replace(/[a-z]/g, "").trim()}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {realizados.map((p) => (
        <circle
          key={`dot-real-${p.idx}`}
          cx={x(p.idx)}
          cy={y(p.atendimentos!)}
          r={4}
          fill="#2563eb"
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}

      {projetados.length > 0 && (
        <polyline
          points={linhaProj.replace(/[A-Z]/g, "").replace(/[a-z]/g, "").trim()}
          fill="none"
          stroke="#d97706"
          strokeWidth={2}
          strokeDasharray="6,4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {projetados.map((p) => (
        <circle
          key={`dot-proj-${p.idx}`}
          cx={x(p.idx)}
          cy={y(p.atendimentos_projetados)}
          r={4}
          fill="#d97706"
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}

      {pontos.map((p, i) => (
        <text
          key={`label-${i}`}
          x={x(i)}
          y={altura - 6}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          className="text-[10px]"
          fill="#6b7280"
          transform={n > 8 ? `rotate(-35,${x(i)},${altura - 6})` : undefined}
        >
          {p.rotulo}
        </text>
      ))}
    </svg>
  );
}

function AbaMapaCalor() {
  const [tipo, setTipo] = useState<"vulnerabilidade" | "densidade">("vulnerabilidade");
  const q = useVigilanciaMapaCalor(tipo);

  if (q.isLoading) return <Skeleton variante="cartao" className="h-[500px]" />;
  if (q.isError) return <EstadoErro problema={(q.error as ErroApi).problema} aoTentarNovamente={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) {
    return <EstadoVazio titulo="Nenhum dado geolocalizado" descricao="Cadastre famílias com endereço para gerar o mapa de calor." />;
  }

  const data = q.data;
  const pontosComCoords = data.filter((p) => p.centroide_lat && p.centroide_lng);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTipo("vulnerabilidade")}
          className={`rounded-input px-3 py-1.5 text-sm transition-colors ${
            tipo === "vulnerabilidade"
              ? "bg-primary text-white"
              : "border border-ink-soft/30 hover:border-primary"
          }`}
        >
          Vulnerabilidade
        </button>
        <button
          onClick={() => setTipo("densidade")}
          className={`rounded-input px-3 py-1.5 text-sm transition-colors ${
            tipo === "densidade"
              ? "bg-primary text-white"
              : "border border-ink-soft/30 hover:border-primary"
          }`}
        >
          Densidade
        </button>
      </div>

      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <h2 className="mb-3 text-base">
          {tipo === "vulnerabilidade" ? "Mapa de calor — Vulnerabilidade" : "Mapa de calor — Densidade populacional"}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((item) => (
            <div
              key={`${item.territorio}-${item.bairro}`}
              className="rounded-input border border-ink-soft/15 p-3"
              style={{
                borderLeftWidth: 4,
                borderLeftColor: corIntensidade(item.intensidade),
              }}
            >
              <p className="text-sm font-medium">{item.bairro}</p>
              <p className="text-xs text-ink-soft">{item.territorio}</p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span>
                  <strong>{item.total_familias}</strong> famílias
                </span>
                <span className="text-ink-soft">
                  Intensidade: {(item.intensidade * 100).toFixed(0)}%
                </span>
              </div>
              {tipo === "vulnerabilidade" && (
                <div className="mt-1 text-xs text-ink-soft">
                  IA: {item.inseguranca_alimentar ?? 0} · PBF: {item.beneficiarios_pbf ?? 0}
                </div>
              )}
            </div>
          ))}
        </div>
        {pontosComCoords.length > 0 && (
          <p className="mt-4 text-xs text-ink-soft">
            {pontosComCoords.length} territórios geolocalizados · Clique na aba Mapa no menu lateral para visualização interativa.
          </p>
        )}
      </div>
    </div>
  );
}

function corIntensidade(intensidade: number): string {
  if (intensidade >= 0.7) return "#dc2626";
  if (intensidade >= 0.4) return "#f59e0b";
  if (intensidade >= 0.15) return "#22c55e";
  return "#3b82f6";
}

function AbaPerfil() {
  const q = useVigilanciaPerfilPopulacional();
  const anomaliasQ = useVigilanciaAnomalias();

  if (q.isLoading) return <Skeleton variante="cartao" />;
  if (q.isError) return <EstadoErro problema={(q.error as ErroApi).problema} aoTentarNovamente={() => q.refetch()} />;
  if (!q.data || q.data.total_pessoas === 0) {
    return <EstadoVazio titulo="Nenhuma pessoa cadastrada" descricao="Cadastre membros nas famílias para visualizar o perfil populacional." />;
  }

  const { piramide_etaria, sexo, raca_cor, escolaridade } = q.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
          <h2 className="mb-4 text-base">Pirâmide Etária</h2>
          <PiramideEtariaSimplificada data={piramide_etaria} />
        </div>

        <div className="space-y-4">
          <CardDistribuicao titulo="Sexo" data={sexo} corBase="#2563eb" />
          <CardDistribuicao titulo="Raça/Cor" data={raca_cor} corBase="#7c3aed" />
          <CardDistribuicao titulo="Escolaridade" data={escolaridade} corBase="#059669" />
        </div>
      </div>

      {!anomaliasQ.isLoading && anomaliasQ.data && anomaliasQ.data.length > 0 && (
        <div className="rounded-cartao border border-amber-500/30 bg-amber-50 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-base text-amber-800">
            <AlertTriangle className="h-5 w-5" />
            Anomalias detectadas
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(anomaliasQ.data as AnomaliaItem[]).slice(0, 4).map((a, i) => (
              <div key={i} className="rounded-input border border-amber-500/20 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      a.severidade === "alta" ? "bg-danger/10 text-danger" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {a.severidade.toUpperCase()}
                  </span>
                  <span className="text-xs text-ink-soft">{a.rotulo}</span>
                </div>
                <p className="mt-1 text-sm">
                  Pico de {a.tipo === "atendimento" ? "atendimentos" : "benefícios"}:{" "}
                  <strong>{a.valor}</strong> (média esperada: {a.media_esperada} ± {Math.round(a.desvio_padrao)})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PiramideEtariaSimplificada({ data }: { data: PiramideEtariaItem[] }) {
  const maxVal = useMemo(
    () => Math.max(...data.map((d) => Math.max(d.masculino, d.feminino)), 1),
    [data],
  );

  const altura = data.length * 28 + 30;
  const largura = 400;
  const meioX = largura / 2;
  const barraW = meioX - 60;

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img" aria-label="Pirâmide etária">
      <text x={meioX} y={16} textAnchor="middle" className="text-[10px]" fill="#6b7280">
        Feminino ← → Masculino
      </text>
      {data.map((d, i) => {
        const y = 28 + i * 28;
        const wF = (d.feminino / maxVal) * barraW;
        const wM = (d.masculino / maxVal) * barraW;
        return (
          <g key={d.faixa}>
            <rect x={meioX - wF} y={y} width={wF} height={20} rx={3} fill="#ec4899" opacity={0.7} />
            <text x={meioX - wF - 4} y={y + 14} textAnchor="end" className="text-[10px]" fill="#6b7280">
              {d.feminino}
            </text>
            <rect x={meioX} y={y} width={wM} height={20} rx={3} fill="#3b82f6" opacity={0.7} />
            <text x={meioX + wM + 4} y={y + 14} textAnchor="start" className="text-[10px]" fill="#6b7280">
              {d.masculino}
            </text>
            <text x={meioX} y={y + 14} textAnchor="middle" className="text-[10px] font-medium" fill="#374151">
              {d.faixa}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CardDistribuicao({
  titulo,
  data,
  corBase,
}: {
  titulo: string;
  data: DistribuicaoItem[];
  corBase: string;
}) {
  return (
    <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium">{titulo}</h3>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.valor} className="flex items-center gap-2">
            <div className="w-20 flex-shrink-0 text-xs text-ink-soft truncate" title={d.rotulo}>
              {d.rotulo}
            </div>
            <div className="flex-1">
              <div className="h-5 w-full rounded-sm bg-ink-soft/10">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${Math.max(2, d.percentual)}%`,
                    backgroundColor: corBase,
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
            <div className="w-16 flex-shrink-0 text-right text-xs">
              <span className="font-medium">{d.total}</span>
              <span className="ml-1 text-ink-soft">{d.percentual}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
