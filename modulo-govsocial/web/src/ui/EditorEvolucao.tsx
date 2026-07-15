import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import clsx from "clsx";
import { formatarDataHora } from "@/nucleo/datas";

/**
 * <EditorEvolucao> — editor rich-text profissional para a evolução técnica,
 * baseado em contentEditable e sem dependência externa (§bundle).
 * Ferramentas: desfazer/refazer, título/parágrafo/citação, negrito, itálico,
 * sublinhado, tachado, listas e limpeza de formatação — com estado ativo
 * refletido na barra e atalhos nativos (Ctrl+B/I/U/Z).
 * Mostra status de autosave e contador de palavras/caracteres.
 *
 * O conteúdo é sensível: o componente não persiste nada por conta própria —
 * quem decide salvar (IndexedDB) é o formulário-pai, via onChange.
 */

type ComandoInline =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList";

type Bloco = "p" | "h3" | "blockquote";

const COMANDOS_MONITORADOS: ComandoInline[] = [
  "bold",
  "italic",
  "underline",
  "strikeThrough",
  "insertUnorderedList",
  "insertOrderedList",
];

export function EditorEvolucao({
  valor,
  aoMudar,
  rascunhoEm,
  label = "Evolução técnica",
  minAltura = "min-h-[160px]",
  placeholder = "Descreva a evolução do atendimento…",
}: {
  valor: string;
  aoMudar: (html: string) => void;
  /** ISO do último autosave; se null, ainda não salvou. */
  rascunhoEm: string | null;
  label?: string;
  /** Classe Tailwind da altura mínima da área de escrita. */
  minAltura?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const editorId = useId();
  const statusId = `${editorId}-status`;
  const [ativos, setAtivos] = useState<Record<string, boolean>>({});
  const [bloco, setBloco] = useState<Bloco>("p");

  // Sincroniza o HTML externo -> DOM só quando difere (evita mover o cursor).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== valor) {
      ref.current.innerHTML = valor;
    }
  }, [valor]);

  // Reflete na barra o estado da formatação sob o cursor/seleção.
  const atualizarEstados = useCallback(() => {
    const el = ref.current;
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return;
    const novo: Record<string, boolean> = {};
    for (const cmd of COMANDOS_MONITORADOS) {
      try {
        novo[cmd] = document.queryCommandState(cmd);
      } catch {
        novo[cmd] = false;
      }
    }
    setAtivos(novo);
    try {
      const v = document.queryCommandValue("formatBlock").toLowerCase();
      setBloco(v === "h3" ? "h3" : v === "blockquote" ? "blockquote" : "p");
    } catch {
      setBloco("p");
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", atualizarEstados);
    return () => document.removeEventListener("selectionchange", atualizarEstados);
  }, [atualizarEstados]);

  function executar(fn: () => void) {
    // execCommand é depreciado, porém suficiente e sem dependências para um
    // editor leve em navegadores de repartição. Reaplica o foco antes.
    ref.current?.focus();
    fn();
    aoMudar(ref.current?.innerHTML ?? "");
    atualizarEstados();
  }

  const comando = (cmd: ComandoInline | "undo" | "redo" | "removeFormat") =>
    executar(() => document.execCommand(cmd, false));

  const formatarBloco = (alvo: Bloco) =>
    executar(() => {
      // Alterna: aplicar o mesmo bloco de novo volta ao parágrafo.
      const proximo = bloco === alvo ? "p" : alvo;
      document.execCommand("formatBlock", false, proximo);
    });

  const textoPuro = valor
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const palavras = textoPuro === "" ? 0 : textoPuro.split(" ").length;
  const vazio = textoPuro === "";

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={editorId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="overflow-hidden rounded-input border border-ink-soft/30 bg-surface focus-within:border-primary">
        <div
          role="toolbar"
          aria-label="Formatação do texto"
          className="flex flex-wrap items-center gap-0.5 border-b border-ink-soft/15 bg-surface-container-low/60 px-1.5 py-1"
        >
          <BotaoFerramenta rotulo="Desfazer (Ctrl+Z)" onClick={() => comando("undo")}>
            <Undo2 className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta rotulo="Refazer (Ctrl+Y)" onClick={() => comando("redo")}>
            <Redo2 className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>

          <Separador />

          <BotaoFerramenta
            rotulo="Título de seção"
            ativo={bloco === "h3"}
            onClick={() => formatarBloco("h3")}
          >
            <Heading2 className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Parágrafo"
            ativo={bloco === "p"}
            onClick={() => formatarBloco("p")}
          >
            <Pilcrow className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Citação"
            ativo={bloco === "blockquote"}
            onClick={() => formatarBloco("blockquote")}
          >
            <Quote className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>

          <Separador />

          <BotaoFerramenta
            rotulo="Negrito (Ctrl+B)"
            ativo={ativos.bold}
            onClick={() => comando("bold")}
          >
            <Bold className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Itálico (Ctrl+I)"
            ativo={ativos.italic}
            onClick={() => comando("italic")}
          >
            <Italic className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Sublinhado (Ctrl+U)"
            ativo={ativos.underline}
            onClick={() => comando("underline")}
          >
            <Underline className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Tachado"
            ativo={ativos.strikeThrough}
            onClick={() => comando("strikeThrough")}
          >
            <Strikethrough className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>

          <Separador />

          <BotaoFerramenta
            rotulo="Lista com marcadores"
            ativo={ativos.insertUnorderedList}
            onClick={() => comando("insertUnorderedList")}
          >
            <List className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Lista numerada"
            ativo={ativos.insertOrderedList}
            onClick={() => comando("insertOrderedList")}
          >
            <ListOrdered className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>

          <Separador />

          <BotaoFerramenta
            rotulo="Limpar formatação"
            onClick={() => comando("removeFormat")}
          >
            <RemoveFormatting className="h-4 w-4" aria-hidden />
          </BotaoFerramenta>
        </div>

        <div className="relative">
          {vazio && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-4 top-3 text-sm text-ink-soft/60"
            >
              {placeholder}
            </span>
          )}
          <div
            id={editorId}
            ref={ref}
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            aria-describedby={statusId}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => aoMudar((e.target as HTMLDivElement).innerHTML)}
            onFocus={atualizarEstados}
            className={clsx(
              "max-w-none px-4 py-3 text-sm leading-relaxed text-ink focus:outline-none",
              minAltura,
              "[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-ink",
              "[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-ink-soft",
              "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
              "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-soft/15 bg-surface-container-low/60 px-3 py-1.5">
          <span id={statusId} className="text-xs text-ink-soft" aria-live="polite">
            {rascunhoEm
              ? `Rascunho salvo às ${formatarDataHora(rascunhoEm).slice(-5)}`
              : "As alterações são salvas automaticamente enquanto você escreve."}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-soft" aria-hidden>
            {palavras} {palavras === 1 ? "palavra" : "palavras"} · {textoPuro.length}{" "}
            {textoPuro.length === 1 ? "caractere" : "caracteres"}
          </span>
        </div>
      </div>
    </div>
  );
}

function Separador() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-ink-soft/20" />;
}

function BotaoFerramenta({
  rotulo,
  onClick,
  ativo = false,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // onMouseDown evita perder a seleção do texto antes de aplicar o comando.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-label={rotulo}
      aria-pressed={ativo}
      title={rotulo}
      className={clsx(
        "rounded p-1.5 focus-visible:outline-focus",
        ativo
          ? "bg-primary-soft text-primary"
          : "text-ink-soft hover:bg-primary-soft hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
