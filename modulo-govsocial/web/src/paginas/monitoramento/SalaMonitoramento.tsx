import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Activity,
  AlertTriangle,
  Bell,
  Clock,
  HandHeart,
  MapPin,
  Pause,
  Play,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDashboardOverview,
  useDashboardIndicadores,
  useDashboardSerie,
  useDashboardBeneficios,
  useDashboardMapa,
  useDashboardTerritorios,
  usePanicButtonAtivos,
  useVigilanciaAnomalias,
  useOrganizationConfig,
} from "@/nucleo/api/hooks";
import { Skeleton } from "@/ui/Skeleton";
import { normalizarBarras, calcularFatiasDonut, corDaFatia } from "@/paginas/vigilancia/graficos";
import { rotuloMesCurto } from "@/paginas/vigilancia/graficos";
import { EstadoErro } from "@/ui/EstadoErro";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { MapItem, BenefitReportItem, TimeSeriesItem } from "@/tipos/dashboard";
import type { PanicButtonListItem } from "@/tipos/panicButton";
import type { AnomaliaItem } from "@/tipos/vigilanciaAvancada";

const PAINEIS = [
  "visao-geral",
  "atendimentos",
  "mapa",
  "alertas",
  "beneficios",
] as const;

const TEMPO_ROTACAO = 30_000;
const TEMPO_REFRESH = 60_000;
const INTERVALO_PROGRESSO = 200;

type CorStatus = "verde" | "amarelo" | "vermelho";

const ICONES_MARCADORES: Record<string, string> = {
  CRAS: "#2563eb",
  CREAS: "#dc2626",
  "Centro POP": "#7c3aed",
  DEFAULT: "#0891b2",
};

function criarIconeLeaflet(cor: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${cor};width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

function formatarNumero(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function indicadorStatus(valor: number, limiteAmarelo: number, limiteVermelho: number): CorStatus {
  if (valor > limiteVermelho) return "vermelho";
  if (valor > limiteAmarelo) return "amarelo";
  return "verde";
}

const COR_BORDA: Record<CorStatus, string> = {
  verde: "border-emerald-500/50",
  amarelo: "border-amber-500/50",
  vermelho: "border-red-500/50",
};

const COR_TEXTO: Record<CorStatus, string> = {
  verde: "text-emerald-400",
  amarelo: "text-amber-400",
  vermelho: "text-red-400",
};

const COR_LUZ: Record<CorStatus, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-500",
  vermelho: "bg-red-500",
};

function useRelogioDigital() {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return hora;
}

function Relogio() {
  const agora = useRelogioDigital();
  return (
    <div className="flex items-center gap-3">
      <Clock className="h-10 w-10 text-white/70" />
      <span className="font-mono text-5xl font-bold tracking-wider text-white tabular-nums">
        {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}

function KpiCartao({
  rotulo,
  valor,
  icone,
  cor,
}: {
  rotulo: string;
  valor: number | string;
  icone: ReactNode;
  cor?: CorStatus;
}) {
  return (
    <div className={`rounded-2xl border-2 bg-white/5 p-6 backdrop-blur-sm ${cor ? COR_BORDA[cor] : "border-white/10"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-lg font-semibold text-white/60">{rotulo}</span>
        <span className={cor ? COR_TEXTO[cor] : "text-white/40"}>{icone}</span>
      </div>
      <p className={`mt-3 font-mono text-5xl font-bold tabular-nums tracking-tight ${cor ? COR_TEXTO[cor] : "text-white"}`}>
        {typeof valor === "number" ? formatarNumero(valor) : valor}
      </p>
      {cor && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${COR_LUZ[cor]} shadow-lg ${cor === "vermelho" ? "animate-pulse" : ""}`} />
          <span className={`text-sm font-medium ${COR_TEXTO[cor]}`}>
            {cor === "verde" ? "Normal" : cor === "amarelo" ? "Atenção" : "Crítico"}
          </span>
        </div>
      )}
    </div>
  );
}

function PainelVisaoGeral() {
  const overviewQ = useDashboardOverview();
  const indicadoresQ = useDashboardIndicadores();
  const configQ = useOrganizationConfig();

  const nomeMunicipio = configQ.data?.nome_municipio ?? "Município";

  if (overviewQ.isLoading || indicadoresQ.isLoading) {
    return <PainelMoldura titulo="Visão Geral"><Skeleton variante="cartao" /></PainelMoldura>;
  }
  if (overviewQ.isError) {
    return (
      <PainelMoldura titulo="Visão Geral">
        <EstadoErro problema={(overviewQ.error as ErroApi).problema} aoTentarNovamente={() => overviewQ.refetch()} />
      </PainelMoldura>
    );
  }

  const ov = overviewQ.data;
  const ind = indicadoresQ.data;
  const fila = (ov?.encaminhamentos_pendentes ?? 0) + (ov?.acompanhamentos_ativos ?? 0) * 0.3;

  return (
    <PainelMoldura titulo="Visão Geral">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Relogio />
            <h2 className="mt-2 text-3xl font-bold text-white/90">{nomeMunicipio}</h2>
          </div>
          <div className="text-right">
            <p className="text-lg text-white/50">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCartao rotulo="Total Famílias" valor={ind?.total_familias ?? ov?.familias_cadastradas ?? 0} icone={<Users className="h-8 w-8" />} />
          <KpiCartao
            rotulo="Atendimentos no Mês"
            valor={ov?.atendimentos_mes ?? 0}
            icone={<Activity className="h-8 w-8" />}
            cor={indicadorStatus(ov?.atendimentos_mes ?? 0, 100, 200)}
          />
          <KpiCartao
            rotulo="Benefícios Mês"
            valor={ov?.beneficios_concedidos_mes ?? 0}
            icone={<HandHeart className="h-8 w-8" />}
            cor={indicadorStatus(ov?.beneficios_concedidos_mes ?? 0, 50, 150)}
          />
          <KpiCartao
            rotulo="Fila de Espera"
            valor={Math.round(fila)}
            icone={<Clock className="h-8 w-8" />}
            cor={fila > 20 ? "vermelho" : fila > 10 ? "amarelo" : "verde"}
          />
        </div>

        {ind && (
          <div className="grid grid-cols-2 gap-3">
            <IndicadorSecundario rotulo="Beneficiárias PBF" valor={`${ind.pbf} (${ind.pbf_percentual.toFixed(1)}%)`} />
            <IndicadorSecundario rotulo="Com BPC" valor={`${ind.bpc} (${ind.bpc_percentual.toFixed(1)}%)`} />
            <IndicadorSecundario rotulo="CadÚnico Desatualizado" valor={String(ind.cadunico_desatualizado_24m)} />
            <IndicadorSecundario rotulo="Insegurança Alimentar" valor={String(ind.inseguranca_alimentar)} />
          </div>
        )}
      </div>
    </PainelMoldura>
  );
}

function IndicadorSecundario({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-base text-white/50">{rotulo}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-white">{valor}</p>
    </div>
  );
}

function PainelAtendimentos() {
  const serieQ = useDashboardSerie(12);
  const territoriosQ = useDashboardTerritorios();

  if (serieQ.isLoading) {
    return <PainelMoldura titulo="Atendimentos por Unidade"><Skeleton variante="cartao" /></PainelMoldura>;
  }

  if (serieQ.isError) {
    return (
      <PainelMoldura titulo="Atendimentos por Unidade">
        <EstadoErro problema={(serieQ.error as ErroApi).problema} aoTentarNovamente={() => serieQ.refetch()} />
      </PainelMoldura>
    );
  }

  const serie = serieQ.data ?? [];
  const itensBarras = serie.map((s: TimeSeriesItem) => ({
    rotulo: rotuloMesCurto(s.mes),
    valor: s.atendimentos,
  }));
  const { maximo, barras } = normalizarBarras(itensBarras);
  const totalAtendimentos = itensBarras.reduce((s, i) => s + i.valor, 0);
  const meta = Math.max(totalAtendimentos, maximo * 2);

  const territorios = territoriosQ.data ?? [];

  return (
    <PainelMoldura titulo="Atendimentos por Unidade">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg text-white/60">Últimos 12 meses</p>
            <p className="mt-1 font-mono text-4xl font-bold text-white">{formatarNumero(totalAtendimentos)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg text-white/60">Meta mensal</p>
            <p className="mt-1 font-mono text-4xl font-bold text-emerald-400">{formatarNumero(meta)}</p>
            <div className="mt-2 h-3 w-full rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, (maximo / meta) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-white/40">{Math.round((maximo / Math.max(meta, 1)) * 100)}% da meta</p>
          </div>
        </div>

        <div className="flex items-end gap-2" style={{ height: "260px" }}>
          {/* Fix container height and flex-end for bars growing upward */}
          <div className="flex items-end gap-2 w-full h-full">
            {barras.map((b, i) => (
              <div key={b.rotulo + i} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="mb-1 font-mono text-sm font-bold text-white">{b.valor}</span>
                <div
                  className="w-full rounded-t-lg bg-cyan-500 transition-all"
                  style={{
                    height: `${Math.max(b.fracao * 90, 2)}%`,
                    opacity: 0.6 + b.fracao * 0.4,
                  }}
                />
                <div className="mt-2 h-px w-full bg-white/10" />
                <span className="mt-1 text-xs text-white/40">{b.rotulo}</span>
              </div>
            ))}
          </div>
        </div>

        {territorios.length > 0 && (
          <div>
            <h3 className="mb-3 text-xl font-semibold text-white/80">Ranking de Territórios</h3>
            <div className="space-y-2">
              {[...territorios]
                .sort((a, b) => b.total_familias - a.total_familias)
                .slice(0, 8)
                .map((t, i) => (
                  <div key={t.territorio} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                    <span className="font-mono text-2xl font-bold text-white/30 w-10">#{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-lg font-medium text-white/90">{t.territorio}</p>
                    </div>
                    <span className="font-mono text-2xl font-bold text-white">{t.total_familias}</span>
                    <span className="text-sm text-white/40">famílias</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </PainelMoldura>
  );
}

function MapaRecenter({ pontos }: { pontos: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (pontos.length > 1) {
      const bounds = L.latLngBounds(pontos.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (pontos.length === 1) {
      map.setView([pontos[0].lat, pontos[0].lng], 14);
    }
  }, [map, pontos]);
  return null;
}

function PainelMapa() {
  const mapaQ = useDashboardMapa();

  if (mapaQ.isLoading) {
    return <PainelMoldura titulo="Mapa de Atendimento"><Skeleton variante="cartao" /></PainelMoldura>;
  }

  if (mapaQ.isError) {
    return (
      <PainelMoldura titulo="Mapa de Atendimento">
        <EstadoErro problema={(mapaQ.error as ErroApi).problema} aoTentarNovamente={() => mapaQ.refetch()} />
      </PainelMoldura>
    );
  }

  const pontos = (mapaQ.data ?? []).filter(
    (p: MapItem) => p.centroide_lat != null && p.centroide_lng != null,
  );

  const coords = pontos.map((p: MapItem) => ({
    lat: p.centroide_lat as number,
    lng: p.centroide_lng as number,
  }));

  const centroPadrao: [number, number] = coords.length > 0
    ? [coords[0].lat, coords[0].lng]
    : [-15.7801, -47.9292];

  return (
    <PainelMoldura titulo="Mapa de Atendimento" full>
      <MapContainer
        center={centroPadrao}
        zoom={5}
        className="h-full w-full"
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {pontos.map((p: MapItem, i: number) => {
          const cor = ICONES_MARCADORES.DEFAULT;
          return (
            <Marker
              key={p.territorio + i}
              position={[p.centroide_lat as number, p.centroide_lng as number]}
              icon={criarIconeLeaflet(cor)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{p.territorio}</p>
                  {p.bairro && <p className="text-xs text-gray-500">{p.bairro}</p>}
                  <p className="mt-1 font-bold">{p.total_familias} famílias</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <MapaRecenter pontos={coords} />
      </MapContainer>
    </PainelMoldura>
  );
}

function PainelAlertas() {
  const panicoQ = usePanicButtonAtivos();
  const anomaliasQ = useVigilanciaAnomalias();
  const overviewQ = useDashboardOverview();

  const ativos = Array.isArray(panicoQ.data) ? panicoQ.data : [];
  const anomalias = Array.isArray(anomaliasQ.data) ? anomaliasQ.data : [];
  const pendentes = overviewQ.data?.encaminhamentos_pendentes ?? 0;

  return (
    <PainelMoldura titulo="Central de Alertas">
      <div className="flex flex-col gap-6">
        <div className={`rounded-2xl border-2 p-6 ${ativos.length > 0 ? "border-red-500/60 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className={`h-10 w-10 ${ativos.length > 0 ? "text-red-400 animate-pulse" : "text-white/30"}`} />
              <div>
                <h3 className="text-2xl font-bold text-white">Botão do Pânico</h3>
                <p className="text-base text-white/50">Lei Maria da Penha</p>
              </div>
            </div>
            <span className={`font-mono text-6xl font-bold tabular-nums ${ativos.length > 0 ? "text-red-400" : "text-white/30"}`}>
              {ativos.length}
            </span>
          </div>
          {ativos.length > 0 && (
            <div className="mt-4 space-y-2">
              {ativos.slice(0, 3).map((a: PanicButtonListItem) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <span className="text-base font-medium text-white/80">
                    Ativado {new Date(a.activated_at).toLocaleTimeString("pt-BR")}
                  </span>
                  {a.location_address && (
                    <span className="flex items-center gap-1 text-sm text-white/50">
                      <MapPin className="h-4 w-4" />
                      {a.location_address}
                    </span>
                  )}
                </div>
              ))}
              {ativos.length > 3 && (
                <p className="text-center text-sm text-white/40">+{ativos.length - 3} alertas adicionais</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-2xl border-2 p-5 ${pendentes > 0 ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-white/5"}`}>
            <div className="flex items-center gap-2">
              <Bell className={`h-6 w-6 ${pendentes > 0 ? "text-amber-400" : "text-white/30"}`} />
              <span className="text-lg font-medium text-white/70">Encaminhamentos Pendentes</span>
            </div>
            <p className={`mt-3 font-mono text-4xl font-bold ${pendentes > 0 ? "text-amber-400" : "text-white/40"}`}>
              {pendentes}
            </p>
          </div>

          <div className={`rounded-2xl border-2 p-5 ${anomalias.length > 0 ? "border-red-500/50 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-6 w-6 ${anomalias.length > 0 ? "text-red-400" : "text-white/30"}`} />
              <span className="text-lg font-medium text-white/70">Anomalias Detectadas</span>
            </div>
            <p className={`mt-3 font-mono text-4xl font-bold ${anomalias.length > 0 ? "text-red-400" : "text-white/40"}`}>
              {anomalias.length}
            </p>
          </div>
        </div>

        {anomalias.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white/60">Detalhes das Anomalias</h3>
            {anomalias.slice(0, 5).map((a: AnomaliaItem, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${a.severidade === "alta" ? "bg-red-500/30 text-red-300" : "bg-amber-500/30 text-amber-300"}`}>
                    {a.severidade === "alta" ? "Alta" : "Média"}
                  </span>
                  <span className="text-base text-white/80">
                    {a.tipo === "atendimento" ? "Atendimentos" : "Benefícios"} em {a.rotulo}
                  </span>
                </div>
                <span className="font-mono text-lg font-bold text-red-300">{a.valor} (média: {Math.round(a.media_esperada)})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PainelMoldura>
  );
}

function PainelBeneficios() {
  const beneficiosQ = useDashboardBeneficios();
  const overviewQ = useDashboardOverview();

  if (beneficiosQ.isLoading) {
    return <PainelMoldura titulo="Benefícios"><Skeleton variante="cartao" /></PainelMoldura>;
  }

  if (beneficiosQ.isError) {
    return (
      <PainelMoldura titulo="Benefícios">
        <EstadoErro problema={(beneficiosQ.error as ErroApi).problema} aoTentarNovamente={() => beneficiosQ.refetch()} />
      </PainelMoldura>
    );
  }

  const itens = (beneficiosQ.data ?? []).map((b: BenefitReportItem) => ({
    rotulo: b.tipo_beneficio,
    valor: b.total_concessoes,
  }));
  const { total, fatias } = calcularFatiasDonut(itens);
  const totalEntregue = (overviewQ.data?.beneficios_concedidos_mes ?? 0);
  const meta = Math.max(totalEntregue, Math.ceil(totalEntregue * 1.2));

  return (
    <PainelMoldura titulo="Benefícios">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg text-white/60">Total Entregue no Mês</p>
            <p className="mt-1 font-mono text-5xl font-bold text-white">{formatarNumero(totalEntregue)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg text-white/60">Meta de Entregas</p>
            <p className="mt-1 font-mono text-5xl font-bold text-emerald-400">{formatarNumero(meta)}</p>
            <div className="mt-2 h-3 w-64 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, (totalEntregue / Math.max(meta, 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-white/40">{Math.round((totalEntregue / Math.max(meta, 1)) * 100)}% da meta</p>
          </div>
        </div>

        {total > 0 && (
          <div className="flex items-start gap-10">
            <div className="shrink-0">
              <svg viewBox="0 0 48 48" className="h-56 w-56">
                <circle cx="24" cy="24" r="18" fill="transparent" stroke="rgb(255 255 255 / 0.1)" strokeWidth="8" />
                {fatias.map((f, i) => {
                  const dash = `${f.percentual} ${100 - f.percentual}`;
                  return (
                    <circle
                      key={f.rotulo + i}
                      cx="24" cy="24" r="18"
                      fill="transparent"
                      stroke={corDaFatia(i)}
                      strokeWidth="8"
                      strokeDasharray={dash}
                      strokeDashoffset={25 - f.inicio}
                    />
                  );
                })}
                <text x="24" y="24" textAnchor="middle" dominantBaseline="central" className="fill-white" style={{ fontSize: "8px", fontWeight: 700 }}>
                  {total}
                </text>
              </svg>
            </div>
            <div className="flex-1 space-y-3">
              {fatias.map((f, i) => (
                <div key={f.rotulo + i} className="flex items-center justify-between rounded-lg bg-white/5 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-block h-4 w-4 rounded-sm" style={{ background: corDaFatia(i) }} />
                    <span className="text-lg font-medium text-white/80">{f.rotulo}</span>
                  </div>
                  <span className="font-mono text-xl font-bold text-white">
                    {f.valor} <span className="text-base text-white/40">({Math.round(f.percentual)}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PainelMoldura>
  );
}

function PainelMoldura({
  titulo,
  children,
  full,
}: {
  titulo: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex h-full flex-col ${full ? "" : "p-8"}`}>
      {!full && (
        <h1 className="mb-6 text-4xl font-bold text-white/90">{titulo}</h1>
      )}
      <div className={`${full ? "h-full" : "flex-1 overflow-auto"}`}>
        {children}
      </div>
    </div>
  );
}

function BarraProgresso({ progresso }: { progresso: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
      <div
        className="h-full bg-cyan-500 transition-all duration-200 ease-linear"
        style={{ width: `${progresso}%` }}
      />
    </div>
  );
}

function Rodape({
  ultimaAtualizacao,
  painelAtivo,
  pausado,
  aoPausar,
  tempoRestante,
}: {
  ultimaAtualizacao: Date | null;
  painelAtivo: number;
  pausado: boolean;
  aoPausar: () => void;
  tempoRestante: number;
}) {
  const nomePainel: Record<number, string> = {
    0: "Visão Geral",
    1: "Atendimentos",
    2: "Mapa",
    3: "Alertas",
    4: "Benefícios",
  };

  return (
    <div className="absolute bottom-5 left-8 right-8 flex items-center justify-between text-white/40">
      <div className="flex items-center gap-4">
        <button
          onClick={aoPausar}
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-base text-white/80 transition-colors hover:bg-white/20"
          aria-label={pausado ? "Retomar rotação" : "Pausar rotação"}
        >
          {pausado ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          {pausado ? "Retomar" : "Pausar"}
        </button>
        <span className="text-base">
          Painel {painelAtivo + 1}/5 — {nomePainel[painelAtivo]}
        </span>
        <span className="text-base tabular-nums">
          Próxima troca em {tempoRestante}s
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-base">
          Atualizado: {ultimaAtualizacao ? ultimaAtualizacao.toLocaleTimeString("pt-BR") : "--:--:--"}
        </span>
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
      </div>
    </div>
  );
}

function IndicadoresPainel({ painelAtivo }: { painelAtivo: number }) {
  return (
    <div className="absolute left-8 top-8 z-20 flex gap-3">
      {PAINEIS.map((_, i) => (
        <button
          key={i}
          aria-label={`Painel ${i + 1}`}
          className={`h-3 w-3 rounded-full transition-all ${
            i === painelAtivo ? "bg-cyan-400 scale-125 shadow-lg shadow-cyan-400/50" : "bg-white/30"
          }`}
        />
      ))}
    </div>
  );
}

export default function SalaMonitoramento() {
  const [painelAtivo, setPainelAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [tempoRestante, setTempoRestante] = useState(Math.ceil(TEMPO_ROTACAO / 1000));
  const [transicao, setTransicao] = useState(false);
  const queryClient = useQueryClient();

  const contadorFrame = useRef<number>(0);
  const marcadorRotacao = useRef<number>(0);

  const avancarPainel = useCallback(() => {
    setTransicao(true);
    setTimeout(() => {
      setPainelAtivo((p) => (p + 1) % PAINEIS.length);
      setTransicao(false);
    }, 400);
  }, []);

  const refetchDados = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["panic-button"] });
    queryClient.invalidateQueries({ queryKey: ["vigilancia"] });
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
    setUltimaAtualizacao(new Date());
  }, [queryClient]);

  useEffect(() => {
    setUltimaAtualizacao(new Date());
    refetchDados();

    const refreshInterval = setInterval(() => {
      refetchDados();
    }, TEMPO_REFRESH);

    return () => clearInterval(refreshInterval);
  }, [refetchDados]);

  useEffect(() => {
    if (pausado) {
      setProgresso(0);
      setTempoRestante(0);
      return () => {};
    }

    marcadorRotacao.current = Date.now();

    contadorFrame.current = window.setInterval(() => {
      const decorrido = Date.now() - marcadorRotacao.current;
      const pct = Math.min(100, (decorrido / TEMPO_ROTACAO) * 100);
      const restante = Math.max(0, Math.ceil((TEMPO_ROTACAO - decorrido) / 1000));
      setProgresso(pct);
      setTempoRestante(restante);

      if (decorrido >= TEMPO_ROTACAO) {
        marcadorRotacao.current = Date.now();
        avancarPainel();
      }
    }, INTERVALO_PROGRESSO);

    return () => clearInterval(contadorFrame.current);
  }, [pausado, painelAtivo, avancarPainel]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
      if (e.key === " ") {
        e.preventDefault();
        setPausado((p) => !p);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        marcadorRotacao.current = Date.now();
        avancarPainel();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setTransicao(true);
        setTimeout(() => {
          setPainelAtivo((p) => (p - 1 + PAINEIS.length) % PAINEIS.length);
          setTransicao(false);
        }, 400);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [avancarPainel]);

  useEffect(() => {
    marcadorRotacao.current = Date.now();
    setProgresso(0);
    setTempoRestante(Math.ceil(TEMPO_ROTACAO / 1000));
  }, [painelAtivo]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0a0e14] font-sans overflow-hidden">
      <IndicadoresPainel painelAtivo={painelAtivo} />

      <div className="flex-1 relative">
        <div
          className={`absolute inset-0 transition-opacity duration-400 ${transicao ? "opacity-0" : "opacity-100"}`}
        >
          {painelAtivo === 0 && <PainelVisaoGeral />}
          {painelAtivo === 1 && <PainelAtendimentos />}
          {painelAtivo === 2 && <PainelMapa />}
          {painelAtivo === 3 && <PainelAlertas />}
          {painelAtivo === 4 && <PainelBeneficios />}
        </div>
      </div>

      <BarraProgresso progresso={progresso} />

      <Rodape
        ultimaAtualizacao={ultimaAtualizacao}
        painelAtivo={painelAtivo}
        pausado={pausado}
        aoPausar={() => setPausado((p) => !p)}
        tempoRestante={tempoRestante}
      />

      {/* Leaflet CSS fix para o z-index do mapa dentro deste contexto */}
      <style>{`
        .leaflet-container { background: #0a0e14 !important; }
        .leaflet-control-zoom a { background: rgba(255,255,255,0.1) !important; color: #fff !important; border-color: rgba(255,255,255,0.2) !important; }
        .leaflet-popup-content-wrapper { background: #1e293b !important; color: #fff !important; }
        .leaflet-popup-tip { background: #1e293b !important; }
      `}</style>
    </div>
  );
}
