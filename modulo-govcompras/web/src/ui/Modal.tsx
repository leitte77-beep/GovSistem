import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface ModalProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: "sm" | "md" | "lg";
}

const LARGURAS = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

export function Modal({ aberto, aoFechar, titulo, descricao, children, rodape, largura = "md" }: ModalProps) {
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    referencia.current?.focus();
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={aoFechar} aria-hidden />
      <div
        ref={referencia}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        tabIndex={-1}
        className={`relative w-full ${LARGURAS[largura]} rounded-2xl bg-white shadow-xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="modal-titulo" className="text-sm font-semibold text-slate-900">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
          </div>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}
