"use client";

/**
 * Central de despacho — a mesa do Assessor.
 *
 * O que voltou para ele decidir, o que o setor perguntou, o que está nos
 * setores (e há quanto tempo), o que está no governo. Cada número é uma aba;
 * a lista abaixo muda sem recarregar a página. Tudo em tempo real.
 *
 * A linha já mostra o que o setor respondeu e traz as decisões mais comuns
 * (encaminhar de novo, concluir, aguardar governo); o painel lateral deixa
 * ler a resposta e os documentos sem sair daqui.
 */

import clsx from "clsx";
import {
  AlertTriangle,
  BellRing,
  Building2,
  CheckCircle2,
  CornerUpLeft,
  Download,
  ExternalLink,
  MessageSquare,
  Columns3,
  FileText,
  Hourglass,
  Inbox,
  Landmark,
  List,
  Loader2,
  MessageCircleQuestion,
  PanelRightOpen,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import { Markdown } from "@/components/Markdown";
import { QuadroDePedidos } from "@/components/QuadroDePedidos";
import { EsqueletoPainel, Feed, ICONE_EVENTO, Secao, Vazio } from "@/components/painel/Blocos";
import {
  api,
  type Encaminhamento,
  type GargaloSetor,
  type PainelAssessor,
  type Pedido,
  type PedidoLinha,
} from "@/lib/api";
import {
  ROTULO_MOTIVO_PARADA,
  ROTULO_SITUACAO,
  ROTULO_TIPO,
  data,
  moedaCurta,
  ondeEsta,
  relativo,
  situacaoDoPrazo,
  tamanho,
} from "@/lib/formato";
import { useSessao } from "@/lib/sessao";
import { useNomeSetor, useSetores } from "@/lib/setores";
import { useAoMudar } from "@/lib/tempoReal";

type Aba = "caixa" | "complementos" | "em_setor" | "aguardando_governo" | "atrasados" | "parados";

const ABAS: { chave: Aba; rotulo: string; icone: typeof Inbox; vazio: string; tom?: "alerta" }[] = [
  { chave: "caixa", rotulo: "Voltaram para mim", icone: Inbox, vazio: "Nada esperando você. Mesa limpa." },
  { chave: "complementos", rotulo: "Setor perguntou", icone: MessageCircleQuestion, vazio: "Nenhum setor aguardando resposta." },
  { chave: "em_setor", rotulo: "Nos setores", icone: Building2, vazio: "Nenhum pedido nos setores." },
  { chave: "aguardando_governo", rotulo: "No governo", icone: Landmark, vazio: "Nada aguardando órgão externo." },
  { chave: "atrasados", rotulo: "Atrasados", icone: AlertTriangle, vazio: "Nenhum prazo vencido.", tom: "alerta" },
  { chave: "parados", rotulo: "Parados", icone: Hourglass, vazio: "Nada parado além do limite.", tom: "alerta" },
];

/** "hoje", "há 1 dia", "há 5 dias". */
function tempoNoLugar(dias: number) {
  return dias <= 0 ? "hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** "agora", "há 5 min", "há 2 d". */
function ha(iso: string | null | undefined) {
  const r = relativo(iso);
  return r === "agora" ? "agora" : `há ${r}`;
}

/** A última tarefa que o setor devolveu: é a "resposta" que o Assessor precisa ler. */
function ultimaDevolucao(p: Pedido | undefined): Encaminhamento | null {
  if (!p) return null;
  return (
    [...p.encaminhamentos]
      .filter((e) => e.devolvido_em)
      .sort((a, b) => (b.devolvido_em ?? "").localeCompare(a.devolvido_em ?? ""))[0] ?? null
  );
}

/** Tira a marcação do markdown para caber numa linha. */
function textoCurto(md: string | null | undefined) {
  return (md ?? "").replace(/[#*_>`[\]]/g, "").replace(/\s+/g, " ").trim();
}

type Acao = { tipo: "concluir" | "governo" | "cobrar" | "retomar"; pedido: PedidoLinha };

const TEXTO_ACAO: Record<Acao["tipo"], { titulo: string; campo: string; botao: string; obrigatorio?: boolean }> = {
  concluir: { titulo: "Concluir pedido", campo: "Observação final (opcional)", botao: "Concluir" },
  governo: {
    titulo: "Aguardar órgão externo",
    campo: "Protocolo ou o que está sendo aguardado",
    botao: "Marcar como aguardando",
  },
  cobrar: {
    titulo: "Registrar cobrança",
    campo: "Como e com quem cobrou",
    botao: "Registrar",
    obrigatorio: true,
  },
  retomar: { titulo: "Retomar o andamento", campo: "O que chegou do órgão externo (opcional)", botao: "Retomar" },
};

export function CentralAssessor() {
  const { eu } = useSessao();
  const router = useRouter();
  const nomeSetor = useNomeSetor();
  const { setores } = useSetores();
  const [dados, setDados] = useState<PainelAssessor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("caixa");
  const [modo, setModo] = useState<"lista" | "quadro">("lista");
  const [novos, setNovos] = useState<Set<string>>(new Set());
  const [detalhes, setDetalhes] = useState<Record<string, Pedido>>({});
  const [espiando, setEspiando] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [busca, setBusca] = useState("");
  const [fSetor, setFSetor] = useState("");
  const [fSituacao, setFSituacao] = useState("");
  const [fAbertos, setFAbertos] = useState(false);
  const [fComigo, setFComigo] = useState(false);
  const [fAtrasados, setFAtrasados] = useState(false);
  const [fParados, setFParados] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.painelAssessor());
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useAoMudar((pedidos) => {
    setNovos(new Set(pedidos.map((p) => p.id)));
    setDetalhes((d) => {
      const copia = { ...d };
      pedidos.forEach((p) => delete copia[p.id]);
      return copia;
    });
    carregar();
    setTimeout(() => setNovos(new Set()), 4000);
  });

  // O que voltou precisa mostrar a resposta do setor: busca o detalhe só desses.
  const idsCaixa = (dados?.caixa ?? []).map((p) => p.id).join(",");
  useEffect(() => {
    const faltam = idsCaixa.split(",").filter((id) => id && !detalhes[id]).slice(0, 25);
    if (!faltam.length) return;
    Promise.allSettled(faltam.map((id) => api.obter(id))).then((res) =>
      setDetalhes((d) => {
        const copia = { ...d };
        res.forEach((r) => {
          if (r.status === "fulfilled") copia[r.value.id] = r.value;
        });
        return copia;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsCaixa]);

  if (erro && !dados) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!dados) return <EsqueletoPainel />;

  const limite = dados.dias_alerta_parado;
  const base: PedidoLinha[] = dados[aba];
  const atual = ABAS.find((a) => a.chave === aba)!;
  const todosAbertos = [...dados.caixa, ...dados.em_setor, ...dados.aguardando_governo];

  const lista = base.filter((p) => {
    if (fSetor && p.setor_atual !== fSetor) return false;
    if (fSituacao && p.situacao !== fSituacao) return false;
    if (fComigo && p.responsavel_atual?.id !== eu?.id) return false;
    if (fAtrasados && p.dias_de_atraso <= 0) return false;
    if (fParados && p.dias_na_situacao < limite) return false;
    if (fAbertos && (p.situacao === "CONCLUIDO" || p.situacao === "CANCELADO")) return false;
    return true;
  });

  const setoresFiltro = setores.filter((s) => s.ativo);
  const contarSetor = (codigo: string) => base.filter((p) => p.setor_atual === codigo).length;
  const temFiltro = Boolean(fSetor || fSituacao || fAbertos || fComigo || fAtrasados || fParados);

  function limparFiltros() {
    setFSetor("");
    setFSituacao("");
    setFAbertos(false);
    setFComigo(false);
    setFAtrasados(false);
    setFParados(false);
  }

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const termo = busca.trim();
    if (!termo) return;
    const exato = todosAbertos.find((p) => p.numero === termo || p.numero.endsWith(`/${termo.padStart(6, "0")}`));
    router.push(exato ? `/pedidos/${exato.id}` : `/pedidos?q=${encodeURIComponent(termo)}`);
  }

  return (
    <div className="animate-fade-subir space-y-5 sm:space-y-6">
      <header className="relative overflow-hidden rounded-card border border-brand-800 p-6 text-white shadow-pop sm:p-7">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "rgb(var(--c-brand-900))",
            backgroundImage:
              "radial-gradient(at 0% 0%, rgb(var(--c-brand) / 0.45) 0px, transparent 55%), radial-gradient(at 100% 100%, rgb(var(--c-brand) / 0.25) 0px, transparent 50%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px]"
          aria-hidden
        />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-100/70">
              <span>GovTask</span>
              <span className="text-brand-200/40" aria-hidden>
                •
              </span>
              <span>Gabinete Digital</span>
              <span className="text-brand-200/40" aria-hidden>
                •
              </span>
              <span className="flex items-center gap-1 text-brass">
                <ShieldCheck size={13} aria-hidden /> Assessoria do Gabinete
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">
                Central de Despacho
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-brass/30 bg-brass/15 px-3 py-1 text-xs font-bold text-brass">
                <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden />
                {dados.contagens.abertos} pedidos abertos · {dados.contagens.caixa} com você
              </span>
            </div>
            <p className="text-xs leading-relaxed text-brand-100/75 sm:text-sm">
              Gerencie a triagem, acompanhe as respostas dos setores e direcione despachos
              estratégicos do gabinete em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-900/70 p-1 shadow-inner backdrop-blur"
              role="group"
              aria-label="Forma de visualização"
            >
              {(
                [
                  ["lista", List, "Lista"],
                  ["quadro", Columns3, "Quadro"],
                ] as const
              ).map(([m, Icone, r]) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  aria-pressed={modo === m}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs transition-colors",
                    modo === m
                      ? "bg-brass font-bold text-brand-900 shadow-sm"
                      : "font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icone size={14} aria-hidden /> {r}
                </button>
              ))}
            </div>
            {eu?.pode_criar && (
              <Link
                href="/pedidos/novo"
                className="botao bg-brand text-white shadow-md shadow-brand/30 hover:bg-brand-600"
              >
                <Plus size={16} aria-hidden /> Novo pedido
              </Link>
            )}
          </div>
        </div>
      </header>

      <div
        className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6"
        role="tablist"
      >
        {ABAS.map(({ chave, rotulo, icone: Icone, tom }) => {
          const n = dados.contagens[chave];
          const ativo = aba === chave;
          const alerta = tom === "alerta" && n > 0;
          return (
            <button
              key={chave}
              role="tab"
              aria-selected={ativo}
              onClick={() => {
                setAba(chave);
                setModo("lista");
              }}
              className={clsx(
                "relative min-w-[9.5rem] snap-start rounded-xl border bg-paper p-4 text-left transition sm:min-w-0",
                ativo
                  ? "border-brand shadow-card ring-1 ring-brand/20"
                  : "border-line hover:border-line-strong hover:shadow-card"
              )}
            >
              <span className="mb-2 flex items-center justify-between">
                <Icone
                  size={19}
                  className={alerta ? "text-estado-atrasado" : ativo ? "text-brand" : "text-ink-faint"}
                  aria-hidden
                />
                <span
                  className={clsx(
                    "font-display text-2xl leading-none tabular-nums",
                    alerta ? "text-estado-atrasado" : "text-ink"
                  )}
                >
                  {n}
                </span>
              </span>
              <span
                className={clsx(
                  "block text-xs font-semibold",
                  ativo ? "text-brand" : "text-ink-soft"
                )}
              >
                {rotulo}
              </span>
              {ativo && (
                <span
                  className={clsx(
                    "absolute inset-x-3 bottom-0 h-0.5 rounded-full",
                    alerta ? "bg-estado-atrasado" : "bg-brand"
                  )}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <section className="cartao flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex min-w-[280px] flex-1 flex-wrap items-center gap-2.5">
          <form onSubmit={buscar} className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pedido por número ou título…"
              aria-label="Buscar pedido"
              className="campo w-full pl-9"
            />
          </form>
          <select
            value={fSetor}
            onChange={(e) => setFSetor(e.target.value)}
            aria-label="Filtrar por setor"
            className="campo w-auto cursor-pointer text-xs"
          >
            <option value="">Setor: todos</option>
            {setoresFiltro.map((s) => (
              <option key={s.codigo} value={s.codigo}>
                {s.nome} ({contarSetor(s.codigo)})
              </option>
            ))}
          </select>
          <select
            value={fSituacao}
            onChange={(e) => setFSituacao(e.target.value)}
            aria-label="Filtrar por situação"
            className="campo w-auto cursor-pointer text-xs"
          >
            <option value="">Situação: todas</option>
            {Object.entries(ROTULO_SITUACAO).map(([codigo, texto]) => (
              <option key={codigo} value={codigo}>
                {texto}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <ChipFiltro rotulo="Só abertos" ativo={fAbertos} aoMudar={setFAbertos} />
          <ChipFiltro rotulo="Só comigo" ativo={fComigo} aoMudar={setFComigo} />
          <ChipFiltro rotulo="Só atrasados" ativo={fAtrasados} aoMudar={setFAtrasados} tom="alerta" />
          <ChipFiltro
            rotulo={`Parados (${limite}+ dias)`}
            ativo={fParados}
            aoMudar={setFParados}
            tom="brass"
          />
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="ml-1 font-semibold text-brand hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        <section className="cartao overflow-hidden lg:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/40 px-5 py-4">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-medium text-ink">
                {modo === "quadro" ? "Onde cada pedido está" : atual.rotulo}
                <span className="rounded-pill border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand">
                  {modo === "quadro" ? todosAbertos.length : lista.length}
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {modo === "quadro"
                  ? "Todos os abertos, por setor"
                  : aba === "parados"
                    ? `No mesmo lugar há ${limite} dias ou mais`
                    : `${lista.length} ${lista.length === 1 ? "pedido" : "pedidos"} nesta visão`}
              </p>
            </div>
          </header>

          <div className="p-4">
            {modo === "quadro" ? (
              <QuadroDePedidos pedidos={todosAbertos} />
            ) : lista.length === 0 ? (
              <Vazio texto={temFiltro ? "Nenhum pedido com esses filtros." : atual.vazio} />
            ) : (
              <ul className="space-y-3">
                {lista.map((p) => (
                  <LinhaCentral
                    key={p.id}
                    p={p}
                    aba={aba}
                    limite={limite}
                    detalhe={detalhes[p.id]}
                    destaque={novos.has(p.id)}
                    podeDespachar={Boolean(eu?.pode_encaminhar)}
                    aoEspiar={() => setEspiando(p.id)}
                    aoAgir={(tipo) => setAcao({ tipo, pedido: p })}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="space-y-5 lg:space-y-6">
          <CargaDosSetores gargalos={dados.gargalos} />
          <Secao titulo="Movimentações" subtitulo="Ao vivo">
            <Feed eventos={dados.recentes.slice(0, 12)} />
          </Secao>
        </div>
      </div>

      {espiando && (
        <PainelEspiar
          id={espiando}
          podeDespachar={Boolean(eu?.pode_encaminhar)}
          aoFechar={() => setEspiando(null)}
          aoAgir={(tipo, p) => setAcao({ tipo, pedido: p })}
          nomeSetor={nomeSetor}
        />
      )}

      {acao && (
        <ModalAcao
          acao={acao}
          aoFechar={() => setAcao(null)}
          aoConcluir={() => {
            setAcao(null);
            setEspiando(null);
            setDetalhes((d) => {
              const copia = { ...d };
              delete copia[acao.pedido.id];
              return copia;
            });
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ── Chip de filtro rápido ───────────────────────────────────────────────

const TOM_CHIP = {
  marca: "border-brand-200 bg-brand-50 text-brand-800",
  alerta: "border-estado-atrasado/30 bg-estado-atrasado/5 text-estado-atrasado",
  brass: "border-brass/30 bg-brass-50 text-brass-700",
} as const;

function ChipFiltro({
  rotulo,
  ativo,
  aoMudar,
  tom = "marca",
}: {
  rotulo: string;
  ativo: boolean;
  aoMudar: (v: boolean) => void;
  tom?: keyof typeof TOM_CHIP;
}) {
  return (
    <button
      type="button"
      onClick={() => aoMudar(!ativo)}
      aria-pressed={ativo}
      className={clsx(
        "rounded-lg border px-2.5 py-1 font-medium transition-colors",
        ativo ? TOM_CHIP[tom] : "border-line bg-canvas text-ink-soft hover:border-line-strong hover:bg-paper"
      )}
    >
      {rotulo}
    </button>
  );
}

// ── Linha ───────────────────────────────────────────────────────────────

function LinhaCentral({
  p,
  aba,
  limite,
  detalhe,
  destaque,
  podeDespachar,
  aoEspiar,
  aoAgir,
}: {
  p: PedidoLinha;
  aba: Aba;
  limite: number;
  detalhe?: Pedido;
  destaque: boolean;
  podeDespachar: boolean;
  aoEspiar: () => void;
  aoAgir: (tipo: Acao["tipo"]) => void;
}) {
  const nomeSetor = useNomeSetor();
  const parado = p.dias_na_situacao >= limite;
  const volta = aba === "caixa" ? ultimaDevolucao(detalhe) : null;
  const prazo = situacaoDoPrazo(p.prazo_atual, p.dias_de_atraso);
  const noGoverno = p.situacao === "AGUARDANDO_TERCEIRO";
  const comAssessor = p.situacao === "COM_ASSESSOR";

  const contexto = (() => {
    if (volta) {
      const docs = volta.anexos.length;
      return [
        `${nomeSetor(volta.setor)} respondeu`,
        docs ? `${docs} ${docs === 1 ? "documento" : "documentos"}` : null,
        `voltou ${ha(volta.devolvido_em)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (noGoverno) {
      return [
        p.motivo_parada ? ROTULO_MOTIVO_PARADA[p.motivo_parada] : "Aguardando órgão externo",
        p.motivo_parada_texto,
      ]
        .filter(Boolean)
        .join(" — ");
    }
    if (p.situacao === "EM_SETOR") {
      return [nomeSetor(p.setor_atual), p.tarefa_atual, p.responsavel_atual?.name.split(" ")[0] ?? "sem dono"]
        .filter(Boolean)
        .join(" · ");
    }
    return [ROTULO_TIPO[p.tipo] ?? p.tipo, Number(p.valor_previsto) > 0 ? moedaCurta(p.valor_previsto) : null]
      .filter(Boolean)
      .join(" · ");
  })();

  const corAba = {
    caixa: "bg-brand",
    complementos: "bg-brass",
    em_setor: "bg-brand",
    aguardando_governo: "bg-estado-externo",
    atrasados: "bg-estado-atrasado",
    parados: "bg-estado-atrasado",
  }[aba];

  return (
    <li>
      <article
        className={clsx(
          "relative overflow-hidden rounded-xl border bg-paper p-4 transition duration-1000 hover:border-brand/40 hover:shadow-card",
          destaque ? "border-brass/50 bg-brass-50/40" : "border-line"
        )}
      >
        <span className={clsx("absolute inset-y-0 left-0 w-1", corAba)} aria-hidden />
        <div className="pl-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/pedidos/${p.id}`}
                className="numero rounded border border-line bg-canvas px-2 py-0.5 tracking-tight transition-colors hover:text-ink"
              >
                {p.numero}
              </Link>
              <span
                className={clsx(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold",
                  parado ? "bg-estado-atrasado/10 text-estado-atrasado" : "bg-brass-50 text-brass-700"
                )}
                title="Tempo no lugar atual"
              >
                <Hourglass size={11} aria-hidden />
                {tempoNoLugar(p.dias_na_situacao)}
              </span>
            </div>
            {p.situacao === "EM_SETOR" && prazo.tom !== "sem" && (
              <span
                className={clsx(
                  "shrink-0 text-xs font-semibold",
                  prazo.tom === "atrasado" || prazo.tom === "hoje"
                    ? "text-estado-atrasado"
                    : "text-ink-muted"
                )}
              >
                {prazo.texto}
              </span>
            )}
          </div>

          <Link href={`/pedidos/${p.id}`} className="group mt-2 block">
            <h3 className="truncate text-base font-bold text-ink transition-colors group-hover:text-brand">
              {p.titulo}
            </h3>
          </Link>
          {contexto && <p className="mt-1 truncate text-sm text-ink-soft">{contexto}</p>}
          {volta?.resultado && (
            <p className="mt-2 line-clamp-2 rounded-lg bg-canvas px-2.5 py-1.5 text-sm text-ink">
              “{textoCurto(volta.resultado)}”
            </p>
          )}

          {noGoverno && parado && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brass-700">
              <BellRing size={13} aria-hidden />
              {tempoNoLugar(p.dias_na_situacao)} sem resposta do órgão externo. Vale cobrar.
            </p>
          )}

          {podeDespachar && (comAssessor || noGoverno) && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              {comAssessor && (
                <>
                  <Link href={`/pedidos/${p.id}?acao=encaminhar`} className="botao-primario px-3 py-1.5 text-xs">
                    <Send size={13} aria-hidden /> Encaminhar
                  </Link>
                  <button onClick={() => aoAgir("concluir")} className="botao-secundario px-3 py-1.5 text-xs">
                    <CheckCircle2 size={13} aria-hidden /> Concluir
                  </button>
                  <button onClick={() => aoAgir("governo")} className="botao-secundario px-3 py-1.5 text-xs">
                    <Landmark size={13} aria-hidden /> Aguardar governo
                  </button>
                </>
              )}
              {noGoverno && (
                <>
                  <button onClick={() => aoAgir("cobrar")} className="botao-secundario px-3 py-1.5 text-xs">
                    <BellRing size={13} aria-hidden /> Registrar cobrança
                  </button>
                  <button onClick={() => aoAgir("retomar")} className="botao-secundario px-3 py-1.5 text-xs">
                    <Play size={13} aria-hidden /> Chegou, retomar
                  </button>
                </>
              )}
              <button onClick={aoEspiar} className="botao-secundario px-3 py-1.5 text-xs">
                <PanelRightOpen size={13} aria-hidden /> Ver resposta
              </button>
            </div>
          )}
        </div>
      </article>
    </li>
  );
}

// ── Carga dos setores ───────────────────────────────────────────────────

function CargaDosSetores({ gargalos }: { gargalos: GargaloSetor[] }) {
  const ordenados = [...gargalos].sort((a, b) => b.abertos - a.abertos || a.nome.localeCompare(b.nome));
  const maior = Math.max(1, ...ordenados.map((g) => g.abertos));
  const algum = ordenados.some((g) => g.abertos > 0);
  return (
    <Secao
      titulo="Carga dos setores"
      subtitulo={algum ? "Abertos agora e quanto cada setor costuma levar" : "Todos os setores livres agora"}
    >
      {ordenados.length === 0 ? (
        <Vazio texto="Nenhum setor cadastrado." />
      ) : (
        <ul className="space-y-2.5">
          {ordenados.map((g) => (
            <li key={g.setor}>
              <Link href={`/pedidos?setor=${g.setor}&abertos=1`} className="group block">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={clsx("truncate", g.abertos ? "font-medium text-ink" : "text-ink-faint")}>
                    {g.nome}
                  </span>
                  <span className={clsx("shrink-0 tabular-nums", g.abertos ? "text-ink" : "text-ink-faint")}>
                    {g.abertos}
                  </span>
                </div>
                {g.abertos > 0 && (
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-canvas">
                    <span
                      className={clsx("block h-full", g.parados || g.atrasados ? "bg-estado-atrasado" : "bg-brand")}
                      style={{ width: `${(g.abertos / maior) * 100}%` }}
                    />
                  </span>
                )}
                <span className="mt-0.5 block text-[11px] text-ink-faint">
                  {[
                    g.atrasados ? `${g.atrasados} atrasado${g.atrasados > 1 ? "s" : ""}` : null,
                    g.parados ? `${g.parados} parado${g.parados > 1 ? "s" : ""}` : null,
                    g.passagens_concluidas > 0 && g.dias_medios_historico != null
                      ? g.dias_medios_historico < 1
                        ? "costuma resolver no mesmo dia"
                        : `costuma levar ${Math.round(g.dias_medios_historico)} dia${Math.round(g.dias_medios_historico) > 1 ? "s" : ""}`
                      : "sem histórico ainda",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ── Painel lateral ──────────────────────────────────────────────────────

function PainelEspiar({
  id,
  podeDespachar,
  aoFechar,
  aoAgir,
  nomeSetor,
}: {
  id: string;
  podeDespachar: boolean;
  aoFechar: () => void;
  aoAgir: (tipo: Acao["tipo"], p: PedidoLinha) => void;
  nomeSetor: (c: string | null | undefined) => string;
}) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setPedido(null);
    api.obter(id).then(setPedido).catch((e) => setErro(e.message));
  }, [id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  const volta = ultimaDevolucao(pedido ?? undefined);
  const comAssessor = pedido?.situacao === "COM_ASSESSOR";
  const noGoverno = pedido?.situacao === "AGUARDANDO_TERCEIRO";
  const temAcoes = podeDespachar && (comAssessor || noGoverno);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Resumo do pedido">
      <button className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={aoFechar} aria-label="Fechar" />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-canvas shadow-pop animate-fade-subir">
        {/* Cabeçalho */}
        <header className="border-b border-line bg-paper px-5 pb-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {pedido && <span className="numero">{pedido.numero}</span>}
              {pedido && (
                <span className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                  {ondeEsta(pedido.situacao, pedido.setor_atual, nomeSetor)} · {tempoNoLugar(pedido.dias_na_situacao)}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {pedido && (
                <Link
                  href={`/pedidos/${pedido.id}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-canvas hover:text-brand"
                  title="Abrir pedido"
                  aria-label="Abrir pedido"
                >
                  <ExternalLink size={16} />
                </Link>
              )}
              <button
                onClick={aoFechar}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-canvas"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <h2 className="mt-2 font-display text-xl font-medium leading-snug text-ink">
            {pedido ? pedido.titulo : "Carregando…"}
          </h2>
          {pedido && (
            <p className="mt-1 text-xs text-ink-muted">
              {[ROTULO_TIPO[pedido.tipo] ?? pedido.tipo, Number(pedido.valor_previsto) > 0 ? moedaCurta(pedido.valor_previsto) : null, pedido.origem_nome]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {erro && <p className="text-sm text-estado-atrasado">{erro}</p>}
          {!pedido && !erro && <Loader2 className="mx-auto mt-10 animate-spin text-ink-faint" />}
          {pedido && (
            <>
              {pedido.motivo_parada && (
                <div className="flex items-start gap-2 rounded-card border border-estado-andamento/30 bg-estado-andamento/5 px-3 py-2.5 text-sm text-ink">
                  <Landmark size={15} className="mt-0.5 shrink-0 text-estado-andamento" aria-hidden />
                  <span>
                    <strong className="font-medium">{ROTULO_MOTIVO_PARADA[pedido.motivo_parada]}</strong>
                    {pedido.motivo_parada_texto ? ` — ${pedido.motivo_parada_texto}` : ""}
                  </span>
                </div>
              )}

              {/* Resposta do setor */}
              {volta ? (
                <section className="cartao overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
                      <CornerUpLeft size={16} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{nomeSetor(volta.setor)} respondeu</p>
                      <p className="truncate text-xs text-ink-muted">
                        {volta.responsavel ? `${volta.responsavel.name} · ` : ""}
                        {ha(volta.devolvido_em)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 px-4 py-3">
                    <p className="legenda">Tarefa: {volta.assunto}</p>
                    {volta.resultado ? (
                      <div className="border-l-2 border-brand pl-3 text-[15px] leading-relaxed text-ink">
                        <Markdown texto={volta.resultado} className="space-y-1.5" />
                      </div>
                    ) : (
                      <p className="text-sm text-ink-muted">Devolvido sem comentário.</p>
                    )}
                    {volta.anexos.length > 0 && (
                      <ul className="space-y-1.5">
                        {volta.anexos.map((a) => (
                          <li key={a.id}>
                            <button
                              onClick={() => api.baixarAnexo(pedido.id, a).catch((e) => toast.error(e.message))}
                              className="group flex w-full items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand-50/40"
                              title={a.nome_original}
                            >
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
                                <FileText size={15} aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{a.nome_original}</span>
                                <span className="block text-[11px] text-ink-faint">
                                  {tamanho(a.tamanho_bytes)} · {ha(a.created_at)}
                                </span>
                              </span>
                              <Download size={15} className="shrink-0 text-ink-faint group-hover:text-brand" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ) : (
                <p className="cartao px-4 py-3 text-sm text-ink-muted">Nenhum setor devolveu tarefa ainda.</p>
              )}

              {/* Linha do tempo */}
              <section>
                <p className="legenda mb-2 px-1">Últimos acontecimentos</p>
                <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line">
                  {[...pedido.andamentos]
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .slice(0, 8)
                    .map((ev) => {
                      const Icone = ICONE_EVENTO[ev.tipo] ?? MessageSquare;
                      return (
                        <li key={ev.id} className="relative flex gap-3">
                          <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-paper text-ink-muted">
                            <Icone size={13} aria-hidden />
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <p className="break-words text-sm text-ink-soft">{ev.texto}</p>
                            <p className="text-[11px] text-ink-faint">
                              {ev.autor_nome} · {ha(ev.created_at)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </section>
            </>
          )}
        </div>

        {/* Ações */}
        {pedido && temAcoes && (
          <footer className="space-y-2 border-t border-line bg-paper px-5 py-4">
            {comAssessor && (
              <>
                <Link href={`/pedidos/${pedido.id}?acao=encaminhar`} className="botao-primario w-full justify-center">
                  <Send size={15} aria-hidden /> Encaminhar a um setor
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => aoAgir("concluir", pedido)} className="botao-secundario justify-center">
                    <CheckCircle2 size={15} aria-hidden /> Concluir
                  </button>
                  <button onClick={() => aoAgir("governo", pedido)} className="botao-secundario justify-center">
                    <Landmark size={15} aria-hidden /> Aguardar governo
                  </button>
                </div>
              </>
            )}
            {noGoverno && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => aoAgir("cobrar", pedido)} className="botao-secundario justify-center">
                  <BellRing size={15} aria-hidden /> Registrar cobrança
                </button>
                <button onClick={() => aoAgir("retomar", pedido)} className="botao-primario justify-center">
                  <Play size={15} aria-hidden /> Chegou, retomar
                </button>
              </div>
            )}
          </footer>
        )}
      </aside>
    </div>,
    document.body
  );
}

// ── Modal de ação rápida ────────────────────────────────────────────────

function ModalAcao({
  acao,
  aoFechar,
  aoConcluir,
}: {
  acao: Acao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const cfg = TEXTO_ACAO[acao.tipo];
  const id = acao.pedido.id;

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim() || undefined;
    if (cfg.obrigatorio && !t) return;
    setEnviando(true);
    try {
      if (acao.tipo === "concluir") await api.concluir(id, t);
      if (acao.tipo === "governo") await api.aguardarTerceiro(id, t);
      if (acao.tipo === "retomar") await api.retomar(id, t);
      if (acao.tipo === "cobrar") await api.comentar(id, `Cobrança ao órgão externo: ${t}`);
      toast.success("Feito.");
      aoConcluir();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={cfg.titulo}>
      <button className="absolute inset-0 bg-ink/30" onClick={aoFechar} aria-label="Fechar" />
      <form onSubmit={confirmar} className="relative w-full max-w-md rounded-card border border-line bg-elevated p-5 shadow-pop">
        <h2 className="font-display text-lg font-medium text-ink">{cfg.titulo}</h2>
        <p className="mt-0.5 truncate text-sm text-ink-muted">
          {acao.pedido.numero} · {acao.pedido.titulo}
        </p>
        <label className="mt-4 block text-sm font-medium text-ink-soft">
          {cfg.campo}
          <textarea
            autoFocus
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="campo mt-1 w-full"
            required={cfg.obrigatorio}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className="botao-secundario">
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className="botao-primario">
            {enviando && <Loader2 size={15} className="animate-spin" />}
            {cfg.botao}
          </button>
        </div>
      </form>
    </div>,
    document.body
    )
  );
}
