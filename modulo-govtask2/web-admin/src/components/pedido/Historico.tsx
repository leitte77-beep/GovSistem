"use client";

/**
 * Histórico: a linha do tempo do pedido, que só cresce.
 *
 * Agrupada por dia, com ícone e cor por tipo de evento, filtros, o antes →
 * depois de cada edição e o tempo que passou entre um evento e outro (é aí
 * que se vê onde o pedido demorou). Documentos abrem no visualizador.
 */

import clsx from "clsx";
import {
  CalendarClock,
  CheckCircle2,
  CornerUpLeft,
  FilePlus2,
  FileX2,
  Flag,
  Hand,
  HardHat,
  Landmark,
  MessageSquare,
  MessageCircleQuestion,
  PauseCircle,
  Pencil,
  Send,
  Shuffle,
  Sparkles,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Andamento, Pedido, UsuarioResumo } from "@/lib/api";
import { entre, hora, rotuloDia } from "@/lib/formato";
import { useSetores } from "@/lib/setores";

import { Compositor } from "./Tramitacao";
import { useVisualizador } from "./Visualizador";

const ESTILO: Record<string, { icone: LucideIcon; cor: string; grupo: Grupo }> = {
  ABERTURA: { icone: Flag, cor: "bg-brand text-white", grupo: "fluxo" },
  ENCAMINHAMENTO: { icone: Send, cor: "bg-brand-50 text-brand", grupo: "fluxo" },
  ASSUNCAO: { icone: Hand, cor: "bg-brass-50 text-brass-700", grupo: "fluxo" },
  TRANSFERENCIA: { icone: Shuffle, cor: "bg-brass-50 text-brass-700", grupo: "fluxo" },
  MENCAO: { icone: UserPlus, cor: "bg-brass-50 text-brass-700", grupo: "fluxo" },
  PRAZO: { icone: CalendarClock, cor: "bg-brass-50 text-brass-700", grupo: "edicao" },
  COMPLEMENTO_SOLICITADO: { icone: MessageCircleQuestion, cor: "bg-brass-50 text-brass-700", grupo: "conversa" },
  COMPLEMENTO_RESPONDIDO: { icone: MessageSquare, cor: "bg-canvas text-ink-soft", grupo: "conversa" },
  ANEXO: { icone: FilePlus2, cor: "bg-estado-info/10 text-estado-info", grupo: "documentos" },
  MEDICAO: { icone: HardHat, cor: "bg-brand-50 text-brand", grupo: "fluxo" },
  DEVOLUCAO: { icone: CornerUpLeft, cor: "bg-estado-concluido/10 text-estado-concluido", grupo: "fluxo" },
  COMENTARIO: { icone: MessageSquare, cor: "bg-canvas text-ink-soft", grupo: "conversa" },
  CONCLUSAO: { icone: CheckCircle2, cor: "bg-estado-concluido text-white", grupo: "fluxo" },
  CANCELAMENTO: { icone: XCircle, cor: "bg-estado-atrasado text-white", grupo: "fluxo" },
  TERCEIRO: { icone: Landmark, cor: "bg-estado-externo/10 text-estado-externo", grupo: "fluxo" },
  EDICAO: { icone: Pencil, cor: "bg-ink/[.06] text-ink-muted", grupo: "edicao" },
  PARADA: { icone: PauseCircle, cor: "bg-estado-info/10 text-estado-info", grupo: "fluxo" },
};

type Grupo = "fluxo" | "documentos" | "conversa" | "edicao";
const FILTROS: { chave: Grupo | ""; rotulo: string }[] = [
  { chave: "", rotulo: "Tudo" },
  { chave: "fluxo", rotulo: "Andamento" },
  { chave: "documentos", rotulo: "Documentos" },
  { chave: "conversa", rotulo: "Mensagens" },
  { chave: "edicao", rotulo: "Alterações" },
];

/** Registros antigos gravavam o código do setor ("INFORMATICA"). */
function comNomes(texto: string, nomes: Record<string, string>) {
  return texto.replace(/\b[A-Z][A-Z_]{3,}\b/g, (c) => nomes[c] ?? c);
}

export function AbaHistorico({
  pedido,
  usuarios = [],
  aoAtualizar,
}: {
  pedido: Pedido;
  usuarios?: UsuarioResumo[];
  aoAtualizar: (p: Pedido) => void;
}) {
  const { nomes } = useSetores();
  const { abrir } = useVisualizador();
  const [filtro, setFiltro] = useState<Grupo | "">("");

  const eventos = useMemo(
    () => [...pedido.andamentos].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [pedido.andamentos]
  );
  const visiveis = eventos.filter((a) => !filtro || (ESTILO[a.tipo]?.grupo ?? "fluxo") === filtro);
  const contagem = (g: Grupo | "") => (g ? eventos.filter((a) => (ESTILO[a.tipo]?.grupo ?? "fluxo") === g).length : eventos.length);

  const porDia: { dia: string; itens: Andamento[] }[] = [];
  for (const a of visiveis) {
    const dia = rotuloDia(a.created_at);
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(a);
    else porDia.push({ dia, itens: [a] });
  }

  return (
    <section className="max-w-[48rem] space-y-4 pb-24">
      <div className="cartao p-4">
        <p className="rotulo">Registrar no histórico</p>
        <Compositor pedido={pedido} usuarios={usuarios} aoAtualizar={aoAtualizar} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.rotulo}
            onClick={() => setFiltro(f.chave)}
            className={clsx(
              "rounded-pill px-3 py-1 text-xs font-medium transition",
              filtro === f.chave ? "bg-brand text-white" : "border border-line bg-canvas text-ink-soft hover:border-line-strong"
            )}
          >
            {f.rotulo} <span className={filtro === f.chave ? "text-white/70" : "text-ink-faint"}>{contagem(f.chave)}</span>
          </button>
        ))}
      </div>

      {porDia.length === 0 && <p className="cartao p-8 text-center text-sm text-ink-muted">Nada neste filtro.</p>}

      {porDia.map(({ dia, itens }) => (
        <div key={dia} className="cartao overflow-hidden">
          <p className="border-b border-line bg-canvas/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {dia}
          </p>
          <ol className="relative px-4 py-3 before:absolute before:bottom-6 before:left-[31px] before:top-6 before:w-px before:bg-line">
            {itens.map((a) => {
              const estilo = ESTILO[a.tipo] ?? { icone: Sparkles, cor: "bg-canvas text-ink-muted" };
              const Icone = a.dados?.removido ? FileX2 : estilo.icone;
              // Tempo até o evento seguinte (o anterior na lista, que é decrescente).
              const idx = eventos.indexOf(a);
              const proximo = idx > 0 ? eventos[idx - 1] : null;
              const intervalo = proximo ? entre(a.created_at, proximo.created_at) : null;
              const anexo = a.dados?.anexo_id ? pedido.anexos.find((x) => x.id === a.dados?.anexo_id) : undefined;
              const mudancas = a.dados?.mudancas ? Object.entries(a.dados.mudancas) : [];
              return (
                <li key={a.id} className="relative flex gap-3 py-2">
                  <span className={clsx("relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-paper", estilo.cor)}>
                    <Icone size={14} />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm text-ink">
                      {anexo ? (
                        <>
                          Anexou{" "}
                          <button onClick={() => abrir(anexo, pedido.anexos)} className="font-medium text-brand hover:underline">
                            {anexo.nome_original}
                          </button>
                        </>
                      ) : (
                        comNomes(a.texto ?? "", nomes)
                      )}
                    </p>
                    {mudancas.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {mudancas.map(([campo, [antes, depois]]) => (
                          <li key={campo} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-medium capitalize text-ink-muted">{campo}:</span>
                            <span className="rounded bg-estado-atrasado/10 px-1.5 text-estado-atrasado line-through decoration-1">{antes ?? "vazio"}</span>
                            <span className="text-ink-faint">→</span>
                            <span className="rounded bg-estado-concluido/10 px-1.5 text-estado-concluido">{depois ?? "vazio"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {a.autor_nome} · {hora(a.created_at)}
                      {intervalo && <span className="ml-2 rounded-pill bg-ink/[.04] px-1.5">+{intervalo} até o próximo</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
