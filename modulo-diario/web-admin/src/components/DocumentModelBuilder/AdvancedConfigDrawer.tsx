"use client";

import { useEscapeKey } from "@/lib/useEscapeKey";
import type { DocumentLayout, DocumentModelConfig } from "@/types/document_model";

interface Props {
  open: boolean;
  onClose: () => void;
  config: DocumentModelConfig;
  layout: DocumentLayout;
}

export default function AdvancedConfigDrawer({ open, onClose, config, layout }: Props) {
  useEscapeKey(open, onClose);
  if (!open) return null;
  const json = JSON.stringify({ config, layout }, null, 2);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações avançadas (somente leitura)"
        className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Configurações avançadas</h2>
            <p className="text-xs text-gray-500">
              Estrutura interna (somente leitura). Gerada automaticamente pelo construtor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <pre className="flex-1 overflow-auto bg-gray-900 p-4 font-mono text-xs leading-relaxed text-gray-100">
          {json}
        </pre>
      </div>
    </div>
  );
}
