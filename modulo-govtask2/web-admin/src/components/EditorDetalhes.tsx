"use client";

/**
 * Campo de texto longo com barra de formatação.
 *
 * A formatação é guardada como Markdown — texto simples — e não como HTML.
 * Assim o valor continua pesquisável e exportável, e a exibição passa pelo
 * `Markdown`, que monta nós React (sem HTML injetado).
 */

import { Bold, Eye, Italic, List, ListOrdered, Pencil } from "lucide-react";
import { useRef, useState } from "react";

import { Markdown } from "@/components/Markdown";

const BOTAO =
  "inline-flex h-8 w-8 items-center justify-center rounded-btn text-ink-muted transition-colors hover:bg-canvas hover:text-ink";

export function EditorDetalhes({
  id,
  valor,
  aoMudar,
  placeholder,
  maxLength,
}: {
  id?: string;
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [previa, setPrevia] = useState(false);

  function envolver(marcador: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: ini, selectionEnd: fim, value } = el;
    const selecionado = value.slice(ini, fim);
    const inserido = `${marcador}${selecionado}${marcador}`;
    aoMudar(value.slice(0, ini) + inserido + value.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      const pos = selecionado ? ini + inserido.length : ini + marcador.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function prefixar(prefixo: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: ini, selectionEnd: fim, value } = el;
    const inicioLinha = value.lastIndexOf("\n", ini - 1) + 1;
    let fimLinha = value.indexOf("\n", fim);
    if (fimLinha === -1) fimLinha = value.length;
    const trecho = value
      .slice(inicioLinha, fimLinha)
      .split("\n")
      .map((linha) => (linha.trim() ? `${prefixo}${linha}` : linha))
      .join("\n");
    aoMudar(value.slice(0, inicioLinha) + trecho + value.slice(fimLinha));
    requestAnimationFrame(() => el.focus());
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1 rounded-btn border border-line bg-canvas/60 p-1">
        <button
          type="button"
          className={BOTAO}
          title="Negrito"
          aria-label="Negrito"
          onClick={() => envolver("**")}
        >
          <Bold size={15} aria-hidden />
        </button>
        <button
          type="button"
          className={BOTAO}
          title="Itálico"
          aria-label="Itálico"
          onClick={() => envolver("_")}
        >
          <Italic size={15} aria-hidden />
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button
          type="button"
          className={BOTAO}
          title="Lista com marcadores"
          aria-label="Lista com marcadores"
          onClick={() => prefixar("- ")}
        >
          <List size={15} aria-hidden />
        </button>
        <button
          type="button"
          className={BOTAO}
          title="Lista numerada"
          aria-label="Lista numerada"
          onClick={() => prefixar("1. ")}
        >
          <ListOrdered size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          onClick={() => setPrevia((v) => !v)}
        >
          {previa ? (
            <>
              <Pencil size={13} aria-hidden />
              Editar
            </>
          ) : (
            <>
              <Eye size={13} aria-hidden />
              Visualizar
            </>
          )}
        </button>
      </div>

      {previa ? (
        <div className="campo min-h-[7rem] text-sm text-ink-soft">
          {valor.trim() ? (
            <Markdown texto={valor} className="space-y-2" />
          ) : (
            <span className="text-ink-faint">Nada para visualizar.</span>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          id={id}
          className="campo min-h-[7rem]"
          maxLength={maxLength}
          placeholder={placeholder}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </div>
  );
}
