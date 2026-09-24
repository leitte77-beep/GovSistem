"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Shell de drawer lateral reutilizável (padrão VeiculoFormDrawer). */
export function Drawer({
  aberto,
  onClose,
  titulo,
  children,
  rodape,
  largura = "max-w-2xl",
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: string;
}) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative flex h-full w-full ${largura} flex-col bg-white shadow-elevated`}>
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <h2 className="text-h3 text-text-title">{titulo}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {rodape && (
          <div className="flex items-center justify-end gap-2 border-t border-surface-border px-6 py-4">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-label font-semibold text-text-title">{titulo}</h3>
      {children}
    </section>
  );
}

export function Label({ texto, children, classe }: { texto: string; children: React.ReactNode; classe?: string }) {
  return (
    <label className={`text-meta ${classe ?? ""}`}>
      {texto}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function Modal({
  aberto,
  onClose,
  titulo,
  children,
  rodape,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-card border border-surface-border bg-white p-5 shadow-elevated">
        <div className="flex items-center justify-between">
          <h3 className="text-h3 text-text-title">{titulo}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {rodape && <div className="mt-5 flex items-center justify-end gap-2">{rodape}</div>}
      </div>
    </div>
  );
}

export function ConfirmarModal({
  aberto,
  onClose,
  titulo,
  descricao,
  onConfirmar,
  confirmarLabel = "Confirmar",
  perigo = false,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  descricao: string;
  onConfirmar: () => void | Promise<void>;
  confirmarLabel?: string;
  perigo?: boolean;
}) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo={titulo}
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button
            type="button"
            className={perigo ? "btn btn-danger" : "btn btn-primary"}
            disabled={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await onConfirmar();
                onClose();
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Salvando…" : confirmarLabel}
          </button>
        </>
      }
    >
      <p className="text-body-sm text-text-body">{descricao}</p>
    </Modal>
  );
}
