"use client";

/**
 * Minha fila — a tela do departamento.
 *
 * O que chegou para o setor (e ainda não tem dono), o que é meu, o que vence
 * hoje. Um toque em "Assumir" pega a tarefa sem abrir a tela do pedido.
 */

import clsx from "clsx";
import {
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  FileSpreadsheet,
  Flag,
  Hand,
  History,
  Inbox,
  Plus,
  RefreshCw,
  UserRound,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { EsqueletoPainel, Vazio } from "@/components/painel/Blocos";
import { api, type MeuSetor, type PedidoLinha } from "@/lib/api";
import {
  ROTULO_PRIORIDADE,
  ROTULO_TIPO,
  moeda,
  moedaCurta,
  relativo,
  situacaoDoPrazo,
} from "@/lib/formato";
import { useSessao } from "@/lib/sessao";
import { useAoMudar } from "@/lib/tempoReal";

type Filtro = "todas" | "sem_dono" | "comigo" | "vencendo" | "atrasadas" | "urgentes";
type Tom = "marca" | "brass" | "info" | "alerta" | "ok" | "neutro";

const TOM_CARTAO: Record<
  Tom,
  { icone: string; badge: string; valor: string; borda: string; barra: string }
> = {
  marca: {
    icone: "bg-brand text-white shadow-sm shadow-brand/30",
    badge: "bg-brand-50 text-brand",
    valor: "text-ink",
    borda: "border-brand ring-2 ring-brand/15",
    barra: "bg-brand",
  },
  brass: {
    icone: "bg-brass text-white shadow-sm shadow-brass/30",
    badge: "bg-brass-50 text-brass-700",
    valor: "text-ink",
    borda: "border-brass ring-2 ring-brass/15",
    barra: "bg-brass",
  },
  info: {
    icone: "bg-estado-info text-white shadow-sm shadow-estado-info/30",
    badge: "bg-estado-info/10 text-estado-info",
    valor: "text-ink",
    borda: "border-estado-info ring-2 ring-estado-info/15",
    barra: "bg-estado-info",
  },
  alerta: {
    icone: "bg-estado-atrasado text-white shadow-sm shadow-estado-atrasado/30",
    badge: "bg-estado-atrasado/10 text-estado-atrasado",
    valor: "text-estado-atrasado",
    borda: "border-estado-atrasado ring-2 ring-estado-atrasado/15",
    barra: "bg-estado-atrasado",
  },
  ok: {
    icone: "bg-estado-concluido/15 text-estado-concluido",
    badge: "bg-estado-concluido/10 text-estado-concluido",
    valor: "text-estado-concluido",
    borda: "border-estado-concluido ring-2 ring-estado-concluido/15",
    barra: "bg-estado-concluido",
  },
  neutro: {
    icone: "bg-ink/[.06] text-ink-muted",
    badge: "bg-ink/[.05] text-ink-muted",
    valor: "text-ink",
    borda: "border-line-strong ring-2 ring-line-strong/20",
    barra: "bg-line-strong",
  },
};

const TOM_PRAZO: Record<string, string> = {
  atrasado: "border-estado-atrasado/20 bg-estado-atrasado/10 text-estado-atrasado",
  hoje: "border-estado-atrasado/20 bg-estado-atrasado/10 text-estado-atrasado",
  proximo: "border-brass/25 bg-brass-50 text-brass-700",
  tranquilo: "border-line bg-ink/[.04] text-ink-soft",
  sem: "border-line bg-ink/[.04] text-ink-muted",
};

const TOM_PRAZO_PONTO: Record<string, string> = {
  atrasado: "animate-pulse bg-estado-atrasado",
  hoje: "animate-pulse bg-estado-atrasado",
  proximo: "animate-pulse bg-brass",
  tranquilo: "bg-ink-faint",
  sem: "bg-ink-faint",
};

const TOM_PRIORIDADE: Record<string, string> = {
  URGENTE: "border-estado-atrasado/30 bg-estado-atrasado/10 text-estado-atrasado",
  ALTA: "border-brass/30 bg-brass-50 text-brass-700",
  NORMAL: "border-line bg-ink/[.04] text-ink-muted",
};

export function MinhaFila() {
  const { eu } = useSessao();
  const router = useRouter();
  const [dados, setDados] = useState<MeuSetor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [assumindo, setAssumindo] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.meuSetor());
      setAtualizadoEm(new Date().toISOString());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useAoMudar((pedidos) => {
    const chegou = pedidos.filter((p) => p.situacao === "EM_SETOR" && p.setor_atual === eu?.setor);
    if (chegou.length) toast(`Nova movimentação no seu setor (${chegou.map((p) => p.numero).join(", ")})`, { icon: "📥" });
    carregar();
  });

  async function assumir(p: PedidoLinha) {
    setAssumindo(p.id);
    try {
      const completo = await api.obter(p.id);
      const enc = completo.encaminhamento_atual;
      if (!enc) throw new Error("Esta tarefa não está mais aberta.");
      await api.assumir(p.id, enc.id);
      toast.success("Tarefa assumida. Ela é sua agora.");
      router.push(`/pedidos/${p.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      carregar();
    } finally {
      setAssumindo(null);
    }
  }

  async function exportar() {
    if (!dados?.setor) return;
    try {
      await api.baixarListaXlsx({ setor: dados.setor.codigo });
      toast.success("Relatório do setor gerado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copiar(numero: string) {
    navigator.clipboard?.writeText(numero).then(
      () => toast.success(`Protocolo ${numero} copiado.`),
      () => toast.error("Não foi possível copiar o protocolo.")
    );
  }

  if (erro && !dados) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!dados) return <EsqueletoPainel />;

  if (!dados.setor) {
    return (
      <div className="animate-fade-subir cartao mx-auto mt-10 max-w-lg p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brass-50 text-brass-700">
          <ClipboardList size={22} aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">Você ainda não está num setor</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Peça ao administrador do módulo para lotar o seu usuário num setor. A partir daí, as
          tarefas do departamento aparecem aqui.
        </p>
      </div>
    );
  }

  const vencendo = (t: PedidoLinha) => {
    const tom = situacaoDoPrazo(t.prazo_atual, t.dias_de_atraso).tom;
    return tom === "hoje" || tom === "proximo";
  };
  const urgente = (t: PedidoLinha) =>
    t.dias_de_atraso > 0 || t.prioridade === "URGENTE" || vencendo(t);

  const contagem = {
    todas: dados.tarefas.length,
    sem_dono: dados.tarefas.filter((t) => !t.responsavel_atual).length,
    comigo: dados.tarefas.filter((t) => t.responsavel_atual?.id === eu?.id).length,
    vencendo: dados.tarefas.filter(vencendo).length,
    atrasadas: dados.tarefas.filter((t) => t.dias_de_atraso > 0).length,
    urgentes: dados.tarefas.filter(urgente).length,
  };

  const tarefas = dados.tarefas.filter((t) => {
    if (filtro === "sem_dono") return !t.responsavel_atual;
    if (filtro === "comigo") return t.responsavel_atual?.id === eu?.id;
    if (filtro === "vencendo") return vencendo(t);
    if (filtro === "atrasadas") return t.dias_de_atraso > 0;
    if (filtro === "urgentes") return urgente(t);
    return true;
  });

  const CARTOES: {
    chave: Filtro;
    rotulo: string;
    icone: LucideIcon;
    tom: Tom;
    badge: string;
    detalhe: string;
  }[] = [
    {
      chave: "todas",
      rotulo: "Na fila do setor",
      icone: Inbox,
      tom: "marca",
      badge: "Ativo",
      detalhe: contagem.sem_dono ? "Há triagem pendente" : "Tudo distribuído",
    },
    {
      chave: "sem_dono",
      rotulo: "Sem dono",
      icone: UserRoundX,
      tom: contagem.sem_dono ? "brass" : "neutro",
      badge: contagem.sem_dono ? "Pendente" : "Ok",
      detalhe: contagem.sem_dono ? "Triagem pendente" : "Nada pendente",
    },
    {
      chave: "comigo",
      rotulo: "Comigo",
      icone: UserRound,
      tom: "info",
      badge: contagem.comigo ? "Em curso" : "Livre",
      detalhe: contagem.comigo ? "Em execução" : "Capacidade livre",
    },
    {
      chave: "vencendo",
      rotulo: "Vencendo em 3 dias",
      icone: AlarmClock,
      tom: contagem.vencendo ? "brass" : "neutro",
      badge: contagem.vencendo ? "Atenção" : "Ok",
      detalhe: contagem.vencendo ? "Dentro do prazo" : "Nada no radar",
    },
    {
      chave: "atrasadas",
      rotulo: "Atrasadas",
      icone: contagem.atrasadas ? AlertTriangle : CheckCircle2,
      tom: contagem.atrasadas ? "alerta" : "ok",
      badge: contagem.atrasadas ? "Crítico" : "Zero",
      detalhe: contagem.atrasadas ? "Ação necessária" : "Excelente",
    },
  ];

  const ABAS: { chave: Filtro; rotulo: string }[] = [
    { chave: "todas", rotulo: "Todas" },
    { chave: "sem_dono", rotulo: "Sem dono" },
    { chave: "urgentes", rotulo: "Urgentes" },
  ];

  const resumoSemDono = contagem.sem_dono
    ? `${contagem.sem_dono} ${contagem.sem_dono === 1 ? "tarefa esperando" : "tarefas esperando"} alguém assumir`
    : "Nenhuma tarefa sem dono";
  const resumoAtraso = contagem.atrasadas
    ? `${contagem.atrasadas} ${contagem.atrasadas === 1 ? "atrasada" : "atrasadas"}`
    : "nada atrasado";

  return (
    <div className="animate-fade-subir space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-brass/30 bg-brass-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-brass-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brass" />
              Departamento
            </span>
            <span className="font-mono text-xs text-ink-faint">{dados.setor.codigo}</span>
          </div>
          <h1 className="mt-1.5 flex flex-wrap items-center gap-3 font-display text-[26px] font-medium leading-tight text-ink sm:text-3xl">
            {dados.setor.nome}
            <span className="inline-flex items-center rounded-pill border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand">
              Fila ativa
            </span>
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span className="font-semibold text-ink-soft">{resumoSemDono}</span>
            <span className="text-line-strong">·</span>
            <span
              className={clsx(
                "font-semibold",
                contagem.atrasadas ? "text-estado-atrasado" : "text-estado-concluido"
              )}
            >
              {resumoAtraso}
            </span>
            <span className="text-line-strong">·</span>
            <span>Atualizado {atualizadoEm ? relativo(atualizadoEm) : "agora"}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <button onClick={exportar} className="botao-secundario">
            <FileSpreadsheet size={15} aria-hidden />
            Relatório
          </button>
          {eu?.pode_criar && (
            <Link href="/pedidos/novo" className="botao-primario">
              <Plus size={15} aria-hidden />
              Nova demanda
            </Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {CARTOES.map(({ chave, rotulo, icone: Icone, tom, badge, detalhe }) => {
          const ativo = filtro === chave;
          const t = TOM_CARTAO[tom];
          return (
            <button
              key={chave}
              onClick={() => setFiltro(chave)}
              aria-pressed={ativo}
              className={clsx(
                "cartao group relative overflow-hidden p-3.5 text-left transition hover:border-line-strong hover:shadow-pop",
                ativo && t.borda
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", t.icone)}>
                  <Icone size={19} aria-hidden />
                </span>
                <span className={clsx("rounded-md px-1.5 py-0.5 text-[10px] font-bold", t.badge)}>
                  {badge}
                </span>
              </div>
              <p className={clsx("mt-3 font-display text-2xl font-medium leading-none tabular-nums", t.valor)}>
                {contagem[chave]}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-ink-soft">{rotulo}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">{detalhe}</p>
              {ativo && <span className={clsx("absolute inset-x-0 bottom-0 h-0.5", t.barra)} />}
            </button>
          );
        })}
      </div>

      <section className="cartao overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-canvas/40 px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-[17px] font-medium text-ink">
              Tarefas do departamento
              <span className="rounded-pill border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand">
                {tarefas.length} {tarefas.length === 1 ? "tarefa" : "tarefas"}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">Prazo mais próximo primeiro</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-btn bg-ink/[.05] p-1 text-xs font-medium text-ink-muted">
              {ABAS.map((a) => (
                <button
                  key={a.chave}
                  onClick={() => setFiltro(a.chave)}
                  aria-pressed={filtro === a.chave}
                  className={clsx(
                    "rounded-[7px] px-3 py-1 transition",
                    filtro === a.chave ? "bg-paper font-semibold text-ink shadow-card" : "hover:text-ink"
                  )}
                >
                  {a.rotulo} ({contagem[a.chave]})
                </button>
              ))}
            </div>
            <Link
              href="/pedidos"
              className="inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-50"
            >
              <History size={14} aria-hidden />
              Histórico do setor
            </Link>
          </div>
        </div>

        {tarefas.length === 0 ? (
          <Vazio texto="Nenhuma tarefa aqui." />
        ) : (
          <ul className="divide-y divide-line">
            {tarefas.map((t) => {
              const prazo = situacaoDoPrazo(t.prazo_atual, t.dias_de_atraso);
              const chegou = relativo(t.situacao_desde ?? t.ultima_movimentacao_em);
              const temValor = Number(t.valor_previsto) > 0;
              const meu = t.responsavel_atual?.id === eu?.id;
              return (
                <li
                  key={t.id}
                  className={clsx(
                    "flex flex-col gap-4 border-l-2 px-4 py-4 transition hover:bg-canvas/50 sm:px-5 xl:flex-row xl:items-center xl:justify-between",
                    !t.responsavel_atual ? "border-l-brass" : "border-l-transparent hover:border-l-brand"
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => copiar(t.numero)}
                        title="Copiar protocolo"
                        className="numero inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-0.5 transition hover:border-line-strong hover:text-ink"
                      >
                        <Copy size={11} aria-hidden />
                        {t.numero}
                      </button>
                      <span className="inline-flex items-center rounded-md border border-brand-200/60 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        {ROTULO_TIPO[t.tipo] ?? t.tipo}
                      </span>
                      {chegou && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                          {chegou === "agora" ? "chegou agora" : `chegou há ${chegou}`}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <Link
                        href={`/pedidos/${t.id}`}
                        className="block truncate text-[15px] font-semibold text-ink transition hover:text-brand"
                      >
                        {t.titulo}
                      </Link>
                      {t.tarefa_atual && (
                        <p className="mt-0.5 truncate text-xs text-ink-muted">{t.tarefa_atual}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      {temValor && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-brass/30 bg-brass-50 px-2 py-0.5 font-mono font-semibold text-brass-700">
                          {moeda(t.valor_previsto)}
                          <span className="font-sans font-normal text-brass-700/70">
                            ({moedaCurta(t.valor_previsto)})
                          </span>
                        </span>
                      )}
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold",
                          TOM_PRIORIDADE[t.prioridade] ?? TOM_PRIORIDADE.NORMAL
                        )}
                      >
                        <Flag size={11} aria-hidden />
                        {ROTULO_PRIORIDADE[t.prioridade] ?? t.prioridade}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 xl:border-t-0 xl:pt-0">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold",
                        TOM_PRAZO[prazo.tom]
                      )}
                    >
                      <span className={clsx("h-2 w-2 rounded-full", TOM_PRAZO_PONTO[prazo.tom])} />
                      <Clock size={13} aria-hidden />
                      {prazo.texto}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-soft">
                      {t.responsavel_atual ? (
                        <UserRound size={13} aria-hidden />
                      ) : (
                        <UserRoundX size={13} aria-hidden />
                      )}
                      {t.responsavel_atual
                        ? meu
                          ? "Comigo"
                          : t.responsavel_atual.name.split(" ")[0]
                        : "Sem dono"}
                    </span>
                    {!t.responsavel_atual && eu?.pode_trabalhar ? (
                      <button
                        onClick={() => assumir(t)}
                        disabled={assumindo === t.id}
                        className="botao-primario"
                      >
                        {assumindo === t.id ? (
                          <Clock size={15} className="animate-spin" aria-hidden />
                        ) : (
                          <Hand size={15} aria-hidden />
                        )}
                        Assumir e abrir
                      </button>
                    ) : (
                      <Link href={`/pedidos/${t.id}`} className="botao-secundario">
                        Abrir
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-line bg-canvas/40 px-4 py-3 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="flex items-center gap-2">
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                tarefas.length ? "bg-estado-concluido" : "bg-line-strong"
              )}
            />
            {tarefas.length === 0
              ? "Nenhum chamado nesta visão."
              : `Você visualizou ${tarefas.length} ${tarefas.length === 1 ? "chamado prioritário" : "chamados prioritários"} deste setor.`}
          </span>
          <span className="flex items-center gap-3">
            <button
              onClick={carregar}
              className="inline-flex items-center gap-1.5 font-medium transition hover:text-brand"
            >
              <RefreshCw size={13} aria-hidden />
              Atualizar fila
            </button>
            {eu?.pode_gerir_usuarios && (
              <>
                <span className="text-line-strong">·</span>
                <Link href="/configuracoes" className="font-medium transition hover:text-brand">
                  Configurações de triagem
                </Link>
              </>
            )}
          </span>
        </div>
      </section>
    </div>
  );
}
