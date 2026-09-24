"use client";

/**
 * Todos os pedidos. Uma barra de filtros e quatro formas de olhar a mesma
 * coisa: lista (o dia a dia), quadro (onde está cada um), calendário (os
 * prazos do mês) e tabela (densidade e exportação). Quadro e calendário são
 * leitura — trabalhar a tarefa continua sendo só na tela do pedido.
 */

import clsx from "clsx";
import {
  CalendarDays,
  FileSpreadsheet,
  KanbanSquare,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { CalendarioDePrazos } from "@/components/CalendarioDePrazos";
import { ListaDePedidos } from "@/components/ListaDePedidos";
import { QuadroDePedidos } from "@/components/QuadroDePedidos";
import { TabelaDePedidos } from "@/components/TabelaDePedidos";
import { VisoesSalvas } from "@/components/VisoesSalvas";
import { api, type PedidoLinha } from "@/lib/api";
import {
  ROTULO_MOTIVO_PARADA,
  ROTULO_ORIGEM,
  ROTULO_SITUACAO,
  ROTULO_TIPO,
  moeda,
} from "@/lib/formato";
import { useSessao } from "@/lib/sessao";
import { useAoMudar } from "@/lib/tempoReal";
import { useSetores } from "@/lib/setores";
import {
  DIAS_PARADO,
  FILTROS_VAZIOS,
  intervaloDoMes,
  type Filtros,
} from "@/lib/visoes";

const TAMANHO = 25;
const LIMITE_VISAO = 100;

type Visao = "lista" | "quadro" | "calendario" | "tabela";

const VISOES: { chave: Visao; rotulo: string; icone: typeof List }[] = [
  { chave: "lista", rotulo: "Lista", icone: List },
  { chave: "quadro", rotulo: "Quadro", icone: KanbanSquare },
  { chave: "calendario", rotulo: "Calendário", icone: CalendarDays },
  { chave: "tabela", rotulo: "Tabela", icone: Table2 },
];

const ROTULO_PRIORIDADE: Record<string, string> = {
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export default function Pedidos() {
  return (
    <Suspense>
      <ConteudoPedidos />
    </Suspense>
  );
}

/** Título da página conforme o recorte que chegou pela URL. */
function tituloDo(f: Filtros): { titulo: string; sobre: string } {
  if (f.parados) return { titulo: "Parados", sobre: "Onde está travado" };
  if (f.tipo === "OBRA") return { titulo: "Obras", sobre: "Acompanhamento" };
  if (f.tipo === "AQUISICAO") return { titulo: "Aquisições", sobre: "Acompanhamento" };
  if (f.parlamentar) return { titulo: f.parlamentar, sobre: "Pedidos do parlamentar" };
  if (f.situacao === "AGUARDANDO_TERCEIRO") return { titulo: "No governo", sobre: "Aguardando órgão externo" };
  if (f.situacao === "CONCLUIDO") return { titulo: "Concluídos", sobre: "Entregues" };
  return { titulo: "Pedidos", sobre: "Gestão e tramitação" };
}

function ConteudoPedidos() {
  const [itens, setItens] = useState<PedidoLinha[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState<Visao>("lista");
  const [mes, setMes] = useState(() => new Date());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const { eu } = useSessao();
  const { setores, nomes } = useSetores();
  const [diasParado, setDiasParado] = useState(DIAS_PARADO);
  const busca = useSearchParams();
  const chaveBusca = busca.toString();

  useEffect(() => {
    api.ajustes().then((a) => setDiasParado(a.dias_alerta_parado)).catch(() => {});
  }, []);

  // Os cartões e o menu chegam por link (/pedidos?tipo=OBRA…). A cada troca
  // de URL — inclusive navegando entre itens do menu — os filtros seguem.
  useEffect(() => {
    const params = new URLSearchParams(chaveBusca);
    const bool = (v: string | null) => v === "true" || v === "1";
    setFiltros({
      q: params.get("q") ?? "",
      situacao: params.get("situacao") ?? "",
      tipo: params.get("tipo") ?? "",
      setor: params.get("setor") ?? "",
      prioridade: params.get("prioridade") ?? "",
      origem: params.get("origem") ?? "",
      atrasados: bool(params.get("atrasados")),
      comigo: bool(params.get("comigo")),
      parados: bool(params.get("parados")),
      abertos: bool(params.get("abertos")),
      motivo_parada: params.get("motivo_parada") ?? "",
      parlamentar: params.get("parlamentar") ?? "",
    });
  }, [chaveBusca]);

  const buscar = useCallback(async () => {
    setCarregando(true);
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        q: filtros.q,
        situacao: filtros.situacao,
        tipo: filtros.tipo,
        setor: filtros.setor,
        prioridade: filtros.prioridade,
        origem: filtros.origem,
        atrasados: filtros.atrasados,
        comigo: filtros.comigo,
        parados_dias: filtros.parados ? diasParado : undefined,
        abertos: filtros.abertos,
        motivo_parada: filtros.motivo_parada,
        parlamentar: filtros.parlamentar,
      };
      if (visao === "lista") {
        params.pagina = pagina;
        params.tamanho = TAMANHO;
      } else if (visao === "calendario") {
        const { de, ate } = intervaloDoMes(mes);
        params.prazo_de = de;
        params.prazo_ate = ate;
        params.tamanho = LIMITE_VISAO;
      } else {
        params.tamanho = LIMITE_VISAO;
      }

      const resposta = await api.listar(params);
      setItens(resposta.itens);
      setTotal(resposta.total);
    } finally {
      setCarregando(false);
    }
  }, [filtros, visao, pagina, mes, diasParado]);

  useAoMudar(() => {
    buscar();
  });

  // Digitação não dispara uma chamada por tecla.
  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar]);

  useEffect(() => setPagina(1), [filtros, visao, mes]);

  function mudarFiltro<K extends keyof Filtros>(chave: K, valor: Filtros[K]) {
    setFiltros((atual) => ({ ...atual, [chave]: valor }));
  }

  const paginas = Math.max(1, Math.ceil(total / TAMANHO));
  const setoresOpcoes = Object.fromEntries(
    setores.map((s) => [s.codigo, nomes[s.codigo]])
  );
  const mostrarAvisoLimite = visao !== "lista" && total > LIMITE_VISAO;

  const totalValor = itens.reduce((soma, p) => soma + Number(p.valor_previsto || 0), 0);
  const temFiltroAtivo =
    Boolean(filtros.q) ||
    Boolean(filtros.situacao) ||
    Boolean(filtros.tipo) ||
    Boolean(filtros.setor) ||
    Boolean(filtros.prioridade) ||
    Boolean(filtros.origem) ||
    Boolean(filtros.motivo_parada) ||
    Boolean(filtros.parlamentar) ||
    filtros.atrasados ||
    filtros.comigo ||
    filtros.parados ||
    filtros.abertos;
  const titulo = tituloDo(filtros);

  return (
    <div className="animate-fade-subir space-y-5">
      <section className="relative overflow-hidden rounded-card border border-brand-800 px-6 py-6 text-white shadow-pop sm:px-8 sm:py-7">
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

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-extrabold uppercase tracking-widest text-brand-100/90">
                GovTask · Gabinete Digital
              </span>
              <span className="h-1 w-1 rounded-full bg-brand-200" aria-hidden />
              <span className="text-xs text-brand-100/70">{titulo.sobre}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-3.5">
              <h1 className="font-display text-3xl font-medium tracking-tight text-white drop-shadow-sm sm:text-4xl">
                {titulo.titulo}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden />
                {total} {total === 1 ? "pedido no fluxo" : "pedidos no fluxo"}
                {carregando && <span className="opacity-60"> · atualizando…</span>}
              </span>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-slate-300">
              Visualize, analise prazos legais e avance etapas do fluxo de aquisições e
              protocolos do gabinete.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="rolagem-fina inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/70 p-1 shadow-inner backdrop-blur"
              role="tablist"
              aria-label="Forma de visualização"
            >
              {VISOES.map(({ chave, rotulo, icone: Icone }) => (
                <button
                  key={chave}
                  role="tab"
                  aria-selected={visao === chave}
                  onClick={() => setVisao(chave)}
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs transition-colors",
                    visao === chave
                      ? "bg-brass font-bold text-brand-900 shadow-sm hover:bg-brass-600"
                      : "font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icone size={15} aria-hidden />
                  {rotulo}
                </button>
              ))}
            </div>
            {eu?.pode_criar && (
              <Link
                href="/pedidos/novo"
                className="botao bg-brand text-white shadow-md shadow-brand/30 hover:bg-brand-600"
              >
                <Plus size={16} aria-hidden />
                Novo pedido
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="cartao p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand">
              <SlidersHorizontal size={15} aria-hidden />
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Buscar e filtrar
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-ink-faint">Total:</span>
              <strong className="font-semibold text-ink">
                {total} {total === 1 ? "pedido" : "pedidos"}
              </strong>
            </span>
            {totalValor > 0 && (
              <>
                <span className="text-line-strong" aria-hidden>
                  •
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-ink-faint">Valor listado:</span>
                  <strong className="font-semibold text-ink">{moeda(totalValor)}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 items-center gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-8">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              className="campo pl-9"
              placeholder="Número, título, deputado, protocolo, documento ou comentário…"
              value={filtros.q}
              onChange={(e) => mudarFiltro("q", e.target.value)}
              aria-label="Buscar pedidos"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:col-span-4">
            <VisoesSalvas
              filtros={filtros}
              aoAplicar={(f) => setFiltros({ ...FILTROS_VAZIOS, ...f })}
            />
            <button
              className="botao-secundario ml-auto text-xs"
              onClick={() =>
                api
                  .baixarListaXlsx({
                    q: filtros.q,
                    situacao: filtros.situacao,
                    tipo: filtros.tipo,
                    setor: filtros.setor,
                    prioridade: filtros.prioridade,
                    origem: filtros.origem,
                    atrasados: filtros.atrasados,
                    comigo: filtros.comigo,
                    parados_dias: filtros.parados ? diasParado : undefined,
                  })
                  .catch((e) => toast.error(e.message))
              }
            >
              <FileSpreadsheet size={15} className="text-estado-concluido" aria-hidden />
              Excel
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Selecao
            rotulo="Situação"
            valor={filtros.situacao}
            aoMudar={(v) => mudarFiltro("situacao", v)}
            opcoes={ROTULO_SITUACAO}
          />
          <Selecao
            rotulo="Tipo"
            valor={filtros.tipo}
            aoMudar={(v) => mudarFiltro("tipo", v)}
            opcoes={ROTULO_TIPO}
          />
          <Selecao
            rotulo="Setor"
            valor={filtros.setor}
            aoMudar={(v) => mudarFiltro("setor", v)}
            opcoes={setoresOpcoes}
          />
          <Selecao
            rotulo="Prioridade"
            valor={filtros.prioridade}
            aoMudar={(v) => mudarFiltro("prioridade", v)}
            opcoes={ROTULO_PRIORIDADE}
          />
          <Selecao
            rotulo="Origem"
            valor={filtros.origem}
            aoMudar={(v) => mudarFiltro("origem", v)}
            opcoes={ROTULO_ORIGEM}
          />
          <Selecao
            rotulo="Motivo da parada"
            valor={filtros.motivo_parada}
            aoMudar={(v) => mudarFiltro("motivo_parada", v)}
            opcoes={ROTULO_MOTIVO_PARADA}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Filtros rápidos:
          </span>
          <Toggle
            rotulo="Só comigo"
            marcado={filtros.comigo}
            aoMudar={(v) => mudarFiltro("comigo", v)}
          />
          <Toggle
            rotulo="Só atrasados"
            marcado={filtros.atrasados}
            aoMudar={(v) => mudarFiltro("atrasados", v)}
            tom="alerta"
          />
          <Toggle
            rotulo={`Parados (${diasParado}+ dias)`}
            titulo={`No mesmo lugar há ${diasParado} dias ou mais`}
            marcado={filtros.parados}
            aoMudar={(v) => mudarFiltro("parados", v)}
            tom="brass"
          />
          <Toggle
            rotulo="Só abertos"
            marcado={filtros.abertos}
            aoMudar={(v) => mudarFiltro("abertos", v)}
            tom="marca"
          />
          {filtros.parlamentar && (
            <button
              onClick={() => mudarFiltro("parlamentar", "")}
              className="etiqueta bg-brass-50 text-brass-700 hover:bg-brass-100"
            >
              Parlamentar: {filtros.parlamentar} ✕
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Exibindo <strong className="text-ink">{itens.length}</strong> de{" "}
            <strong className="text-ink">{total}</strong>
          </span>
          <span className="text-line-strong" aria-hidden>
            •
          </span>
          <span>
            Ordenado por: <strong className="text-ink-soft">Prazo mais próximo</strong>
          </span>
        </div>
        {temFiltroAtivo && (
          <button
            onClick={() => setFiltros(FILTROS_VAZIOS)}
            className="font-semibold text-brand hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {mostrarAvisoLimite && (
        <p className="legenda">
          Mostrando os primeiros {LIMITE_VISAO} de {total}. Estreite os filtros
          para ver o restante.
        </p>
      )}

      {visao === "quadro" ? (
        <QuadroDePedidos pedidos={itens} />
      ) : visao === "calendario" ? (
        <CalendarioDePrazos pedidos={itens} referencia={mes} aoMudarMes={setMes} />
      ) : visao === "tabela" ? (
        <TabelaDePedidos pedidos={itens} />
      ) : (
        <ListaDePedidos pedidos={itens} vazio="Nenhum pedido com esses filtros." />
      )}

      {visao === "lista" && paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            className="botao-secundario"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="text-sm text-ink-muted">
            Página {pagina} de {paginas}
          </span>
          <button
            className="botao-secundario"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-line pt-4 text-xs text-ink-faint sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-soft">GovTask Cloud</span>
          <span className="text-line-strong" aria-hidden>
            •
          </span>
          <span>Gabinete Digital</span>
        </div>
        <span>Atualização automática em tempo real</span>
      </footer>
    </div>
  );
}

function Selecao({
  rotulo,
  valor,
  aoMudar,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: Record<string, string>;
}) {
  return (
    <select
      className="campo cursor-pointer"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      aria-label={rotulo}
    >
      <option value="">{rotulo}: todos</option>
      {Object.entries(opcoes).map(([codigo, texto]) => (
        <option key={codigo} value={codigo}>
          {texto}
        </option>
      ))}
    </select>
  );
}

const TOM_TOGGLE = {
  neutro: "border-line bg-canvas/60 text-ink-soft hover:border-line-strong hover:bg-paper",
  marca: "border-brand-200 bg-brand-50 text-brand-800",
  alerta: "border-estado-atrasado/30 bg-estado-atrasado/5 text-estado-atrasado",
  brass: "border-brass/30 bg-brass-50 text-brass-700",
} as const;

const TOM_CHECK = {
  neutro: "text-brand focus:ring-brand",
  marca: "text-brand focus:ring-brand",
  alerta: "text-estado-atrasado focus:ring-estado-atrasado",
  brass: "text-brass focus:ring-brass",
} as const;

function Toggle({
  rotulo,
  titulo,
  marcado,
  aoMudar,
  tom = "neutro",
}: {
  rotulo: string;
  titulo?: string;
  marcado: boolean;
  aoMudar: (v: boolean) => void;
  tom?: keyof typeof TOM_TOGGLE;
}) {
  return (
    <label
      title={titulo}
      className={clsx(
        "inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 font-medium transition-colors",
        TOM_TOGGLE[tom]
      )}
    >
      <input
        type="checkbox"
        className={clsx("h-4 w-4 rounded border-line focus:ring-offset-0", TOM_CHECK[tom])}
        checked={marcado}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      {rotulo}
    </label>
  );
}
