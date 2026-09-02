"use client";

import { useRef } from "react";
import type { Authenticity } from "@/lib/edition-types";
import { AuthenticityRows } from "./EditionStatus";

export type EditionAuthSheetProps = {
  authenticity?: Authenticity | null;
};

/**
 * On-demand technical authenticity details, opened in an accessible drawer /
 * bottom-sheet. This keeps cryptographic internals away from the reading
 * flow — they exist for those who look for them, not for everyone always.
 */
export default function EditionAuthSheet({ authenticity }: EditionAuthSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  if (!authenticity) return null;

  const open = () => ref.current?.showModal?.();
  const close = () => ref.current?.close?.();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="no-print inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">tune</span>
        Detalhes técnicos
      </button>

      <dialog
        ref={ref}
        onClose={close}
        className="m-0 max-h-[92vh] w-full max-w-full rounded-t-[20px] bg-edition-sheet p-0 text-edition-ink backdrop:bg-black/35 sm:mx-auto sm:my-auto sm:max-w-2xl sm:rounded-[20px] sm:shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-edition-line bg-edition-sheet px-5 py-4 sm:px-7">
          <p className="text-sm font-bold text-edition-ink">Autenticidade técnica</p>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar detalhes técnicos"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-edition-ink-2 transition hover:bg-edition-sheet-muted"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-5 sm:px-7">
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-edition-sheet-muted px-4 py-3 text-[12.5px] leading-relaxed text-edition-ink-2">
            <span aria-hidden="true" className="material-symbols-outlined mt-px text-[16px] text-[var(--edition-accent)]">
              info
            </span>
            Itens em cinza são propriedades que não se aplicam a este documento ou que não foram
            atestadas — não representam erro.
          </p>
          <AuthenticityRows
            authenticity={authenticity}
            labelOverride={undefined}
            opened
          />
        </div>
      </dialog>
    </>
  );
}
