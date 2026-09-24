"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  FileSpreadsheet,
  FileText,
  Hourglass,
  MapPin,
  PauseCircle,
  Pencil,
  Send,
  UserRound,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { EtiquetaSaude, EtiquetaSituacao, EtiquetaTipo } from "@/components/Etiquetas";
import { Markdown } from "@/components/Markdown";
import { api, type Eu, type MotivoParada, type Pedido, type ProximaAcao } from "@/lib/api";
import {
  ROTULO_MOTIVO_PARADA,
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  data,
  dataHora,
  moeda,
  ondeEsta,
} from "@/lib/formato";
import { useNomeSetor } from "@/lib/setores";
import { BaseModal } from "./Modais";

// ── Cabeçalho ────────────────────────────────────────────────────────────

/**
 * O topo da tela do pedido responde às três perguntas do Prefeito antes de
 * qualquer aba: onde está, há quanto tempo e por quê. Abaixo, a trilha do
 * vai e vem — cada passagem por um setor, na ordem em que aconteceu.
 */
export function Cabecalho({
  pedido,
  eu,
  limite,
  aoAtualizar,
  aoDespachar,
}: {
  pedido: Pedido;
  eu: Eu | null;
  limite: number;
  aoAtualizar: (p: Pedido) => void;
  aoDespachar?: () => void;
}) {
  const nomeSetor = useNomeSetor();
  const [modalParada, setModalParada] = useState(false);
  const encerrado = pedido.situacao === "CONCLUIDO" || pedido.situacao === "CANCELADO";
  const podeParada = !encerrado && Boolean(eu?.pode_encaminhar || eu?.pode_trabalhar);
  const critico = pedido.dias_na_situacao >= limite;
  const onde = ondeEsta(pedido.situacao, pedido.setor_atual, nomeSetor);
  const valorPrevisto = Number(pedido.valor_previsto);
  const valorPago = Number(pedido.valor_pago);
  const valorLiberado = Number(pedido.valor_liberado);

  return (
    <>
      {/* ── Hero navy ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-card border border-brand-800 text-white shadow-pop">
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
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px]"
          aria-hidden
        />

        <div className="relative z-10 p-5 sm:p-6">
          {/* Barra de ações */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-brand-100/70">
              <span className="font-bold text-brand-200">GovTask</span>
              <span className="text-white/20" aria-hidden>
                •
              </span>
              <span>Gabinete Digital</span>
              <span className="text-white/20" aria-hidden>
                •
              </span>
              <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-white/80">
                Dossiê &amp; Tramitação
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/pedidos"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                <ArrowLeft size={15} aria-hidden />
                Voltar para Pedidos
              </Link>
              <button
                onClick={() =>
                  api.baixarPedidoXlsx(pedido.id, pedido.numero).catch((e) => toast.error(e.message))
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                <FileSpreadsheet size={15} className="text-estado-concluido" aria-hidden />
                Excel
              </button>
              <Link
                href={`/pedidos/${pedido.id}/relatorio`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                <FileText size={15} className="text-estado-atrasado" aria-hidden />
                Relatório PDF
              </Link>
              {aoDespachar && (
                <button
                  onClick={aoDespachar}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200/30 bg-brand px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-brand/30 transition hover:bg-brand-600"
                >
                  <Send size={15} aria-hidden />
                  Despachar agora
                </button>
              )}
            </div>
          </div>

          {/* Identidade + valor */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-brand-200/30 bg-brand-900/80 px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-brand-200">
                  #{pedido.numero}
                </span>
                <EtiquetaSituacao situacao={pedido.situacao} />
                <EtiquetaTipo tipo={pedido.tipo} />
                {pedido.prioridade !== "NORMAL" && (
                  <span
                    className={
                      pedido.prioridade === "URGENTE"
                        ? "etiqueta bg-estado-atrasado/20 text-red-200"
                        : "etiqueta bg-brass/20 text-amber-200"
                    }
                  >
                    {ROTULO_PRIORIDADE[pedido.prioridade]}
                  </span>
                )}
                <EtiquetaSaude saude={pedido.saude} motivo={pedido.saude_motivo} />
              </div>

              <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
                {pedido.titulo}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound size={15} className="text-slate-400" aria-hidden />
                  Origem:{" "}
                  <strong className="font-semibold text-white">
                    {ROTULO_ORIGEM[pedido.origem] ?? pedido.origem}
                  </strong>
                </span>
                {pedido.origem_nome && (
                  <>
                    <span className="text-white/20" aria-hidden>
                      •
                    </span>
                    <span className="font-semibold text-brand-200">{pedido.origem_nome}</span>
                  </>
                )}
                <span className="text-white/20" aria-hidden>
                  •
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <CalendarDays size={15} aria-hidden />
                  Aberto em {dataHora(pedido.created_at)}
                </span>
                {pedido.emenda && (
                  <>
                    <span className="text-white/20" aria-hidden>
                      •
                    </span>
                    <span>Emenda {pedido.emenda}</span>
                  </>
                )}
              </div>
            </div>

            {/* Painel de valor */}
            <div className="relative min-w-[240px] overflow-hidden rounded-xl border border-white/10 bg-white/[.04] p-4">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
                <span>Valor previsto</span>
                <Zap size={15} className="text-brand-200" aria-hidden />
              </div>
              <div className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {valorPrevisto > 0 ? moeda(pedido.valor_previsto) : "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px]">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                  <BadgeCheck size={14} aria-hidden />
                  {valorPrevisto > 0 ? "Previsão registrada" : "Sem valor informado"}
                </span>
                <span className="font-mono text-slate-400">
                  {valorPago > 0
                    ? `Pago: ${moeda(pedido.valor_pago)}`
                    : valorLiberado > 0
                      ? `Liberado: ${moeda(pedido.valor_liberado)}`
                      : "Sem execução"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Cards operacionais ────────────────────────────────────── */}
      {!encerrado && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="cartao flex items-start gap-3.5 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-100 bg-brand-50 text-brand">
              <MapPin size={22} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <span className="sobretitulo">Onde está</span>
              <p className="truncate font-display text-base font-semibold text-ink">{onde}</p>
              <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                {pedido.responsavel_atual
                  ? `com ${pedido.responsavel_atual.name}`
                  : pedido.situacao === "EM_SETOR"
                    ? "Ninguém assumiu ainda"
                    : pedido.tarefa_atual || "Aguardando decisão"}
              </p>
            </div>
          </div>

          <div className="cartao flex items-start gap-3.5 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brass/20 bg-brass-50 text-brass-700">
              <Hourglass size={22} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <span className="sobretitulo">Há quanto tempo</span>
              <p
                className={clsx(
                  "font-display text-base font-semibold",
                  critico ? "text-estado-atrasado" : "text-ink"
                )}
              >
                {pedido.dias_na_situacao}{" "}
                <span className="text-xs font-normal text-ink-muted">
                  {pedido.dias_na_situacao === 1 ? "dia" : "dias"}
                </span>
              </p>
              <p className="truncate text-xs text-ink-muted">
                {pedido.situacao_desde ? `desde ${dataHora(pedido.situacao_desde)}` : ""}
                {pedido.prazo_atual && (
                  <>
                    {" · "}
                    <span
                      className={
                        pedido.dias_de_atraso > 0 ? "font-semibold text-estado-atrasado" : ""
                      }
                    >
                      {pedido.dias_de_atraso > 0
                        ? `${pedido.dias_de_atraso}d além do prazo`
                        : `prazo ${data(pedido.prazo_atual)}`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="cartao flex items-start gap-3.5 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-estado-info/20 bg-estado-info/10 text-estado-info">
              <PauseCircle size={22} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <span className="sobretitulo">Por quê</span>
              {pedido.motivo_parada ? (
                <>
                  <p className="truncate font-display text-base font-semibold text-estado-info">
                    {ROTULO_MOTIVO_PARADA[pedido.motivo_parada]}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {pedido.motivo_parada_texto || "Motivo registrado"}
                  </p>
                </>
              ) : (
                <p className="truncate text-sm text-ink-muted">
                  {pedido.tarefa_atual
                    ? `Em execução: ${pedido.tarefa_atual}`
                    : "Nenhum motivo de parada registrado."}
                </p>
              )}
              {podeParada && (
                <button
                  onClick={() => setModalParada(true)}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  <Pencil size={12} aria-hidden />
                  {pedido.motivo_parada ? "Alterar motivo" : "Informar motivo da parada"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Trilha pedido={pedido} />

      {(pedido.complemento_pendente ||
        (pedido.saude_motivos.length > 0 && !encerrado) ||
        pedido.motivo_cancelamento) && (
        <div className="space-y-2">
          {pedido.complemento_pendente && (
            <p className="rounded-btn bg-brass-50 px-3 py-2 text-sm text-brass-700">
              O setor pediu mais informação. Veja a aba Tramitação para responder.
            </p>
          )}
          {pedido.saude_motivos.length > 0 && !encerrado && (
            <ul
              className={
                pedido.saude === "CRITICA"
                  ? "space-y-1 rounded-btn bg-estado-atrasado/10 px-3 py-2 text-sm text-estado-atrasado"
                  : "space-y-1 rounded-btn bg-brass-50/60 px-3 py-2 text-sm text-brass-700"
              }
            >
              {pedido.saude_motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          )}
          {pedido.motivo_cancelamento && (
            <p className="rounded-btn bg-estado-atrasado/10 px-3 py-2 text-sm text-estado-atrasado">
              Cancelado: {pedido.motivo_cancelamento}
            </p>
          )}
        </div>
      )}

      {pedido.proxima_acao_detalhe && !encerrado && (
        <ProximaAcaoCartao acao={pedido.proxima_acao_detalhe} />
      )}

      {modalParada && (
        <ModalParada
          pedido={pedido}
          aoFechar={() => setModalParada(false)}
          aoSalvar={(p) => {
            aoAtualizar(p);
            setModalParada(false);
          }}
        />
      )}
    </>
  );
}

/** Assessor → Jurídico → Assessor → Contabilidade…: o vai e vem em uma linha. */
function Trilha({ pedido }: { pedido: Pedido }) {
  const nomeSetor = useNomeSetor();
  if (pedido.encaminhamentos.length === 0) return null;
  const encerrado = pedido.situacao === "CONCLUIDO" || pedido.situacao === "CANCELADO";
  const passos: { rotulo: string; detalhe: string; estado: "feito" | "atual" | "base" }[] = [
    { rotulo: "Assessor", detalhe: "abertura", estado: "base" },
  ];
  for (const e of [...pedido.encaminhamentos].sort((a, b) => a.ordem - b.ordem)) {
    const atual = ["AGUARDANDO", "EM_EXECUCAO", "AGUARDANDO_COMPLEMENTO"].includes(e.status);
    passos.push({
      rotulo: nomeSetor(e.setor),
      detalhe: e.assunto,
      estado: atual ? "atual" : "feito",
    });
    if (!atual && e.status === "CONCLUIDO") {
      passos.push({ rotulo: "Assessor", detalhe: "devolvido", estado: "base" });
    }
  }
  if (pedido.situacao === "AGUARDANDO_TERCEIRO") {
    passos.push({ rotulo: "Governo", detalhe: "aguardando retorno", estado: "atual" });
  } else if (pedido.situacao === "COM_ASSESSOR" && passos[passos.length - 1].estado === "base") {
    passos[passos.length - 1].estado = "atual";
  }
  if (encerrado) {
    passos.push({
      rotulo: pedido.situacao === "CONCLUIDO" ? "Concluído" : "Cancelado",
      detalhe: pedido.concluido_em ? data(pedido.concluido_em) : "",
      estado: "feito",
    });
  }

  const feitos = passos.filter((p) => p.estado === "feito").length;

  return (
    <section className="cartao p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand">
            <Zap size={16} aria-hidden />
          </span>
          <h2 className="sobretitulo text-ink">Caminho percorrido</h2>
          <span className="rounded-pill bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
            {passos.length} etapa{passos.length === 1 ? "" : "s"} registrada
            {passos.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
            {feitos} concluída{feitos === 1 ? "" : "s"}
          </span>
          <span className="text-line-strong" aria-hidden>
            •
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brass" aria-hidden />1 em execução
          </span>
        </div>
      </div>

      <ol className="rolagem-fina flex items-start overflow-x-auto pb-1">
        {passos.map((p, i) => (
          <li key={i} className="flex shrink-0 items-start">
            {i > 0 && (
              <span
                className={clsx(
                  "mt-3.5 h-0.5 w-6 shrink-0 rounded",
                  p.estado === "feito" ? "bg-brand/50" : "bg-line-strong"
                )}
                aria-hidden
              />
            )}
            <div className="flex w-[5.5rem] shrink-0 flex-col items-center px-1 text-center" title={p.detalhe}>
              <span
                className={clsx(
                  "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                  p.estado === "atual"
                    ? "bg-brass text-white ring-4 ring-brass/20"
                    : p.estado === "feito"
                      ? "bg-brand text-white"
                      : "border border-dashed border-line-strong text-ink-faint"
                )}
              >
                {p.estado === "feito" ? <Check size={14} aria-hidden /> : i + 1}
              </span>
              <span
                className={clsx(
                  "mt-1 w-full truncate text-[11px] font-bold",
                  p.estado === "atual" ? "text-brass-700" : "text-ink-soft"
                )}
              >
                {p.rotulo}
              </span>
              <span className="w-full truncate text-[10px] text-ink-faint">{p.detalhe}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const MOTIVOS: MotivoParada[] = ["DOCUMENTO", "GOVERNO", "ASSINATURA", "LICITACAO", "RECURSO", "OUTRO"];

function ModalParada({
  pedido,
  aoFechar,
  aoSalvar,
}: {
  pedido: Pedido;
  aoFechar: () => void;
  aoSalvar: (p: Pedido) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoParada | null>(pedido.motivo_parada);
  const [texto, setTexto] = useState(pedido.motivo_parada_texto ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function salvar(m: MotivoParada | null) {
    setOcupado(true);
    try {
      const p = await api.definirParada(pedido.id, m, texto.trim() || undefined);
      toast.success(m ? "Motivo registrado. O Prefeito já vê." : "Motivo retirado.");
      aoSalvar(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <BaseModal
      titulo="Por que está parado?"
      aoFechar={aoFechar}
      aoConfirmar={() => salvar(motivo)}
      confirmar="Registrar"
      ocupado={ocupado}
      desabilitado={!motivo}
    >
      <p className="text-sm text-ink-muted">
        O motivo aparece para o Prefeito no painel e fica no histórico. Some sozinho quando o
        pedido andar.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={
              motivo === m
                ? "rounded-btn border border-brand bg-brand-50 px-3 py-2.5 text-left text-sm font-medium text-brand"
                : "rounded-btn border border-line px-3 py-2.5 text-left text-sm text-ink-soft hover:border-line-strong"
            }
          >
            {ROTULO_MOTIVO_PARADA[m]}
          </button>
        ))}
      </div>
      <div>
        <label className="rotulo" htmlFor="texto-parada">
          Detalhe (opcional)
        </label>
        <textarea
          id="texto-parada"
          className="campo min-h-[80px]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: aguardando a certidão da Receita Federal"
          maxLength={2000}
        />
      </div>
      {pedido.motivo_parada && (
        <button
          type="button"
          onClick={() => salvar(null)}
          className="text-xs font-medium text-estado-atrasado hover:underline"
          disabled={ocupado}
        >
          Retirar o motivo atual
        </button>
      )}
    </BaseModal>
  );
}

export function ProximaAcaoCartao({ acao }: { acao: ProximaAcao }) {
  const nomeSetor = useNomeSetor();
  const detalhes = [
    acao.setor ? `Setor: ${nomeSetor(acao.setor)}` : null,
    acao.responsavel ? `Responsável: ${acao.responsavel.name}` : null,
    acao.prazo ? `Prazo: ${data(acao.prazo)}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 via-canvas to-brass-50/60 p-4 shadow-card">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-sm">
            <Zap size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand">
              Próxima ação prioritária
            </span>
            <p className="truncate font-display text-base font-semibold text-ink">{acao.titulo}</p>
            {detalhes.length > 0 && (
              <p className="truncate text-xs text-ink-muted">{detalhes.join(" · ")}</p>
            )}
          </div>
        </div>
        {acao.bloqueada && acao.motivo_bloqueio && (
          <span className="rounded-pill bg-estado-atrasado/10 px-3 py-1 text-xs font-medium text-estado-atrasado">
            {acao.motivo_bloqueio}
          </span>
        )}
      </div>
      {acao.descricao && (
        <Markdown texto={acao.descricao} className="space-y-1.5 text-sm text-ink-soft" />
      )}
    </div>
  );
}
