"use client";

import { origemInfo, statusInfo } from "@/lib/abastecimentos";

export function BadgeStatus({ status }: { status: string | null | undefined }) {
  const info = statusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-success-vibrant/10 px-2.5 py-1 text-[11px] font-bold ${info.classe}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.cor}`} />
      {info.rotulo}
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
