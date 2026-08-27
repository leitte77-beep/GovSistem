"use client";

import { categoriaRotulo, gravidadeInfo, origemInfo, statusInfo } from "@/lib/ocorrencias";

export function BadgeGravidade({ gravidade }: { gravidade: string | null | undefined }) {
  const info = gravidadeInfo(gravidade);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${info.classe}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.cor}`} />
      {info.rotulo}
    </span>
  );
}

export function BadgeStatus({ status }: { status: string | null | undefined }) {
  const info = statusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${info.classe}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.cor}`} />
      {info.rotulo}
    </span>
  );
}

export function BadgeCategoria({ categoria }: { categoria: string | null | undefined }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-container-high px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
      {categoriaRotulo(categoria)}
    </span>
  );
}

export function BadgeOrigem({ origem }: { origem: string | null | undefined }) {
  const info = origemInfo(origem);
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${info.classe}`}>
      {info.rotulo}
    </span>
  );
}
