import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { usePrenderFoco } from "./usePrenderFoco";

export type ModalProps = {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  tamanho?: "sm" | "md" | "lg";
  children: ReactNode;
  rodape?: ReactNode;
};

const LARGURA = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  tamanho = "md",
  children,
  rodape,
}: ModalProps) {
  const ref = usePrenderFoco(aberto, aoFechar);
  const tituloId = useId();
  const descId = useId();

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={aoFechar}
        tabIndex={-1}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descId : undefined}
        className={clsx(
          "relative z-10 w-full rounded-2xl bg-white shadow-xl ring-1 ring-black/5 border border-black/5",
          LARGURA[tamanho],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-soft/15 p-4">
          <div>
            <h2 id={tituloId} className="text-lg">
              {titulo}
            </h2>
            {descricao && (
              <p id={descId} className="mt-1 text-sm text-ink-soft">
                {descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded p-1 text-ink-soft hover:text-ink focus-visible:outline-focus"
            aria-label="Fechar"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {rodape && (
          <div className="flex justify-end gap-2 border-t border-ink-soft/15 p-4">{rodape}</div>
        )}
      </div>
    </div>
  );
}
