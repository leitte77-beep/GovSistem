import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCheck,
  Copy,
  Edit3,
  Eye,
  FileText,
  Filter,
  Lock,
  Printer,
  Search,
  Send,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { FamilyOut, MemberOut } from "@/tipos/pessoas";
import type { TimelineItem } from "@/tipos/prontuario";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Chip } from "@/ui/Chip";
import type { CorChip } from "@/ui/Chip";
import { Botao } from "@/ui/Botao";
import { SlideOver } from "@/ui/SlideOver";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { servicoProntuario } from "@/nucleo/api/prontuario";
import { TIPO_ATENDIMENTO } from "@/i18n/dominios";
import { rotuloDe } from "@/i18n/dominios";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import { useProntuariosDaFamilia, useTiposServico } from "@/nucleo/api/hooks";

/* ──── Helpers ──── */

function formatarDataISO(dataISO: string): string {
  try {
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return dataISO;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dataISO;
  }
}

function formatarHoraISO(dataISO: string): string {
  try {
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatarDataCompleta(dataISO: string): string {
  try {
    const d = new Date(dataISO);
    if (isNaN(d.getTime())) return dataISO;
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dataISO;
  }
}

function diasAtras(dataISO: string): string {
  try {
    const agora = new Date();
    const data = new Date(dataISO);
    if (isNaN(data.getTime())) return "";
    const diff = Math.floor((agora.getTime() - data.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Ontem";
    return `Há ${diff} dias`;
  } catch {
    return "";
  }
}

function removerAcentos(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ── R1: Decodifica entidades HTML como &nbsp; &lt; &gt; &amp; ── */
function decodificarEntidadesHtml(texto: string): string {
  if (!texto) return "";
  try {
    const el = document.createElement("textarea");
    el.innerHTML = texto;
    const decoded = el.textContent ?? texto;
    return decoded;
  } catch {
    return texto
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, "\u00A0");
  }
}

/* ── R1: Sanitiza HTML (remove tags, deixa só texto) ── */
function sanitizarTexto(texto: string): string {
  if (!texto) return "";
  const decoded = decodificarEntidadesHtml(texto);
  const doc = new DOMParser().parseFromString(decoded, "text/html");
  return doc.body.textContent ?? decoded;
}

/* ── R3: Gera ID curto para exibição (8 primeiros caracteres) ── */
function idCurto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/* ── R3: Copia texto para clipboard ── */
async function copiarParaClipboard(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/* ──── Enriquecimento do item da timeline ──── */

type AtendimentoEnriquecido = TimelineItem & {
  caseFileId: string;
};

/* ──── CONSTANTES CANÔNICAS ──── */

/* ── R4: Nome canônico de tipo de serviço (single source of truth) ── */
const SERVICE_TYPE_DISPLAY: Record<string, string> = {
  PAIF: "Serviço de Proteção e Atendimento Integral à Família (PAIF)",
  PAEFI: "Serviço de Proteção e Atendimento Especializado (PAEFI)",
  SCFV: "Serviço de Convivência e Fortalecimento de Vínculos (SCFV)",
  MSE: "Serviço de MSE em Meio Aberto (LA e PSC)",
};

function nomeCanonicoService(code: string, nomeApi?: string): string {
  if (SERVICE_TYPE_DISPLAY[code]) return SERVICE_TYPE_DISPLAY[code];
  if (nomeApi && nomeApi !== code) return nomeApi;
  return code;
}

function nomeCurtoService(code: string, nomeApi?: string): string {
  return nomeApi && nomeApi !== code ? nomeApi : code;
}

/* ── R6: ENUM de situação com label + tom reutilizável ── */
const SITUACAO_MAP: Record<string, { label: string; cor: CorChip }> = {
  EM_ACOMPANHAMENTO: { label: "Em acompanhamento", cor: "primario" },
  AGUARDANDO_RETORNO: { label: "Aguardando retorno", cor: "amber" },
  CONCLUIDO: { label: "Concluído", cor: "beneficio" },
  ENCERRADO: { label: "Encerrado", cor: "neutro" },
  NAO_INFORMADO: { label: "Não informado", cor: "neutro" },
};

function resolveSituacao(situacaoRaw?: string | null): { label: string; cor: CorChip } {
  if (!situacaoRaw) return SITUACAO_MAP.NAO_INFORMADO;
  return SITUACAO_MAP[situacaoRaw] ?? SITUACAO_MAP.NAO_INFORMADO;
}

/* ── R11: Cor por categoria de serviço ── */
function corServiceChip(code: string): CorChip {
  switch (code) {
    case "PAIF":
      return "paif";
    case "PAEFI":
      return "paefi";
    case "SCFV":
      return "scfv";
    case "MSE":
      return "mse";
    default:
      return "neutro";
  }
}

/* ──── Status helpers (mantidos para retrocompatibilidade) ──── */

const STATUS_ROTULO: Record<string, string> = {
  completed: "Concluído",
  in_progress: "Em andamento",
  with_return: "Com retorno",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
  draft: "Rascunho",
};

/* ──── Tipos de período ──── */

type PeriodoPredefinido =
  | "hoje"
  | "7dias"
  | "30dias"
  | "este_mes"
  | "mes_anterior"
  | "este_ano"
  | "personalizado"
  | "";

type OrdenacaoTipo = "data_desc" | "data_asc";

/* ──── Funções de período ──── */

function estaNoPeriodo(dataISO: string, inicio: string, fim: string): boolean {
  const d = new Date(dataISO);
  d.setHours(0, 0, 0, 0);
  const i = new Date(inicio);
  i.setHours(0, 0, 0, 0);
  const f = new Date(fim);
  f.setHours(23, 59, 59, 999);
  return d >= i && d <= f;
}

function resolvePeriodo(tipo: PeriodoPredefinido, customInicio?: string, customFim?: string): { inicio: string; fim: string } | null {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  switch (tipo) {
    case "hoje": {
      const f = new Date(hoje);
      f.setHours(23, 59, 59, 999);
      return { inicio: hoje.toISOString(), fim: f.toISOString() };
    }
    case "7dias": {
      const i = new Date(hoje);
      i.setDate(i.getDate() - 7);
      return { inicio: i.toISOString(), fim: new Date().toISOString() };
    }
    case "30dias": {
      const i = new Date(hoje);
      i.setDate(i.getDate() - 30);
      return { inicio: i.toISOString(), fim: new Date().toISOString() };
    }
    case "este_mes": {
      const i = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { inicio: i.toISOString(), fim: new Date().toISOString() };
    }
    case "mes_anterior": {
      const i = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const f = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      f.setHours(23, 59, 59, 999);
      return { inicio: i.toISOString(), fim: f.toISOString() };
    }
    case "este_ano": {
      const i = new Date(hoje.getFullYear(), 0, 1);
      return { inicio: i.toISOString(), fim: new Date().toISOString() };
    }
    case "personalizado":
      if (customInicio && customFim) {
        const i = new Date(customInicio);
        i.setHours(0, 0, 0, 0);
        const f = new Date(customFim);
        f.setHours(23, 59, 59, 999);
        if (i > f) return null;
        return { inicio: i.toISOString(), fim: f.toISOString() };
      }
      return null;
    default:
      return null;
  }
}

/* ── R3: Hook para mapa de nomes de unidade (id -> nome) ── */
function useMapaUnidades(): { mapaUnidades: Record<string, string> } {
  const cacheRef = useRef<Record<string, string>>({});
  const [mapa, setMapa] = useState<Record<string, string>>(cacheRef.current);
  const jaBuscou = useRef(false);

  useEffect(() => {
    if (jaBuscou.current) return;
    jaBuscou.current = true;
    let ativo = true;

    try {
      fetch("/units")
        .then((r) => r.json())
        .then((data: Array<{ id: string; nome: string; is_active: boolean }>) => {
          if (!ativo) return;
          const map: Record<string, string> = {};
          (data || []).filter((u) => u.is_active).forEach((u) => (map[u.id] = u.nome));
          cacheRef.current = map;
          setMapa(map);
        })
        .catch(() => {
          if (ativo) setMapa({});
        });
    } catch {
      setMapa({});
    }

    return () => { ativo = false; };
  }, []);

  return { mapaUnidades: Object.keys(mapa).length > 0 ? mapa : cacheRef.current };
}

/* ──── Componente principal ──── */

export function HistoricoAtendimentos({
  familia,
  aoCarregarContagem,
}: {
  familia: FamilyOut;
  aoCarregarContagem?: (contagem: number) => void;
}) {
  const navigate = useNavigate();
  const { tem } = usePermissoes();

  const prontuariosQ = useProntuariosDaFamilia(familia.id);
  const prontuarios = useMemo(() => prontuariosQ.data ?? [], [prontuariosQ.data]);

  const membros = familia.membros.filter((m) => m.status === "ATIVO");

  /* ── Busca ── */
  const [termo, setTermo] = useState("");
  const [termoDebounced, setTermoDebounced] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setTermoDebounced(termo);
      setPagina(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [termo]);

  /* ── Filtros ── */
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoPredefinido>("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [filtroTipoAtendimento, setFiltroTipoAtendimento] = useState("");
  const [filtroServiceCode, setFiltroServiceCode] = useState("");
  const [filtroMembroId, setFiltroMembroId] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  /* ── Ordenação ── */
  const [ordenacao, setOrdenacao] = useState<OrdenacaoTipo>("data_desc");

  /* ── Paginação ── */
  const [pagina, setPagina] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(10);

  /* ── Drawer ── */
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<{
    attendanceId: string;
    caseFileId: string;
  } | null>(null);

  /* ── Exibição ── */
  const [agruparPorMes, setAgruparPorMes] = useState(false);
  const [filtrosVisiveis, setFiltrosVisiveis] = useState(false);

  /* ── R3: Nomes de unidades ── */
  const { mapaUnidades } = useMapaUnidades();

  /* ── Timeline queries ── */

  const timelinesQ = useQueries({
    queries: prontuarios.map((cf) => ({
      queryKey: ["timeline", cf.id],
      queryFn: () => servicoProntuario.timeline(cf.id),
      staleTime: 15_000,
      enabled: Boolean(cf.id),
    })),
  });

  const carregandoTimelines = prontuariosQ.isLoading || timelinesQ.some((q) => q.isLoading);
  const erroTimelines = prontuariosQ.isError ? prontuariosQ : timelinesQ.find((q) => q.isError);
  const algumErro = erroTimelines?.error;

  /* ── Agrega todos os itens ── */
  const todosItens: AtendimentoEnriquecido[] = useMemo(() => {
    const itens: AtendimentoEnriquecido[] = [];
    timelinesQ.forEach((q, i) => {
      const caseFileId = prontuarios[i]?.id;
      if (!q.data || !caseFileId) return;
      for (const item of q.data) {
        itens.push({ ...item, caseFileId });
      }
    });
    return itens;
  }, [prontuarios, timelinesQ]);

  const tipoServicoQ = useTiposServico();

  /* ── R10: Comunica contagem para o componente pai (tabs) ── */
  useEffect(() => {
    aoCarregarContagem?.(todosItens.length);
  }, [todosItens.length, aoCarregarContagem]);

  /* ── Filtragem ── */
  const itensFiltrados = useMemo(() => {
    let resultado = todosItens;

    const periodo = resolvePeriodo(periodoTipo, periodoInicio, periodoFim);
    if (periodo) {
      resultado = resultado.filter((item) =>
        estaNoPeriodo(item.data_atendimento, periodo.inicio, periodo.fim),
      );
    }

    if (termoDebounced.trim()) {
      const t = removerAcentos(termoDebounced.toLowerCase());
      resultado = resultado.filter((item) => {
        const campos = [
          item.tipo,
          item.service_type_code,
        ];
        return campos.some((c) => c && removerAcentos(c.toLowerCase()).includes(t));
      });
    }

    if (filtroTipoAtendimento) {
      resultado = resultado.filter((item) => item.tipo === filtroTipoAtendimento);
    }

    if (filtroServiceCode) {
      resultado = resultado.filter((item) => item.service_type_code === filtroServiceCode);
    }

    return resultado;
  }, [
    todosItens,
    periodoTipo,
    periodoInicio,
    periodoFim,
    termoDebounced,
    filtroTipoAtendimento,
    filtroServiceCode,
  ]);

  /* ── Ordenação ── */
  const itensOrdenados = useMemo(() => {
    const ordenados = [...itensFiltrados];
    ordenados.sort((a, b) => {
      const da = new Date(a.data_atendimento).getTime();
      const db = new Date(b.data_atendimento).getTime();
      return ordenacao === "data_desc" ? db - da : da - db;
    });
    return ordenados;
  }, [itensFiltrados, ordenacao]);

  /* ── Paginação ── */
  const totalPaginas = Math.max(1, Math.ceil(itensOrdenados.length / itensPorPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaAtual - 1) * itensPorPagina;
  const itensPaginados = itensOrdenados.slice(inicioPagina, inicioPagina + itensPorPagina);

  /* ── Agrupamento por mês ── */
  const itensAgrupados = useMemo(() => {
    if (!agruparPorMes) return null;
    const grupos: Record<string, AtendimentoEnriquecido[]> = {};
    for (const item of itensPaginados) {
      const d = new Date(item.data_atendimento);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(item);
    }
    return grupos;
  }, [itensPaginados, agruparPorMes]);

  const nomeMes = (chave: string) => {
    const [ano, mes] = chave.split("-").map(Number);
    const d = new Date(ano, mes - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  /* ── R19: Contagem de filtros ativos ── */
  const filtrosAtivos = useMemo(() => {
    let count = 0;
    if (periodoTipo) count++;
    if (filtroTipoAtendimento) count++;
    if (filtroServiceCode) count++;
    if (filtroMembroId) count++;
    if (filtroStatus) count++;
    return count;
  }, [periodoTipo, filtroTipoAtendimento, filtroServiceCode, filtroMembroId, filtroStatus]);

  /* ── R19: Chips de filtro ── */
  const chipsFiltro = useMemo(() => {
    const chips: { label: string; aoRemover: () => void }[] = [];
    if (periodoTipo) {
      const periodoMap: Record<string, string> = {
        hoje: "Hoje", "7dias": "Últ. 7 dias", "30dias": "Últ. 30 dias",
        este_mes: "Este mês", mes_anterior: "Mês anterior", este_ano: "Este ano",
        personalizado: "Período personalizado",
      };
      chips.push({ label: periodoMap[periodoTipo] ?? periodoTipo, aoRemover: () => setPeriodoTipo("") });
    }
    if (filtroTipoAtendimento) {
      const label = rotuloDe(TIPO_ATENDIMENTO, filtroTipoAtendimento) || filtroTipoAtendimento;
      chips.push({ label, aoRemover: () => setFiltroTipoAtendimento("") });
    }
    if (filtroServiceCode) {
      const svc = tipoServicoQ.data?.find((s) => s.code === filtroServiceCode);
      chips.push({ label: svc?.sigla || filtroServiceCode, aoRemover: () => setFiltroServiceCode("") });
    }
    if (filtroMembroId) {
      const m = membros.find((mb) => mb.person_id === filtroMembroId);
      chips.push({ label: m?.nome_exibicao || filtroMembroId, aoRemover: () => setFiltroMembroId("") });
    }
    if (filtroStatus) {
      chips.push({ label: STATUS_ROTULO[filtroStatus] || filtroStatus, aoRemover: () => setFiltroStatus("") });
    }
    return chips;
  }, [periodoTipo, filtroTipoAtendimento, filtroServiceCode, filtroMembroId, filtroStatus, tipoServicoQ.data, membros]);

  /* ── Limpar filtros ── */
  const limparFiltros = useCallback(() => {
    setTermo("");
    setPeriodoTipo("");
    setPeriodoInicio("");
    setPeriodoFim("");
    setFiltroTipoAtendimento("");
    setFiltroServiceCode("");
    setFiltroMembroId("");
    setFiltroStatus("");
    setPagina(1);
  }, []);

  /* ── Handlers ── */
  const abrirDetalhes = (item: AtendimentoEnriquecido) => {
    if (item.sigiloso_reforcado && !item.pode_ler_evolucao) return;
    setAtendimentoSelecionado({
      attendanceId: item.attendance_id,
      caseFileId: item.caseFileId,
    });
  };

  const aoRegistrarAtendimento = () => {
    navigate(`/familias/${familia.id}/atendimento`);
  };

  const aoMudarPeriodo = (tipo: PeriodoPredefinido) => {
    setPeriodoTipo(tipo);
    setPagina(1);
    if (tipo !== "personalizado") {
      setPeriodoInicio("");
      setPeriodoFim("");
    }
  };

  /* ── Renderização ── */

  if (carregandoTimelines) {
    return (
      <section className="space-y-4">
        <CabecalhoSecao
          aoRegistrarAtendimento={aoRegistrarAtendimento}
          temRegistrar={tem("atendimento.registrar")}
        />
        <SkeletonTabela />
      </section>
    );
  }

  if (algumErro) {
    return (
      <section className="space-y-4">
        <CabecalhoSecao
          aoRegistrarAtendimento={aoRegistrarAtendimento}
          temRegistrar={tem("atendimento.registrar")}
        />
        <EstadoErro
          problema={(algumErro as ErroApi).problema}
          aoTentarNovamente={() => {
            timelinesQ.forEach((q) => q.refetch());
          }}
        />
      </section>
    );
  }

  if (todosItens.length === 0) {
    return (
      <section className="space-y-4">
        <CabecalhoSecao
          aoRegistrarAtendimento={aoRegistrarAtendimento}
          temRegistrar={tem("atendimento.registrar")}
        />
        <EstadoVazio
          titulo="Nenhum atendimento registrado"
          descricao="Ainda não existem atendimentos cadastrados para esta família."
          acao={
            tem("atendimento.registrar")
              ? { rotulo: "Registrar primeiro atendimento", aoClicar: aoRegistrarAtendimento }
              : undefined
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <CabecalhoSecao
        aoRegistrarAtendimento={aoRegistrarAtendimento}
        temRegistrar={tem("atendimento.registrar")}
      />

      {/* ── Busca e ferramentas ── */}
      <BarraFerramentas
        termo={termo}
        aoMudarTermo={setTermo}
        ordenacao={ordenacao}
        aoMudarOrdenacao={setOrdenacao}
        agruparPorMes={agruparPorMes}
        aoMudarAgrupamento={setAgruparPorMes}
        filtrosAtivos={filtrosAtivos}
        filtrosVisiveis={filtrosVisiveis}
        aoAlternarFiltros={() => setFiltrosVisiveis((v) => !v)}
        aoLimparFiltros={limparFiltros}
      />

      {/* ── R19: Chips de filtros ativos ── */}
      {chipsFiltro.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-soft">Filtros ativos:</span>
          {chipsFiltro.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.aoRemover}
                aria-label={`Remover filtro ${chip.label}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-focus"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={limparFiltros}
            className="text-xs font-semibold text-ink-soft hover:text-primary focus-visible:outline-focus"
          >
            Limpar tudo
          </button>
        </div>
      )}

      {/* ── Filtros expansíveis ── */}
      {filtrosVisiveis && (
        <PainelFiltros
          periodoTipo={periodoTipo}
          aoMudarPeriodo={aoMudarPeriodo}
          periodoInicio={periodoInicio}
          aoMudarPeriodoInicio={(v) => {
            setPeriodoInicio(v);
            setPagina(1);
          }}
          periodoFim={periodoFim}
          aoMudarPeriodoFim={(v) => {
            setPeriodoFim(v);
            setPagina(1);
          }}
          filtroTipoAtendimento={filtroTipoAtendimento}
          aoMudarTipoAtendimento={(v) => {
            setFiltroTipoAtendimento(v);
            setPagina(1);
          }}
          filtroServiceCode={filtroServiceCode}
          aoMudarServiceCode={(v) => {
            setFiltroServiceCode(v);
            setPagina(1);
          }}
          tipoServicoQ={tipoServicoQ}
          filtroMembroId={filtroMembroId}
          aoMudarMembro={(v) => {
            setFiltroMembroId(v);
            setPagina(1);
          }}
          filtroStatus={filtroStatus}
          aoMudarStatus={(v) => {
            setFiltroStatus(v);
            setPagina(1);
          }}
          membros={membros}
          aoLimpar={limparFiltros}
        />
      )}

      {/* ── Tabela ou lista mobile ── */}
      {itensFiltrados.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum atendimento encontrado"
          descricao="Revise o termo pesquisado ou limpe os filtros aplicados."
          acao={{ rotulo: "Limpar filtros", aoClicar: limparFiltros }}
        />
      ) : agruparPorMes && itensAgrupados ? (
        <div className="space-y-6">
          {Object.entries(itensAgrupados).map(([chave, itensDoMes]) => (
            <div key={chave}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/70">
                {nomeMes(chave)}
              </h3>
              <TabelaHistorico
                itens={itensDoMes}
                tipoServicoQ={tipoServicoQ}
                mapaUnidades={mapaUnidades}
                aoAbrirDetalhes={abrirDetalhes}
                itemSelecionadoId={atendimentoSelecionado?.attendanceId ?? null}
              />
            </div>
          ))}
          <RodapePagina
            pagina={paginaAtual}
            totalPaginas={totalPaginas}
            itensPorPagina={itensPorPagina}
            totalItens={itensOrdenados.length}
            inicio={inicioPagina + 1}
            fim={Math.min(inicioPagina + itensPorPagina, itensOrdenados.length)}
            aoMudarPagina={setPagina}
            aoMudarItensPorPagina={(n) => {
              setItensPorPagina(n);
              setPagina(1);
            }}
          />
        </div>
      ) : (
        <>
          <TabelaHistorico
            itens={itensPaginados}
            tipoServicoQ={tipoServicoQ}
            mapaUnidades={mapaUnidades}
            aoAbrirDetalhes={abrirDetalhes}
            itemSelecionadoId={atendimentoSelecionado?.attendanceId ?? null}
          />
          <RodapePagina
            pagina={paginaAtual}
            totalPaginas={totalPaginas}
            itensPorPagina={itensPorPagina}
            totalItens={itensOrdenados.length}
            inicio={inicioPagina + 1}
            fim={Math.min(inicioPagina + itensPorPagina, itensOrdenados.length)}
            aoMudarPagina={setPagina}
            aoMudarItensPorPagina={(n) => {
              setItensPorPagina(n);
              setPagina(1);
            }}
          />
        </>
      )}

      {/* ── Drawer de detalhes ── */}
      {atendimentoSelecionado && (
        <DrawerDetalhesAtendimento
          caseFileId={atendimentoSelecionado.caseFileId}
          attendanceId={atendimentoSelecionado.attendanceId}
          membros={membros}
          familiaId={familia.id}
          mapaUnidades={mapaUnidades}
          aberto
          aoFechar={() => setAtendimentoSelecionado(null)}
        />
      )}
    </section>
  );
}

/* ──── Sub-componentes ──── */

/* ── R8: CTA vira secundário (outline) — FAB é o primário da tela ── */
function CabecalhoSecao({
  aoRegistrarAtendimento,
  temRegistrar,
}: {
  aoRegistrarAtendimento: () => void;
  temRegistrar: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/30 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-ink">Histórico de atendimentos</h2>
        <p className="mt-1 text-sm text-ink/70">
          Consulte todos os atendimentos registrados para esta família e seus membros.
        </p>
      </div>
      {temRegistrar && (
        <Botao
          variante="secundario"
          onClick={aoRegistrarAtendimento}
          iconeInicio={<span className="material-symbols-outlined !text-[20px]">add</span>}
        >
          Registrar atendimento
        </Botao>
      )}
    </div>
  );
}

function SkeletonTabela() {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface" role="status" aria-label="Carregando histórico">
      <div className="p-4">
        <div className="mb-4 flex gap-2">
          <div className="motion-safe:animate-pulse h-9 w-64 rounded-lg bg-ink/10" />
          <div className="motion-safe:animate-pulse h-9 w-32 rounded-lg bg-ink/10" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-3 flex gap-3">
            <div className="motion-safe:animate-pulse h-12 w-full rounded-lg bg-ink/10" />
          </div>
        ))}
      </div>
      <span className="apenas-leitor">Carregando histórico de atendimentos...</span>
    </div>
  );
}

/* ── R18: Toggle com estado visível (aria-pressed) + R19: Filtros · N ── */
function BarraFerramentas({
  termo,
  aoMudarTermo,
  ordenacao,
  aoMudarOrdenacao,
  agruparPorMes,
  aoMudarAgrupamento,
  filtrosAtivos,
  filtrosVisiveis,
  aoAlternarFiltros,
  aoLimparFiltros,
}: {
  termo: string;
  aoMudarTermo: (v: string) => void;
  ordenacao: OrdenacaoTipo;
  aoMudarOrdenacao: (v: OrdenacaoTipo) => void;
  agruparPorMes: boolean;
  aoMudarAgrupamento: (v: boolean) => void;
  filtrosAtivos: number;
  filtrosVisiveis: boolean;
  aoAlternarFiltros: () => void;
  aoLimparFiltros: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/60" aria-hidden />
        <input
          type="search"
          value={termo}
          onChange={(e) => aoMudarTermo(e.target.value)}
          placeholder="Buscar no histórico..."
          aria-label="Buscar no histórico de atendimentos"
          className="w-full min-h-10 rounded-lg border border-outline-variant/40 bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink/60 focus-visible:outline-focus"
        />
        {termo && (
          <button
            type="button"
            onClick={() => aoMudarTermo("")}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink/60 hover:text-ink focus-visible:outline-focus"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* R19: Filtros com contador */}
      <button
        type="button"
        onClick={aoAlternarFiltros}
        aria-pressed={filtrosVisiveis}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-focus transition-all duration-150 ${
          filtrosVisiveis
            ? "border-primary bg-primary-soft text-primary"
            : "border-outline-variant/40 bg-surface text-ink/70 hover:text-primary hover:border-primary/30"
        }`}
      >
        <Filter className="h-4 w-4" />
        Filtros{filtrosAtivos > 0 ? ` · ${filtrosAtivos}` : ""}
      </button>

      {filtrosAtivos > 0 && (
        <button
          type="button"
          onClick={aoLimparFiltros}
          className="min-h-10 rounded-lg px-3 text-sm font-semibold text-ink/70 hover:text-primary focus-visible:outline-focus transition-colors"
        >
          Limpar filtros
        </button>
      )}

      {/* R18: Ordenação com direção visível */}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => aoMudarOrdenacao(ordenacao === "data_desc" ? "data_asc" : "data_desc")}
          aria-label={`Ordenar por data: ${ordenacao === "data_desc" ? "mais recentes primeiro" : "mais antigos primeiro"}`}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-focus transition-all duration-150 ${
            ordenacao === "data_desc"
              ? "border-primary/30 bg-primary-soft text-primary"
              : "border-outline-variant/40 bg-surface text-ink/70 hover:text-primary hover:border-primary/30"
          }`}
        >
          {ordenacao === "data_desc" ? (
            <ArrowDown className="h-4 w-4" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
          {ordenacao === "data_desc" ? "Mais recentes" : "Mais antigos"}
        </button>

        {/* R18: Agrupamento como toggle com aria-pressed */}
        <button
          type="button"
          onClick={() => aoMudarAgrupamento(!agruparPorMes)}
          aria-pressed={agruparPorMes}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-focus transition-all duration-150 ${
            agruparPorMes
              ? "border-primary/30 bg-primary-soft text-primary"
              : "border-outline-variant/40 bg-surface text-ink/70 hover:text-primary hover:border-primary/30"
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Agrupar por mês
        </button>
      </div>
    </div>
  );
}

function PainelFiltros({
  periodoTipo,
  aoMudarPeriodo,
  periodoInicio,
  aoMudarPeriodoInicio,
  periodoFim,
  aoMudarPeriodoFim,
  filtroTipoAtendimento,
  aoMudarTipoAtendimento,
  filtroServiceCode,
  aoMudarServiceCode,
  tipoServicoQ,
  filtroMembroId,
  aoMudarMembro,
  filtroStatus,
  aoMudarStatus,
  membros,
  aoLimpar,
}: {
  periodoTipo: string;
  aoMudarPeriodo: (v: PeriodoPredefinido) => void;
  periodoInicio: string;
  aoMudarPeriodoInicio: (v: string) => void;
  periodoFim: string;
  aoMudarPeriodoFim: (v: string) => void;
  filtroTipoAtendimento: string;
  aoMudarTipoAtendimento: (v: string) => void;
  filtroServiceCode: string;
  aoMudarServiceCode: (v: string) => void;
  tipoServicoQ: ReturnType<typeof useTiposServico>;
  filtroMembroId: string;
  aoMudarMembro: (v: string) => void;
  filtroStatus: string;
  aoMudarStatus: (v: string) => void;
  membros: MemberOut[];
  aoLimpar: () => void;
}) {
  const periodosRapidos: { valor: PeriodoPredefinido; rotulo: string }[] = [
    { valor: "hoje", rotulo: "Hoje" },
    { valor: "7dias", rotulo: "Últimos 7 dias" },
    { valor: "30dias", rotulo: "Últimos 30 dias" },
    { valor: "este_mes", rotulo: "Este mês" },
    { valor: "mes_anterior", rotulo: "Mês anterior" },
    { valor: "este_ano", rotulo: "Este ano" },
  ];

  const controle =
    "min-h-10 rounded-lg border border-outline-variant/40 bg-surface px-3 text-sm text-ink focus-visible:outline-focus";

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <strong className="text-sm text-ink">Filtrar histórico</strong>
        <button
          type="button"
          onClick={aoLimpar}
          className="ml-auto text-xs font-semibold text-primary hover:underline focus-visible:outline-focus"
        >
          Limpar todos
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {periodosRapidos.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => aoMudarPeriodo(periodoTipo === p.valor ? "" : p.valor)}
            className={`rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-focus transition-colors ${
              periodoTipo === p.valor
                ? "bg-primary text-on-primary"
                : "bg-surface text-primary hover:bg-primary-soft"
            }`}
          >
            {p.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => aoMudarPeriodo("personalizado")}
          className={`rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-focus transition-colors ${
            periodoTipo === "personalizado"
              ? "bg-primary text-on-primary"
              : "bg-surface text-primary hover:bg-primary-soft"
          }`}
        >
          Período personalizado
        </button>
      </div>

      {periodoTipo === "personalizado" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink/70">
            De{" "}
            <input
              type="date"
              value={periodoInicio}
              onChange={(e) => aoMudarPeriodoInicio(e.target.value)}
              className={controle}
              aria-label="Data inicial"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink/70">
            Até{" "}
            <input
              type="date"
              value={periodoFim}
              onChange={(e) => aoMudarPeriodoFim(e.target.value)}
              className={controle}
              max={new Date().toISOString().slice(0, 10)}
              aria-label="Data final"
            />
          </label>
          {periodoInicio && periodoFim && new Date(periodoInicio) > new Date(periodoFim) && (
            <span className="text-xs font-semibold text-danger">
              Data inicial não pode ser posterior à data final.
            </span>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <select
          aria-label="Tipo de atendimento"
          value={filtroTipoAtendimento}
          onChange={(e) => aoMudarTipoAtendimento(e.target.value)}
          className={controle}
        >
          <option value="">Todos os tipos</option>
          {TIPO_ATENDIMENTO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>

        <select
          aria-label="Serviço"
          value={filtroServiceCode}
          onChange={(e) => aoMudarServiceCode(e.target.value)}
          className={controle}
        >
          <option value="">Todos os serviços</option>
          {tipoServicoQ.data?.map((s) => (
            <option key={s.code} value={s.code}>
              {s.sigla ? `${s.sigla} - ${s.nome}` : s.nome}
            </option>
          ))}
        </select>

        <select
          aria-label="Membro atendido"
          value={filtroMembroId}
          onChange={(e) => aoMudarMembro(e.target.value)}
          className={controle}
        >
          <option value="">Toda a família e membros</option>
          {membros.map((m) => (
            <option key={m.person_id} value={m.person_id}>
              {m.nome_exibicao}
            </option>
          ))}
        </select>

        <select
          aria-label="Situação"
          value={filtroStatus}
          onChange={(e) => aoMudarStatus(e.target.value)}
          className={controle}
        >
          <option value="">Todas as situações</option>
          {Object.entries(STATUS_ROTULO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ── R9: Cabeçalho "ABRANGÊNCIA" substitui "Pessoa(s)" ── */
function TabelaHistorico({
  itens,
  tipoServicoQ,
  mapaUnidades,
  aoAbrirDetalhes,
  itemSelecionadoId,
}: {
  itens: AtendimentoEnriquecido[];
  tipoServicoQ: ReturnType<typeof useTiposServico>;
  mapaUnidades: Record<string, string>;
  aoAbrirDetalhes: (item: AtendimentoEnriquecido) => void;
  itemSelecionadoId: string | null;
}) {
  const serviceMap = useMemo(() => {
    const map: Record<string, string> = {};
    tipoServicoQ.data?.forEach((s) => {
      map[s.code] = s.nome;
    });
    return map;
  }, [tipoServicoQ.data]);

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface">
      {/* Desktop table */}
      <table className="hidden w-full min-w-[720px] border-collapse text-sm md:table">
        <caption className="apenas-leitor">Histórico de atendimentos da família</caption>
        <thead>
          {/* R17: Cabeçalhos com contraste >= 4.5:1 */}
          <tr className="border-b border-outline-variant/30 bg-surface-container-low">
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              Data e hora
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              Tipo e subtipo
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              Resumo
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              Profissional
            </th>
            {/* R9: renomeado PESSOA(S) → ABRANGÊNCIA */}
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              Abrangência
            </th>
            {/* R6: coluna SITUAÇÃO mantém nome mas ganha tooltip de legenda */}
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              <span title="Situação do atendimento: Em acompanhamento, Aguardando retorno, Concluído, Encerrado ou Não informado">
                Situação
              </span>
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink/80">
              <span className="apenas-leitor">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <LinhaTabela
              key={item.attendance_id + item.caseFileId}
              item={item}
              serviceNomes={serviceMap}
              mapaUnidades={mapaUnidades}
              aoAbrirDetalhes={aoAbrirDetalhes}
              selecionado={item.attendance_id === itemSelecionadoId}
            />
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="divide-y divide-outline-variant/20 md:hidden">
        {itens.map((item) => (
          <CartaoMobile
            key={item.attendance_id + item.caseFileId}
            item={item}
            serviceNomes={serviceMap}
            mapaUnidades={mapaUnidades}
            aoAbrirDetalhes={aoAbrirDetalhes}
            selecionado={item.attendance_id === itemSelecionadoId}
          />
        ))}
      </div>
    </div>
  );
}

/* ── R2/R3/R5/R6/R7/R15/R17: Linha de tabela com preview real, nomes, badges, hover ── */
function LinhaTabela({
  item,
  serviceNomes,
  mapaUnidades,
  aoAbrirDetalhes,
  selecionado,
}: {
  item: AtendimentoEnriquecido;
  serviceNomes: Record<string, string>;
  mapaUnidades: Record<string, string>;
  aoAbrirDetalhes: (item: AtendimentoEnriquecido) => void;
  selecionado: boolean;
}) {
  const serviceNome = nomeCurtoService(item.service_type_code, serviceNomes[item.service_type_code]);
  const tipoRotulo = rotuloDe(TIPO_ATENDIMENTO, item.tipo) || item.tipo;

  /* R3: nome da unidade */
  const nomeUnidade = item.unit_id ? (mapaUnidades[item.unit_id] || null) : null;

  /* R2: profissional (placeholder até backend prover nome) */
  // TODO(R2): backend deve retornar `registrado_por_nome` no endpoint de timeline.
  // Enquanto não disponível, exibimos estado honesto.
  const profissionalPreenchido = Boolean((item as Record<string, unknown>).registrado_por_nome);

  /* R5: preview do registro */
  const textoRegistro = (item as Record<string, unknown>).evolution_text as string | undefined;
  const temRegistro = textoRegistro && textoRegistro.trim().length > 0;
  const podeLer = item.pode_ler_evolucao;

  /* R6: situação */
  const sit = resolveSituacao((item as unknown as Record<string, string | undefined>).situacao);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      aoAbrirDetalhes(item);
    }
  };

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Atendimento ${tipoRotulo} em ${formatarDataISO(item.data_atendimento)}`}
      onClick={() => aoAbrirDetalhes(item)}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer border-b border-outline-variant/20 transition-all duration-150 focus-visible:outline-focus focus-visible:outline-offset-[-2px] group ${
        selecionado
          ? "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--ga-primary)]"
          : "hover:bg-surface-container-low hover:shadow-sm"
      }`}
    >
      <td className="px-3 py-2.5">
        <div className="font-semibold text-ink">{formatarDataISO(item.data_atendimento)}</div>
        <div className="text-xs text-ink/70">{formatarHoraISO(item.data_atendimento)}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip cor={corServiceChip(item.service_type_code)}>
            {serviceNome}
          </Chip>
        </div>
        <div className="mt-1 text-xs text-ink/70">{tipoRotulo}</div>
      </td>
      {/* R5: Preview real (não instrução) */}
      <td className="px-3 py-2.5 max-w-[260px]">
        {podeLer && temRegistro ? (
          <p
            className="line-clamp-2 text-xs text-ink/70 relative pr-6"
            title={sanitizarTexto(textoRegistro!)}
          >
            <span className="after:absolute after:bottom-0 after:right-0 after:w-16 after:h-[1.2em] after:bg-gradient-to-l after:from-surface group-hover:after:from-surface-container-low after:to-transparent after:pointer-events-none">
              {sanitizarTexto(textoRegistro!).slice(0, 200)}
            </span>
          </p>
        ) : (
          <p className="text-xs italic text-ink/50">Sem descrição</p>
        )}
      </td>
      {/* R2: Profissional com nome real ou estado vazio */}
      <td className="px-3 py-2.5">
        {profissionalPreenchido ? (
          <div className="text-sm text-ink font-medium">
            {String(((item as Record<string, unknown>).registrado_por_nome) || "")}
          </div>
        ) : (
          <div className="text-sm text-ink/60 italic">Sem profissional vinculado</div>
        )}
        {/* R3: unidade com nome real ou vazio */}
        <div className="text-xs text-ink/60">
          {nomeUnidade || (item.unit_id ? item.unit_id.slice(0, 12) + "..." : "Sem unidade")}
        </div>
      </td>
      {/* R9: Abrangência no lugar de nomes */}
      <td className="px-3 py-2.5 text-sm text-ink/70">
        {item.tipo === "FAMILIAR" ? "Familiar" : tipoRotulo}
        {item.sigiloso_reforcado && (
          <Lock aria-label="Atendimento sigiloso" className="ml-1 inline h-3 w-3 text-sensitive" />
        )}
      </td>
      {/* R6: Badge de situação com cor + label */}
      <td className="px-3 py-2.5">
        <Chip cor={sit.cor}>{sit.label}</Chip>
      </td>
      {/* R7: Ícone de olho só no hover */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span
            aria-label="Ver detalhes"
            className="rounded-lg p-1.5 text-ink/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 pointer-events-none"
          >
            <Eye className="h-4 w-4" />
          </span>
        </div>
      </td>
    </tr>
  );
}

/* ── Mobile card (R2/R3/R5/R6 atualizados) ── */
function CartaoMobile({
  item,
  serviceNomes,
  mapaUnidades,
  aoAbrirDetalhes,
  selecionado,
}: {
  item: AtendimentoEnriquecido;
  serviceNomes: Record<string, string>;
  mapaUnidades: Record<string, string>;
  aoAbrirDetalhes: (item: AtendimentoEnriquecido) => void;
  selecionado: boolean;
}) {
  const serviceNome = nomeCurtoService(item.service_type_code, serviceNomes[item.service_type_code]);
  const tipoRotulo = rotuloDe(TIPO_ATENDIMENTO, item.tipo) || item.tipo;
  const nomeUnidade = item.unit_id ? (mapaUnidades[item.unit_id] || null) : null;
  const profissionalPreenchido = Boolean((item as Record<string, unknown>).registrado_por_nome);
  const textoRegistro = (item as Record<string, unknown>).evolution_text as string | undefined;
  const temRegistro = textoRegistro && textoRegistro.trim().length > 0;
  const podeLer = item.pode_ler_evolucao;
  const sit = resolveSituacao((item as unknown as Record<string, string | undefined>).situacao);

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Atendimento ${tipoRotulo} em ${formatarDataISO(item.data_atendimento)}`}
      onClick={() => aoAbrirDetalhes(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          aoAbrirDetalhes(item);
        }
      }}
      className={`cursor-pointer p-4 transition-all duration-150 focus-visible:outline-focus focus-visible:outline-offset-[-2px] group ${
        selecionado
          ? "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--ga-primary)]"
          : "hover:bg-surface-container-low"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{formatarDataISO(item.data_atendimento)}</span>
            <span className="text-sm text-ink/70">{formatarHoraISO(item.data_atendimento)}</span>
            <span className="text-xs text-ink/60">{diasAtras(item.data_atendimento)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip cor={corServiceChip(item.service_type_code)}>{serviceNome}</Chip>
            <Chip cor={sit.cor}>{sit.label}</Chip>
          </div>
          {/* R2/R3: Profissional + unidade */}
          <div className="mt-1 text-sm text-ink/70">
            {profissionalPreenchido
              ? String(((item as Record<string, unknown>).registrado_por_nome) || "")
              : "Sem profissional vinculado"}
            {nomeUnidade && <span className="text-ink/60"> · {nomeUnidade}</span>}
          </div>
          {/* R5: preview */}
          {podeLer && temRegistro && (
            <p className="mt-1 text-xs text-ink/60 line-clamp-2">
              {sanitizarTexto(textoRegistro!).slice(0, 150)}
            </p>
          )}
          {/* R9: Abrangência */}
          <div className="mt-1 text-xs text-ink/60">
            {item.tipo === "FAMILIAR" ? "Familiar" : tipoRotulo}
            {item.sigiloso_reforcado && (
              <Lock aria-label="Atendimento sigiloso" className="ml-1 inline h-3 w-3 text-sensitive" />
            )}
          </div>
        </div>
        {/* R7: Ícone de olho só no hover */}
        <span
          aria-label="Ver detalhes"
          className="shrink-0 rounded-lg p-1.5 text-ink/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        >
          <Eye className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

/* ── R17: Contraste AA para textos de rodapé ── */
function RodapePagina({
  pagina,
  totalPaginas,
  itensPorPagina,
  totalItens,
  inicio,
  fim,
  aoMudarPagina,
  aoMudarItensPorPagina,
}: {
  pagina: number;
  totalPaginas: number;
  itensPorPagina: number;
  totalItens: number;
  inicio: number;
  fim: number;
  aoMudarPagina: (p: number) => void;
  aoMudarItensPorPagina: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink/70">
      <span>
        Mostrando {inicio} a {fim} de {totalItens} atendimento{totalItens !== 1 ? "s" : ""}
      </span>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-ink/70">
          <span>Por página:</span>
          <select
            value={itensPorPagina}
            onChange={(e) => aoMudarItensPorPagina(Number(e.target.value))}
            className="min-h-8 rounded border border-outline-variant/40 bg-surface px-1.5 text-sm text-ink focus-visible:outline-focus"
            aria-label="Itens por página"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => aoMudarPagina(pagina - 1)}
            aria-label="Página anterior"
            className="min-h-8 min-w-8 rounded border border-outline-variant/40 bg-surface text-sm font-semibold text-ink disabled:opacity-40 focus-visible:outline-focus"
          >
            ‹
          </button>
          <span className="min-w-[3rem] text-center text-sm font-semibold text-ink">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => aoMudarPagina(pagina + 1)}
            aria-label="Próxima página"
            className="min-h-8 min-w-8 rounded border border-outline-variant/40 bg-surface text-sm font-semibold text-ink disabled:opacity-40 focus-visible:outline-focus"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──── Drawer de detalhes ──── */

function DrawerDetalhesAtendimento({
  caseFileId,
  attendanceId,
  membros,
  familiaId,
  mapaUnidades,
  aberto,
  aoFechar,
}: {
  caseFileId: string;
  attendanceId: string;
  membros: MemberOut[];
  familiaId: string;
  mapaUnidades: Record<string, string>;
  aberto: boolean;
  aoFechar: () => void;
}) {

  const query = useQuery({
    queryKey: ["attendance-detail", caseFileId, attendanceId],
    queryFn: () => servicoProntuario.obterAtendimento(caseFileId, attendanceId),
    staleTime: 10_000,
    enabled: aberto && Boolean(caseFileId) && Boolean(attendanceId),
  });

  const dados = query.data;
  const membrosNomes = useMemo(() => {
    if (!dados?.member_ids) return [];
    return dados.member_ids
      .map((id) => membros.find((m) => m.person_id === id)?.nome_exibicao)
      .filter(Boolean) as string[];
  }, [dados?.member_ids, membros]);

  /* R2: nome profissional */
  // TODO(R2): backend deve retornar `registrado_por_nome` no endpoint de detalhe.
  const nomeProfissional = (dados as Record<string, unknown> | undefined)?.registrado_por_nome
    ? String((dados as Record<string, unknown>).registrado_por_nome)
    : null;

  /* R3: nome da unidade */
  const nomeUnidade = dados?.unit_id ? (mapaUnidades[dados.unit_id] || null) : null;

  /* R14: autor da criação */
  // TODO(R14): backend deve retornar `created_by_name` e trilha de edição (`last_edited_by`, `last_edited_at`).
  const criadoPor = (dados as Record<string, unknown> | undefined)?.created_by_name
    ? String((dados as Record<string, unknown>).created_by_name)
    : null;
  const ultimaEdicaoPor = (dados as Record<string, unknown> | undefined)?.last_edited_by_name
    ? String((dados as Record<string, unknown>).last_edited_by_name)
    : null;
  const ultimaEdicaoEm = (dados as Record<string, unknown> | undefined)?.last_edited_at
    ? String((dados as Record<string, unknown>).last_edited_at)
    : null;

  const serviceCode = dados?.service_type_code || "";
  const serviceNomeCompleto = nomeCanonicoService(serviceCode);
  const corCategoria = corServiceChip(serviceCode);

  /* ── R3: Estado de copiar ID ── */
  const [idCopiado, setIdCopiado] = useState(false);
  const aoCopiarId = async () => {
    if (!dados?.id) return;
    const ok = await copiarParaClipboard(dados.id);
    if (ok) {
      setIdCopiado(true);
      setTimeout(() => setIdCopiado(false), 2000);
    }
  };

  return (
    <SlideOver aberto={aberto} aoFechar={aoFechar} titulo="Detalhes do atendimento" largura="lg">
      {query.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Skeleton variante="texto" linhas={6} />
        </div>
      )}

      {query.isError && (
        <EstadoErro
          problema={(query.error as ErroApi).problema}
          aoTentarNovamente={() => query.refetch()}
        />
      )}

      {dados && (
        <div className="space-y-6">
          {/* Confidencial sem permissão */}
          {dados.sigiloso_reforcado && dados.evolution_restrita ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-sensitive/30 bg-sensitive/5 p-6 text-center">
              <Lock className="h-8 w-8 text-sensitive" aria-hidden />
              <h3 className="text-base font-semibold text-sensitive">Atendimento sigiloso</h3>
              <p className="text-sm text-ink/70">
                O conteúdo deste atendimento é restrito aos profissionais autorizados.
              </p>
            </div>
          ) : (
            <>
              {/* ── R12: Barra de ações ── */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low p-2">
                <Botao
                  variante="tertiario"
                  tamanho="sm"
                  iconeInicio={<Edit3 className="h-4 w-4" />}
                  onClick={() => {
                    // TODO: navegar para a tela de edição do atendimento
                  }}
                >
                  Editar
                </Botao>
                <Botao
                  variante="tertiario"
                  tamanho="sm"
                  iconeInicio={<FileText className="h-4 w-4" />}
                  onClick={() => {
                    // TODO: abrir modal de anexar documento a este atendimento
                  }}
                >
                  Anexar
                </Botao>
                <Botao
                  variante="tertiario"
                  tamanho="sm"
                  iconeInicio={<Send className="h-4 w-4" />}
                  onClick={() => {
                    // TODO: iniciar encaminhamento a partir deste atendimento
                  }}
                >
                  Encaminhar
                </Botao>
                <div className="ml-auto flex items-center gap-1">
                  <Botao
                    variante="tertiario"
                    tamanho="sm"
                    iconeInicio={<Printer className="h-4 w-4" />}
                    onClick={() => {
                      window.print();
                    }}
                  >
                    Imprimir
                  </Botao>
                </div>
              </div>

              {/* ── R13: Cabeçalho com presença (tipo + data + abrangência + id curto) ── */}
              <div className="rounded-xl border-l-4 border-primary bg-surface-container-low p-5" style={{ borderLeftColor: `var(--ga-evt-${corCategoria === "neutro" ? "visita" : corCategoria})` }}>
                <div className="flex flex-wrap items-center gap-2">
                  {/* R4/R11: Mesmo chip da lista */}
                  <Chip cor={corCategoria}>
                    {nomeCurtoService(serviceCode)}
                  </Chip>
                  <span className="text-sm font-semibold text-ink">
                    {rotuloDe(TIPO_ATENDIMENTO, dados.tipo) || dados.tipo}
                  </span>
                  {dados.sigiloso_reforcado && (
                    <Chip cor="sensitive">
                      <Lock className="mr-1 h-3 w-3" />
                      Sigiloso
                    </Chip>
                  )}
                </div>
                {/* R4: Nome canônico igual ao usado na tag */}
                <div className="mt-3 text-lg font-bold text-ink">
                  {serviceNomeCompleto}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink/70">
                  <span>
                    {new Date(dados.data_atendimento).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {/* R3: ID curto com botão copiar */}
                  <span className="inline-flex items-center gap-1">
                    <span className="text-ink/60">#{idCurto(dados.id)}</span>
                    <button
                      type="button"
                      onClick={aoCopiarId}
                      aria-label="Copiar identificador para suporte"
                      title="Copiar identificador para suporte"
                      className="inline-flex items-center rounded p-0.5 text-ink/50 hover:text-primary hover:bg-primary-soft/50 focus-visible:outline-focus transition-colors"
                    >
                      {idCopiado ? (
                        <CheckCheck className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </span>
                  {nomeUnidade && <span>Unidade: {nomeUnidade}</span>}
                  <span className="text-ink/60">
                    Abrangência: {dados.tipo === "FAMILIAR" ? "Familiar" : (rotuloDe(TIPO_ATENDIMENTO, dados.tipo) || dados.tipo)}
                  </span>
                </div>
              </div>

              {/* Profissional (R2: nome real ou estado vazio) */}
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink/80">
                  Profissional responsável
                </h4>
                <div className="rounded-lg border border-outline-variant/20 bg-surface p-3">
                  {nomeProfissional ? (
                    <p className="text-sm font-medium text-ink">{nomeProfissional}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-ink/60">Sem profissional vinculado</p>
                      <span className="text-xs text-primary cursor-not-allowed opacity-50">
                        Vincular
                      </span>
                    </div>
                  )}
                  {nomeUnidade && (
                    <p className="text-xs text-ink/60 mt-0.5">{nomeUnidade}</p>
                  )}
                </div>
              </div>

              {/* Pessoas atendidas (R9: links para fichas) */}
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink/80">
                  Pessoas atendidas
                </h4>
                <div className="rounded-lg border border-outline-variant/20 bg-surface p-3">
                  {membrosNomes.length > 0 ? (
                    <ul className="space-y-1">
                      {membrosNomes.map((nome, i) => {
                        const membro = membros.find((m) => m.nome_exibicao === nome);
                        const personId = membro?.person_id;
                        return (
                          <li key={i}>
                            {personId ? (
                              <a
                                href={`/familias/${familiaId}/pessoas/${personId}`}
                                className="text-sm text-primary font-medium hover:underline focus-visible:outline-focus"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {nome}
                              </a>
                            ) : (
                              <span className="text-sm text-ink">{nome}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink/60">
                      {dados.tipo === "FAMILIAR" ? "Toda a família" : "Não informado"}
                    </p>
                  )}
                </div>
              </div>

              {/* ── R13: Registro do atendimento — LEITURA com tipografia confortável ── */}
              {dados.evolution_text && !dados.evolution_restrita && (
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink/80">
                    Registro do atendimento
                  </h4>
                  <div className="max-w-[75ch] rounded-lg border border-outline-variant/20 bg-surface p-6">
                    <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
                      {decodificarEntidadesHtml(dados.evolution_text)}
                    </div>
                  </div>
                </div>
              )}

              {dados.evolution_restrita && (
                <div className="rounded-lg border border-sensitive/20 bg-sensitive/5 p-3 text-sm text-ink/70">
                  O conteúdo técnico deste atendimento é restrito e não pode ser exibido para seu perfil.
                </div>
              )}

              {/* ── R14: Auditoria com autor e trilha de edição ── */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink/80">
                  Histórico e auditoria
                </h4>
                <div className="rounded-lg border border-outline-variant/20 bg-surface p-3 text-xs text-ink/70 space-y-1.5">
                  <p>
                    Criado{criadoPor ? ` por ${criadoPor}` : ""} em{" "}
                    {formatarDataCompleta(dados.created_at)}
                  </p>
                  {/* R14: trilha de edição */}
                  {dados.updated_at && dados.updated_at !== dados.created_at && (
                    <p>
                      Última edição{ultimaEdicaoPor ? ` por ${ultimaEdicaoPor}` : ""} em{" "}
                      {formatarDataCompleta(ultimaEdicaoEm || dados.updated_at)}
                    </p>
                  )}
                  {/* TODO(R14): backend deve expor endpoint de trilha de edição completa.
                      Quando disponível, adicionar expansível "Ver histórico completo". */}
                  {!dados.updated_at && (
                    <p className="text-ink/50 italic">
                      Trilha de edição não disponível
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </SlideOver>
  );
}

export default HistoricoAtendimentos;
