"use client";

import { Plus, SlidersHorizontal } from "lucide-react";

interface EmptyStateProps {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  acao?: { label: string; onClick?: () => void; tipo?: "primary" | "secondary" };
  permissao?: boolean;
}

/** Estado vazio padronizado da área de veículos. */
export function EmptyState({ icon, titulo, descricao, acao, permissao = true }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-surface-border bg-white px-6 py-14 text-center shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
        {icon}
      </div>
      <h2 className="text-h3 text-text-title">{titulo}</h2>
      <p className="max-w-md text-body-sm text-text-subtle">{descricao}</p>
      {acao && permissao && (
        <button
          className={acao.tipo === "secondary" ? "btn btn-secondary mt-3" : "btn btn-primary mt-3"}
          onClick={acao.onClick}
        >
          {acao.tipo === "secondary" ? <SlidersHorizontal size={16} /> : <Plus size={16} />}
          {acao.label}
        </button>
      )}
    </div>
  );
}
