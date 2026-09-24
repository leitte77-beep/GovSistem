"use client";

/**
 * Tramitação: o vai e vem, uma tarefa por cartão.
 *
 * A tarefa atual abre inteira: o que foi pedido, o checklist de entregas,
 * a conversa entre o Assessor e o setor (com anexos e @menções) e, para
 * quem executa, a resposta em construção — salva sozinha — que vira o
 * resultado ao devolver. Tarefas passadas ficam recolhidas numa linha.
 */

import clsx from "clsx";
import {
  ArrowRight,
  AtSign,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  CornerUpLeft,
  FileText,
  Hand,
  Landmark,
  MessageCircleQuestion,
  MoreHorizontal,
  Paperclip,
  Play,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { EditorDetalhes } from "@/components/EditorDetalhes";
import { EtiquetaPrazo } from "@/components/Etiquetas";
import { Markdown } from "@/components/Markdown";
import {
  api,
  type Andamento,
  type Encaminhamento,
  type Eu,
  type Pedido,
  type UsuarioResumo,
} from "@/lib/api";
import { ROTULO_ENCAMINHAMENTO, data, entre, hora, relativo, rotuloDia } from "@/lib/formato";
import { iniciais } from "@/lib/sessao";
import { useNomeSetor } from "@/lib/setores";

import { ModalEncaminhar } from "./Encaminhar";
import { EnvioDeArquivos } from "./Envio";
import { ModalPessoa, ModalPrazo, ModalTexto } from "./Modais";
import { useVisualizador } from "./Visualizador";

type Modal =
  | "encaminhar"
  | "complemento"
  | "prazo"
  | "transferir"
  | "mencionar"
  | "terceiro"
  | "cancelar"
  | null;

const ATIVOS = ["AGUARDANDO", "EM_EXECUCAO", "AGUARDANDO_COMPLEMENTO"];

// ── Aba ─────────────────────────────────────────────────────────────────

export function AbaTramitacao({
  pedido,
  eu,
  usuarios,
  aoAtualizar,
}: {
  pedido: Pedido;
  eu: Eu | null;
  usuarios: UsuarioResumo[];
  aoAtualizar: (p: Pedido) => void;
}) {
  const nomeSetor = useNomeSetor();
  const [modal, setModal] = useState<Modal>(null);
  const encerrado = pedido.situacao === "CONCLUIDO" || pedido.situacao === "CANCELADO";
  const souAssessor = Boolean(eu?.pode_encaminhar);
  const enc = pedido.encaminhamento_atual;
  const ordenados = [...pedido.encaminhamentos].sort((a, b) => b.ordem - a.ordem);

  // Barra de ação do celular: abre o encaminhar, rola até a resposta ou assume.
  useEffect(() => {
    async function ouvir(e: Event) {
      const qual = (e as CustomEvent).detail;
      if (qual === "encaminhar") setModal("encaminhar");
      if (qual === "responder") document.getElementById("resposta-do-setor")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (qual === "assumir" && enc) {
        try {
          aoAtualizar(await api.assumir(pedido.id, enc.id));
          toast.success("Tarefa assumida. Ela é sua agora.");
        } catch (err) {
          toast.error((err as Error).message);
        }
      }
    }
    window.addEventListener("govtask:acao", ouvir);
    return () => window.removeEventListener("govtask:acao", ouvir);
  }, [enc, pedido.id, aoAtualizar]);

  async function acao(fn: () => Promise<Pedido>, ok: string) {
    try {
      aoAtualizar(await fn());
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  }

  return (
    <section className="max-w-[56rem] space-y-4 pb-24">
      {/* Faixa de situação: o que está acontecendo e o que o Assessor pode fazer */}
      {!encerrado && (
        <div className="cartao flex flex-wrap items-center gap-3 p-3 sm:p-4">
          {pedido.situacao === "COM_ASSESSOR" && (
            <>
              <span className="flex items-center gap-2 text-sm text-ink-soft">
                <CircleDot size={16} className="text-brand" />
                {pedido.encaminhamentos.length
                  ? "O pedido voltou para o Assessor."
                  : "O pedido está com o Assessor, aguardando o primeiro encaminhamento."}
              </span>
              {souAssessor && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button className="botao-primario" onClick={() => setModal("encaminhar")}>
                    <Send size={16} aria-hidden /> Encaminhar a um setor
                  </button>
                  <button className="botao-secundario" onClick={() => setModal("terceiro")}>
                    <Landmark size={16} aria-hidden /> Aguardar governo
                  </button>
                  <MenuMais
                    itens={[
                      {
                        rotulo: "Concluir pedido",
                        icone: CheckCircle2,
                        onClick: () => {
                          if (window.confirm("Concluir este pedido? Ele sai do painel de andamento."))
                            acao(() => api.concluir(pedido.id), "Pedido concluído.");
                        },
                      },
                      { rotulo: "Cancelar pedido", icone: X, perigo: true, onClick: () => setModal("cancelar") },
                    ]}
                  />
                </div>
              )}
            </>
          )}
          {pedido.situacao === "EM_SETOR" && enc && (
            <span className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              <Clock size={16} className="text-brass" />
              Aguardando <strong className="font-medium text-ink">{nomeSetor(enc.setor)}</strong> devolver
              {enc.responsavel ? <> — com {enc.responsavel.name}</> : " — ninguém assumiu ainda"}
              {enc.prazo && <> · prazo {data(enc.prazo)}</>}
            </span>
          )}
          {pedido.situacao === "AGUARDANDO_TERCEIRO" && (
            <>
              <span className="flex items-center gap-2 text-sm text-ink-soft">
                <Landmark size={16} className="text-estado-externo" />
                Aguardando retorno do governo/órgão externo
                {pedido.motivo_parada_texto ? `: ${pedido.motivo_parada_texto}` : "."}
              </span>
              {souAssessor && (
                <button
                  className="botao-primario ml-auto"
                  onClick={() => acao(() => api.retomar(pedido.id, "Governo respondeu; retomado."), "Pedido retomado.")}
                >
                  <Play size={15} /> O governo respondeu
                </button>
              )}
            </>
          )}
        </div>
      )}

      {ordenados.length === 0 ? (
        <div className="cartao p-10 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-faint">
            <Send size={20} aria-hidden />
          </span>
          <p className="mt-3 text-sm text-ink-muted">Nenhum setor recebeu este pedido ainda.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {ordenados.map((e) => (
            <CartaoTarefa
              key={e.id}
              enc={e}
              pedido={pedido}
              eu={eu}
              usuarios={usuarios}
              atual={e.id === enc?.id}
              aoAtualizar={aoAtualizar}
              abrirModal={setModal}
            />
          ))}
        </ol>
      )}

      {modal === "encaminhar" && (
        <ModalEncaminhar pedido={pedido} usuarios={usuarios} aoFechar={() => setModal(null)} aoAtualizar={aoAtualizar} />
      )}
      {modal === "terceiro" && (
        <ModalTexto
          titulo="Aguardar o governo"
          rotulo="Onde foi protocolado e o que se espera"
          placeholder="Ex.: protocolado na SES sob nº 88412, aguardando análise."
          confirmar="Aguardar retorno"
          aoFechar={() => setModal(null)}
          aoConfirmar={async (texto) => {
            aoAtualizar(await api.aguardarTerceiro(pedido.id, texto));
            toast.success("Pedido aguardando o governo.");
          }}
        />
      )}
      {modal === "cancelar" && (
        <ModalTexto
          titulo="Cancelar pedido"
          rotulo="Motivo do cancelamento"
          placeholder="Ex.: o deputado retirou a emenda."
          confirmar="Cancelar pedido"
          aoFechar={() => setModal(null)}
          aoConfirmar={async (texto) => {
            aoAtualizar(await api.cancelar(pedido.id, texto));
            toast.success("Pedido cancelado.");
          }}
        />
      )}
      {modal === "complemento" && enc && (
        <ModalTexto
          titulo="Pedir informação ao Assessor"
          rotulo="O que está faltando"
          placeholder="Ex.: falta a planta do terreno."
          confirmar="Enviar pergunta"
          aoFechar={() => setModal(null)}
          aoConfirmar={async (texto) => {
            aoAtualizar(await api.solicitarComplemento(pedido.id, enc.id, texto));
            toast.success("Pergunta enviada ao Assessor.");
          }}
        />
      )}
      {modal === "prazo" && enc && (
        <ModalPrazo pedido={pedido} enc={enc} aoFechar={() => setModal(null)} aoAtualizar={aoAtualizar} />
      )}
      {modal === "transferir" && enc && (
        <ModalPessoa
          titulo="Passar a tarefa para outra pessoa"
          rotulo="Novo responsável"
          pedido={pedido}
          usuarios={usuarios.filter((u) => u.setor === enc.setor && u.id !== enc.responsavel?.id)}
          aoFechar={() => setModal(null)}
          aoConfirmar={async (id) => {
            aoAtualizar(await api.transferir(pedido.id, enc.id, id));
            toast.success("Tarefa transferida.");
          }}
        />
      )}
      {modal === "mencionar" && enc && (
        <ModalPessoa
          titulo="Chamar alguém para ajudar"
          rotulo="Quem participa junto"
          pedido={pedido}
          usuarios={usuarios.filter((u) => u.setor === enc.setor && !enc.participantes.some((p) => p.id === u.id))}
          aoFechar={() => setModal(null)}
          aoConfirmar={async (id) => {
            aoAtualizar(await api.mencionar(pedido.id, enc.id, [id]));
            toast.success("Pessoa adicionada à tarefa.");
          }}
        />
      )}
    </section>
  );
}

// ── Cartão da tarefa ────────────────────────────────────────────────────

function CartaoTarefa({
  enc,
  pedido,
  eu,
  usuarios,
  atual,
  aoAtualizar,
  abrirModal,
}: {
  enc: Encaminhamento;
  pedido: Pedido;
  eu: Eu | null;
  usuarios: UsuarioResumo[];
  atual: boolean;
  aoAtualizar: (p: Pedido) => void;
  abrirModal: (m: Modal) => void;
}) {
  const nomeSetor = useNomeSetor();
  const [aberta, setAberta] = useState(atual);
  useEffect(() => setAberta(atual), [atual]);

  const souAssessor = Boolean(eu?.pode_encaminhar);
  const souDoSetor = Boolean(eu?.pode_trabalhar && eu.setor === enc.setor);
  const souDono = enc.responsavel?.id === eu?.id || enc.participantes.some((p) => p.id === eu?.id);
  const podeAssumir = atual && enc.status === "AGUARDANDO" && souDoSetor;
  const executando = atual && enc.status === "EM_EXECUCAO" && souDono;
  const ativo = ATIVOS.includes(enc.status);
  const devolvida = enc.status === "CONCLUIDO";

  const resumo = devolvida
    ? `${nomeSetor(enc.setor)} devolveu em ${entre(enc.created_at, enc.devolvido_em)}`
    : ativo
      ? `${nomeSetor(enc.setor)} · há ${entre(enc.created_at, null)}`
      : nomeSetor(enc.setor);

  const menu = [
    ...(executando ? [{ rotulo: "Alterar prazo", icone: CalendarClock, onClick: () => abrirModal("prazo") }] : []),
    ...(executando ? [{ rotulo: "Passar para outra pessoa", icone: ArrowRight, onClick: () => abrirModal("transferir") }] : []),
    ...(executando ? [{ rotulo: "Chamar alguém para ajudar", icone: UserPlus, onClick: () => abrirModal("mencionar") }] : []),
  ];

  return (
    <li>
      <article className={clsx("cartao overflow-hidden", atual && "border-brand/40 shadow-pop")}>
        <header className="flex items-start gap-3 p-4">
          <span
            className={clsx(
              "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold shadow-sm",
              devolvida ? "bg-estado-concluido/15 text-estado-concluido" : atual ? "bg-brand text-white" : "bg-ink/[.06] text-ink-muted"
            )}
          >
            {devolvida ? <Check size={16} /> : enc.ordem}
          </span>
          <button type="button" onClick={() => setAberta((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={aberta}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-bold text-ink">{enc.assunto}</h3>
              <span
                className={clsx(
                  "etiqueta",
                  devolvida
                    ? "bg-estado-concluido/10 text-estado-concluido"
                    : enc.status === "AGUARDANDO_COMPLEMENTO"
                      ? "bg-brass-50 text-brass-700"
                      : atual
                        ? "bg-brand-50 text-brand-700"
                        : "bg-ink/[.05] text-ink-muted"
                )}
              >
                {ROTULO_ENCAMINHAMENTO[enc.status] ?? enc.status}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <span>{resumo}</span>
              {enc.responsavel && <span>· {enc.responsavel.name}</span>}
              {enc.anexos.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  · <Paperclip size={11} /> {enc.anexos.length}
                </span>
              )}
              {atual && enc.prazo && <EtiquetaPrazo prazo={enc.prazo} diasDeAtraso={pedido.dias_de_atraso} />}
            </p>
            {!aberta && devolvida && enc.resultado && (
              <p className="mt-1.5 line-clamp-1 text-sm text-ink-soft">“{enc.resultado.replace(/\s+/g, " ")}”</p>
            )}
          </button>
          {menu.length > 0 && <MenuMais itens={menu} />}
          <button
            type="button"
            onClick={() => setAberta((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-canvas"
            aria-label={aberta ? "Recolher" : "Expandir"}
          >
            <ChevronDown size={17} className={clsx("transition-transform", aberta && "rotate-180")} />
          </button>
        </header>

        {aberta && (
          <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
            {enc.instrucoes && (
              <div className="rounded-btn bg-canvas/70 px-3.5 py-3">
                <p className="sobretitulo mb-1">O que foi pedido</p>
                <Markdown texto={enc.instrucoes} className="max-w-[68ch] space-y-1.5 text-sm text-ink-soft" />
              </div>
            )}

            {enc.checklist.length > 0 && (
              <Checklist pedido={pedido} enc={enc} editavel={executando} aoAtualizar={aoAtualizar} />
            )}

            {devolvida && enc.resultado && (
              <div className="rounded-btn border border-estado-concluido/20 bg-estado-concluido/[.06] px-3.5 py-3">
                <p className="sobretitulo mb-1 text-estado-concluido">Resposta do setor</p>
                <Markdown texto={enc.resultado} className="space-y-1.5 text-sm text-ink" />
              </div>
            )}

            {podeAssumir && (
              <div className="flex flex-wrap items-center gap-3 rounded-btn border border-brand/20 bg-brand-50 px-3.5 py-3">
                <p className="flex-1 text-sm text-brand-700">Esta tarefa está na fila do seu setor. Assuma para começar.</p>
                <button
                  className="botao-primario"
                  onClick={async () => {
                    try {
                      aoAtualizar(await api.assumir(pedido.id, enc.id));
                      toast.success("Tarefa assumida. Ela é sua agora.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Hand size={15} /> Assumir tarefa
                </button>
              </div>
            )}

            <Conversa pedido={pedido} enc={enc} eu={eu} usuarios={usuarios} ativa={ativo} aoAtualizar={aoAtualizar} />

            {executando && (
              <RespostaDoSetor pedido={pedido} enc={enc} aoAtualizar={aoAtualizar} aoPerguntar={() => abrirModal("complemento")} />
            )}

            {atual && enc.status === "AGUARDANDO_COMPLEMENTO" && souAssessor && pedido.complemento_pendente && (
              <p className="rounded-btn bg-brass-50 px-3.5 py-2.5 text-sm text-brass-700">
                O setor fez uma pergunta ({enc.complemento_pedido}). Responda na conversa acima — a tarefa volta a andar.
              </p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

// ── Checklist de entregas ───────────────────────────────────────────────

function Checklist({
  pedido,
  enc,
  editavel,
  aoAtualizar,
}: {
  pedido: Pedido;
  enc: Encaminhamento;
  editavel: boolean;
  aoAtualizar: (p: Pedido) => void;
}) {
  const feitos = enc.checklist.filter((i) => i.feito).length;
  async function marcar(indice: number) {
    const novo = enc.checklist.map((c, i) => (i === indice ? { ...c, feito: !c.feito } : c));
    try {
      aoAtualizar(await api.salvarRascunho(pedido.id, enc.id, { checklist: novo }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="sobretitulo">Entregas</p>
        <span className="text-xs tabular-nums text-ink-muted">
          {feitos} de {enc.checklist.length}
        </span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-pill bg-ink/[.06]">
        <div className="h-full rounded-pill bg-estado-concluido transition-[width]" style={{ width: `${(feitos / enc.checklist.length) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {enc.checklist.map((c, i) => (
          <li key={c.item}>
            <label className={clsx("flex items-center gap-2.5 rounded-btn px-2 py-1.5 text-sm", editavel && "cursor-pointer hover:bg-canvas")}>
              <input
                type="checkbox"
                checked={c.feito}
                disabled={!editavel}
                onChange={() => marcar(i)}
                className="h-4 w-4 rounded border-line text-estado-concluido focus:ring-brand"
              />
              <span className={c.feito ? "text-ink-muted line-through" : "text-ink"}>{c.item}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Conversa ────────────────────────────────────────────────────────────

const TIPOS_MENSAGEM = new Set(["COMENTARIO", "COMPLEMENTO_SOLICITADO", "COMPLEMENTO_RESPONDIDO"]);

function Conversa({
  pedido,
  enc,
  eu,
  usuarios,
  ativa,
  aoAtualizar,
}: {
  pedido: Pedido;
  enc: Encaminhamento;
  eu: Eu | null;
  usuarios: UsuarioResumo[];
  ativa: boolean;
  aoAtualizar: (p: Pedido) => void;
}) {
  const { abrir } = useVisualizador();
  const eventos = useMemo(
    () =>
      pedido.andamentos
        .filter((a) => a.encaminhamento_id === enc.id && a.tipo !== "DEVOLUCAO")
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pedido.andamentos, enc.id]
  );
  const [anexando, setAnexando] = useState(false);

  // Pergunta sem resposta: marcada como "aguardando resposta" e ninguém mais
  // escreveu depois dela.
  const pendentes = new Set(
    eventos
      .filter((a, i) => {
        const pergunta = a.dados?.aguardando_resposta || a.tipo === "COMPLEMENTO_SOLICITADO";
        if (!pergunta) return false;
        return !eventos.slice(i + 1).some((b) => TIPOS_MENSAGEM.has(b.tipo) && b.autor_nome !== a.autor_nome);
      })
      .map((a) => a.id)
  );

  let diaAnterior = "";
  return (
    <div className="rounded-btn border border-line">
      <p className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/40 px-3.5 py-2.5">
        <span className="sobretitulo">Conversa interna da tarefa</span>
        <span className="text-xs text-ink-faint">
          {eventos.filter((e) => TIPOS_MENSAGEM.has(e.tipo)).length} mensagens · visível para o gabinete e setor
        </span>
      </p>
      <div className="rolagem-fina max-h-[28rem] space-y-2.5 overflow-y-auto px-3.5 py-3">
        {eventos.length === 0 && <p className="py-4 text-center text-sm text-ink-faint">Nenhuma mensagem ainda.</p>}
        {eventos.map((a) => {
          const dia = rotuloDia(a.created_at);
          const separador = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={a.id}>
              {separador && (
                <p className="my-2 text-center text-[11px] font-medium uppercase tracking-wider text-ink-faint">{dia}</p>
              )}
              <ItemConversa
                a={a}
                eu={eu}
                pendente={pendentes.has(a.id)}
                abrirAnexo={() => {
                  const anexo = enc.anexos.find((x) => x.id === a.dados?.anexo_id);
                  if (anexo) abrir(anexo, enc.anexos);
                }}
                temAnexo={Boolean(enc.anexos.find((x) => x.id === a.dados?.anexo_id))}
              />
            </div>
          );
        })}
      </div>
      {ativa && (
        <div className="border-t border-line p-3">
          <Compositor pedido={pedido} enc={enc} usuarios={usuarios} aoAtualizar={aoAtualizar} aoAnexar={() => setAnexando((v) => !v)} />
          {anexando && (
            <div className="mt-2">
              <EnvioDeArquivos pedido={pedido} encaminhamentoId={enc.id} aoAtualizar={aoAtualizar} compacto />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemConversa({
  a,
  eu,
  pendente,
  abrirAnexo,
  temAnexo,
}: {
  a: Andamento;
  eu: Eu | null;
  pendente: boolean;
  abrirAnexo: () => void;
  temAnexo: boolean;
}) {
  const meu = a.autor_id ? a.autor_id === eu?.id : a.autor_nome === eu?.nome;

  if (a.tipo === "ANEXO" && a.dados?.anexo_id) {
    return (
      <div className={clsx("flex", meu ? "justify-end" : "justify-start")}>
        <button
          onClick={abrirAnexo}
          disabled={!temAnexo}
          className="flex max-w-[85%] items-center gap-2.5 rounded-xl border border-line bg-paper px-3 py-2 text-left transition hover:border-brand disabled:opacity-60"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
            <FileText size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{a.dados.nome ?? "Documento"}</span>
            <span className="block text-[11px] text-ink-faint">
              {a.autor_nome} · {hora(a.created_at)} · {temAnexo ? "toque para ver" : "removido"}
            </span>
          </span>
        </button>
      </div>
    );
  }

  if (!TIPOS_MENSAGEM.has(a.tipo)) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
        <span className="h-px w-6 bg-line" />
        {a.autor_nome}: {a.texto} · {hora(a.created_at)}
        <span className="h-px w-6 bg-line" />
      </p>
    );
  }

  const pergunta = a.tipo === "COMPLEMENTO_SOLICITADO" || a.dados?.aguardando_resposta;
  return (
    <div className={clsx("flex gap-2", meu ? "flex-row-reverse" : "flex-row")}>
      <span
        className={clsx(
          "mt-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
          meu ? "bg-brand text-white" : "bg-ink/[.08] text-ink-soft"
        )}
        title={a.autor_nome}
      >
        {iniciais(a.autor_nome)}
      </span>
      <div
        className={clsx(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
          meu ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-canvas text-ink",
          pergunta && !meu && "ring-1 ring-brass/50"
        )}
      >
        {!meu && <p className="mb-0.5 text-[11px] font-semibold text-ink-muted">{a.autor_nome}</p>}
        {pergunta && (
          <p className={clsx("mb-0.5 flex items-center gap-1 text-[11px] font-semibold", meu ? "text-white/80" : "text-brass-700")}>
            <MessageCircleQuestion size={12} /> {pendente ? "Aguardando resposta" : "Pergunta"}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{realcarMencoes(a.texto ?? "", meu)}</p>
        <p className={clsx("mt-0.5 text-right text-[10px]", meu ? "text-white/60" : "text-ink-faint")}>{hora(a.created_at)}</p>
      </div>
    </div>
  );
}

function realcarMencoes(texto: string, meu: boolean) {
  const partes = texto.split(/(@[\p{L}][\p{L}.]*(?: [\p{L}][\p{L}.]*)?)/u);
  return partes.map((p, i) =>
    p.startsWith("@") ? (
      <strong key={i} className={meu ? "text-white" : "text-brand"}>
        {p}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function Compositor({
  pedido,
  enc,
  usuarios,
  aoAtualizar,
  aoAnexar,
}: {
  pedido: Pedido;
  enc?: Encaminhamento;
  usuarios: UsuarioResumo[];
  aoAtualizar: (p: Pedido) => void;
  aoAnexar?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [mencionados, setMencionados] = useState<UsuarioResumo[]>([]);
  const [busca, setBusca] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  const sugestoes =
    busca === null
      ? []
      : usuarios.filter((u) => u.name.toLowerCase().includes(busca.toLowerCase())).slice(0, 6);

  function aoDigitar(v: string) {
    setTexto(v);
    const cursor = campo.current?.selectionStart ?? v.length;
    const m = v.slice(0, cursor).match(/@([\p{L}.]*)$/u);
    setBusca(m ? m[1] : null);
  }

  function escolher(u: UsuarioResumo) {
    const cursor = campo.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor).replace(/@([\p{L}.]*)$/u, `@${u.name} `);
    setTexto(antes + texto.slice(cursor));
    setMencionados((m) => (m.some((x) => x.id === u.id) ? m : [...m, u]));
    setBusca(null);
    campo.current?.focus();
  }

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    try {
      const ids = mencionados.filter((u) => t.includes(`@${u.name}`)).map((u) => u.id);
      let p: Pedido;
      // Resposta à pergunta formal do setor usa o fluxo de complemento, que
      // devolve a tarefa à execução.
      if (enc && enc.status === "AGUARDANDO_COMPLEMENTO" && pedido.complemento_pendente) {
        p = await api.responderComplemento(pedido.id, enc.id, t);
      } else {
        p = await api.comentar(pedido.id, t, { encaminhamentoId: enc?.id, mencionados: ids, aguardandoResposta: pergunta });
      }
      aoAtualizar(p);
      setTexto("");
      setMencionados([]);
      setPergunta(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="relative">
      {sugestoes.length > 0 && (
        <ul className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-btn border border-line bg-elevated shadow-pop">
          {sugestoes.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(u);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink/[.08] text-[10px] font-semibold">{iniciais(u.name)}</span>
                <span className="truncate text-ink">{u.name}</span>
                {u.setor && <span className="ml-auto text-[11px] text-ink-faint">{u.setor.toLowerCase()}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={campo}
        value={texto}
        onChange={(e) => aoDigitar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            enviar();
          }
        }}
        rows={2}
        maxLength={4000}
        placeholder={
          enc?.status === "AGUARDANDO_COMPLEMENTO" ? "Responda a pergunta do setor…" : "Escreva uma mensagem… use @ para chamar alguém"
        }
        className="campo resize-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {aoAnexar && (
          <button type="button" onClick={aoAnexar} className="botao-fantasma px-2.5 py-1.5 text-xs">
            <Paperclip size={14} /> Anexar
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            aoDigitar(texto + (texto.endsWith(" ") || !texto ? "@" : " @"));
            campo.current?.focus();
          }}
          className="botao-fantasma px-2.5 py-1.5 text-xs"
        >
          <AtSign size={14} /> Mencionar
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={pergunta} onChange={(e) => setPergunta(e.target.checked)} className="h-3.5 w-3.5 rounded border-line text-brand" />
          Aguardo resposta
        </label>
        <button type="button" onClick={enviar} disabled={!texto.trim() || enviando} className="botao-primario ml-auto px-3 py-1.5 text-sm">
          <Send size={14} /> {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

// ── Resposta do setor (rascunho com salvamento automático) ──────────────

function RespostaDoSetor({
  pedido,
  enc,
  aoAtualizar,
  aoPerguntar,
}: {
  pedido: Pedido;
  enc: Encaminhamento;
  aoAtualizar: (p: Pedido) => void;
  aoPerguntar: () => void;
}) {
  const [texto, setTexto] = useState(enc.rascunho ?? "");
  const [salvoEm, setSalvoEm] = useState<string | null>(enc.rascunho_em);
  const [salvando, setSalvando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const ultimo = useRef(enc.rascunho ?? "");

  // Salva 1,5 s depois da última tecla. Não atualiza o pedido inteiro a cada
  // salvamento, para o cursor não pular.
  useEffect(() => {
    if (texto === ultimo.current) return;
    const t = setTimeout(async () => {
      setSalvando(true);
      try {
        const p = await api.salvarRascunho(pedido.id, enc.id, { texto });
        ultimo.current = texto;
        setSalvoEm(p.encaminhamento_atual?.rascunho_em ?? new Date().toISOString());
      } catch {
        /* tenta de novo na próxima tecla */
      } finally {
        setSalvando(false);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [texto, pedido.id, enc.id]);

  const faltam = enc.checklist.filter((c) => !c.feito);
  const pronto = texto.replace(/\s+/g, " ").trim().length >= 10;

  async function devolver() {
    if (faltam.length && !window.confirm(`Ainda faltam ${faltam.length} entrega(s): ${faltam.map((f) => f.item).join(", ")}. Devolver assim mesmo?`))
      return;
    setDevolvendo(true);
    try {
      aoAtualizar(await api.devolver(pedido.id, enc.id, texto.trim()));
      toast.success("Tarefa devolvida ao Assessor.");
    } catch (e) {
      toast.error((e as Error).message);
      setDevolvendo(false);
    }
  }

  return (
    <div id="resposta-do-setor" className="scroll-mt-24 rounded-btn border border-brand/25 bg-brand-50/40 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="sobretitulo text-brand-700">Sua resposta ao Assessor (despacho)</p>
        <span className="text-[11px] text-ink-faint">
          {salvando ? "Salvando…" : salvoEm ? `Rascunho salvo ${relativo(salvoEm) === "agora" ? "agora" : `há ${relativo(salvoEm)}`}` : "Salva sozinho enquanto você escreve"}
        </span>
      </div>
      <EditorDetalhes
        id={`resposta-${enc.id}`}
        valor={texto}
        aoMudar={setTexto}
        maxLength={8000}
        placeholder="O que foi feito, o que está sendo entregue, observações importantes…"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="botao-primario" onClick={devolver} disabled={!pronto || devolvendo}>
          <CornerUpLeft size={15} /> {devolvendo ? "Devolvendo…" : "Concluir e devolver"}
        </button>
        <button className="botao-secundario" onClick={aoPerguntar}>
          <MessageCircleQuestion size={15} /> Pedir informação ao Assessor
        </button>
        {!pronto && <span className="text-xs text-ink-faint">Escreva a resposta para poder devolver.</span>}
        {pronto && faltam.length > 0 && (
          <span className="text-xs text-brass-700">Faltam {faltam.length} entrega(s) do checklist.</span>
        )}
      </div>
    </div>
  );
}

// ── Menu "⋯" ────────────────────────────────────────────────────────────

function MenuMais({
  itens,
}: {
  itens: { rotulo: string; icone: typeof Check; onClick: () => void; perigo?: boolean }[];
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas"
        aria-label="Mais ações"
        aria-expanded={aberto}
      >
        <MoreHorizontal size={18} />
      </button>
      {aberto && (
        <ul className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-btn border border-line bg-elevated py-1 shadow-pop animate-fade-subir">
          {itens.map(({ rotulo, icone: Icone, onClick, perigo }) => (
            <li key={rotulo}>
              <button
                type="button"
                onClick={() => {
                  setAberto(false);
                  onClick();
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-canvas",
                  perigo ? "text-estado-atrasado" : "text-ink-soft"
                )}
              >
                <Icone size={15} /> {rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
