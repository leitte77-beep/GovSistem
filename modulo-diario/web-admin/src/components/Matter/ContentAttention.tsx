"use client";

import type { ContentWarning } from "@/types/matter";

interface Props {
  warnings: ContentWarning[];
  checking?: boolean;
  /** Versão compacta para a coluna lateral. */
  compact?: boolean;
}

/**
 * "Pontos de atenção" do texto colado. A diagramação é automática; o que fica
 * para o operador é conferir se o texto é o certo — título × texto, súmula,
 * número do ato, texto cortado de portal, campo não preenchido.
 */
export default function ContentAttention({ warnings, checking = false, compact = false }: Props) {
  const relevant = warnings.filter((w) => w.level === "warning");
  const infos = warnings.filter((w) => w.level !== "warning");

  if (!warnings.length) {
    return (
      <div
        className="bg-surface-bright rounded-2xl p-5 border border-outline-variant shadow-sm text-sm text-on-surface-variant flex items-center gap-2"
        aria-live="polite"
      >
        <span className="material-symbols-outlined text-secondary text-[18px]" aria-hidden="true">
          {checking ? "progress_activity" : "check_circle"}
        </span>
        {checking ? "Conferindo o texto…" : "Nenhum ponto de atenção no texto."}
      </div>
    );
  }

  return (
    <section
      className="bg-surface-bright rounded-2xl p-5 border border-amber-300 shadow-sm"
      aria-labelledby="content-attention-title"
      aria-live="polite"
    >
      <h3 id="content-attention-title" className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-amber-600 text-[20px]" aria-hidden="true">fact_check</span>
        Pontos de atenção
        {relevant.length > 0 && (
          <span className="ml-auto rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold">
            {relevant.length}
          </span>
        )}
      </h3>
      {!compact && (
        <p className="mt-1 text-xs text-on-surface-variant">
          A formatação é automática. Confira só se o texto colado é o certo — nada aqui impede o envio.
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {[...relevant, ...infos].map((w, i) => (
          <li key={`${w.code}-${i}`} className="flex items-start gap-2 text-sm">
            <span
              className={`material-symbols-outlined text-[18px] mt-0.5 ${w.level === "warning" ? "text-amber-600" : "text-primary"}`}
              aria-hidden="true"
            >
              {w.level === "warning" ? "warning" : "info"}
            </span>
            <div className="min-w-0">
              <p className="text-on-surface">{w.message}</p>
              {w.detail && !compact && <p className="text-xs text-on-surface-variant mt-0.5">{w.detail}</p>}
              {w.excerpt && (
                <p className="mt-1 text-xs text-on-surface-variant italic break-words border-l-2 border-outline-variant pl-2">
                  “{w.excerpt}”
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
