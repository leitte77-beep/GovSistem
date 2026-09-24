"use client";

import { situacaoInfo } from "@/lib/veiculos";

/** Badge de situação do veículo — usa cor E texto (não depende só de cor). */
export function StatusBadge({ situacao }: { situacao: string }) {
  const info = situacaoInfo(situacao);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-meta font-medium ${info.classe}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.cor}`} />
      {info.label}
    </span>
  );
}
