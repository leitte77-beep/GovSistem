"use client";

import { useRef } from "react";
import type { MatterMeta } from "@/lib/edition-types";

export type MobileTocDrawerProps = {
  matters: MatterMeta[];
  totalLabel?: string;
};

/**
 * Mobile-only access to the edition summary. A quiet trigger opens a native,
 * accessible <dialog> sheet with the same indexable anchor list used on
 * desktop. Closing happens on selection, on Esc and via the close button.
 */
export default function MobileTocDrawer({ matters, totalLabel }: MobileTocDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = () => dialogRef.current?.showModal?.();
  const close = () => dialogRef.current?.close?.();

  if (matters.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="no-print mb-6 flex w-full items-center justify-between rounded-2xl bg-edition-sheet px-5 py-3.5 text-left shadow-[var(--edition-shadow-soft)] ring-1 ring-edition-line transition hover:bg-edition-sheet-muted"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="material-symbols-outlined text-edition-accent">menu_book</span>
          <span className="text-[15px] font-semibold text-edition-ink">Nesta edição</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[13px] text-edition-muted">
            {matters.length} {matters.length === 1 ? "matéria" : "matérias"}
          </span>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-edition-muted">chevron_right</span>
        </span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={close}
        className="m-0 max-h-[86vh] w-full max-w-full rounded-t-[22px] bg-edition-sheet p-0 text-edition-ink backdrop:bg-black/35 sm:mx-auto sm:max-w-md sm:rounded-[22px] sm:shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-edition-line px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-edition-accent">Nesta edição</p>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar sumário"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-edition-ink-2 transition hover:bg-edition-sheet-muted"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {totalLabel && (
          <p className="border-b border-edition-line/60 px-5 py-2 text-[13px] text-edition-muted">{totalLabel}</p>
        )}

        <ol className="max-h-[58vh] overflow-y-auto px-2 py-2">
          {matters.map((m, i) => (
            <li key={m.anchorId}>
              <a
                href={`#${m.anchorId}`}
                onClick={close}
                className="flex items-baseline gap-3 rounded-lg px-3 py-3 transition hover:bg-edition-sheet-muted"
              >
                <span aria-hidden="true" className="shrink-0 text-[11px] font-semibold tabular-nums text-edition-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold leading-snug text-edition-ink">{m.title}</span>
                  {m.section && (
                    <span className="mt-0.5 block text-[12px] text-edition-muted">{m.section}</span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </dialog>
    </>
  );
}
