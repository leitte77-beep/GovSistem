import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { usePrenderFoco } from "./usePrenderFoco";

/**
 * Painel lateral acessível (usado pelo "Registrar atendimento" na Fase 4).
 * Foco preso, Esc fecha, retorno de foco ao abridor.
 */
export type SlideOverProps = {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  largura?: "md" | "lg";
  children: ReactNode;
  rodape?: ReactNode;
};

const LARGURA = { md: "max-w-md", lg: "max-w-xl" };

export function SlideOver({
  aberto,
  aoFechar,
  titulo,
  largura = "md",
  children,
  rodape,
}: SlideOverProps) {
  const ref = usePrenderFoco(aberto, aoFechar);
  const tituloId = useId();

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
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
        className={clsx(
          "absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-xl ring-1 ring-black/5 border-l border-black/5",
          LARGURA[largura],
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-soft/15 p-4">
          <h2 id={tituloId} className="text-lg">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded p-1 text-ink-soft hover:text-ink focus-visible:outline-focus"
            aria-label="Fechar"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {rodape && (
          <div className="flex justify-end gap-2 border-t border-ink-soft/15 p-4">{rodape}</div>
        )}
      </div>
    </div>
  );
}
